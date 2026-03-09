-- =============================================================
-- МАСТЕР-СКРИПТ: запускать этот файл в Supabase SQL Editor
-- =============================================================
-- Он включает все 6 миграций в правильном порядке.
-- Порядок важен: сначала users, потом habits (ссылается на users),
-- потом reminders (ссылается на habits) — и так далее.
-- Метафора: сначала строим фундамент, потом стены, потом крышу.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 001: ПОЛЬЗОВАТЕЛИ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL PRIMARY KEY,
    telegram_id             BIGINT UNIQUE NOT NULL,
    first_name              TEXT NOT NULL,
    last_name               TEXT,
    username                TEXT,
    language_code           TEXT DEFAULT 'ru',
    is_onboarded            BOOLEAN DEFAULT FALSE,
    settings                JSONB NOT NULL DEFAULT '{
        "notifications": true,
        "week_start": "monday",
        "theme": "system"
    }',
    subscription_status     TEXT NOT NULL DEFAULT 'free'
                            CHECK (subscription_status IN ('free', 'active', 'expired')),
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    habits_limit            INTEGER NOT NULL DEFAULT 3,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 002: ПРИВЫЧКИ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habits (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    emoji           TEXT NOT NULL DEFAULT '⭐',
    color           TEXT NOT NULL DEFAULT '#2AABEE',
    section         TEXT NOT NULL DEFAULT 'any'
                    CHECK (section IN ('morning', 'evening', 'any')),
    frequency_type  TEXT NOT NULL DEFAULT 'daily'
                    CHECK (frequency_type IN ('daily', 'weekly')),
    frequency_days  TEXT[],
    freeze_count    INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at     TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON habits(user_id) WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_habits_user_order
    ON habits(user_id, sort_order);

ALTER TABLE habits DROP CONSTRAINT IF EXISTS chk_frequency_days;
ALTER TABLE habits ADD CONSTRAINT chk_frequency_days
    CHECK (
        (frequency_type = 'daily' AND frequency_days IS NULL)
        OR
        (frequency_type = 'weekly' AND frequency_days IS NOT NULL AND array_length(frequency_days, 1) > 0)
    );


-- ─────────────────────────────────────────────────────────────
-- 003: НАПОМИНАНИЯ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reminders (
    id          SERIAL PRIMARY KEY,
    habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    time        TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(habit_id, time)
);

CREATE INDEX IF NOT EXISTS idx_reminders_habit_id ON reminders(habit_id);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(time);

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS chk_time_format;
ALTER TABLE reminders ADD CONSTRAINT chk_time_format
    CHECK (time ~ '^\d{2}:\d{2}$');


-- ─────────────────────────────────────────────────────────────
-- 004: ВЫПОЛНЕНИЯ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS completions (
    id              SERIAL PRIMARY KEY,
    habit_id        INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    completed_date  DATE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(habit_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_completions_habit_date
    ON completions(habit_id, completed_date);

CREATE INDEX IF NOT EXISTS idx_completions_date
    ON completions(completed_date);


-- ─────────────────────────────────────────────────────────────
-- 005: ДОСТИЖЕНИЯ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achievements (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    type        TEXT NOT NULL
                CHECK (type IN ('streak_7', 'streak_30', 'streak_100')),
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(habit_id, type)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_habit_id ON achievements(habit_id);


-- ─────────────────────────────────────────────────────────────
-- 006: ПЛАТЕЖИ
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
    id                          SERIAL PRIMARY KEY,
    user_id                     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount                      INTEGER NOT NULL,
    currency                    TEXT NOT NULL DEFAULT 'RUB',
    telegram_payment_charge_id  TEXT UNIQUE,
    provider_payment_charge_id  TEXT,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'success', 'failed')),
    period_start                TIMESTAMP WITH TIME ZONE,
    period_end                  TIMESTAMP WITH TIME ZONE,
    created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);


-- ─────────────────────────────────────────────────────────────
-- ПРАВА ДОСТУПА (Row Level Security — защита данных)
-- ─────────────────────────────────────────────────────────────
-- Supabase по умолчанию разрешает всем читать всё через REST API.
-- RLS закрывает прямой доступ — данные видны только через наш бэкенд.
-- Метафора: вешаем замок на дверь. Войти можно только с нашим ключом
-- (токеном сервисного аккаунта service_role), не через публичный вход.

ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;

-- Запрещаем всё для роли anon (анонимный публичный доступ)
-- Наш Express-бэкенд использует service_role — для него ограничений нет.

DROP POLICY IF EXISTS deny_anon_users        ON users;
DROP POLICY IF EXISTS deny_anon_habits       ON habits;
DROP POLICY IF EXISTS deny_anon_reminders    ON reminders;
DROP POLICY IF EXISTS deny_anon_completions  ON completions;
DROP POLICY IF EXISTS deny_anon_achievements ON achievements;
DROP POLICY IF EXISTS deny_anon_payments     ON payments;

CREATE POLICY deny_anon_users        ON users        FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_habits       ON habits       FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_reminders    ON reminders    FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_completions  ON completions  FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_achievements ON achievements FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_payments     ON payments     FOR ALL TO anon USING (false);


-- ─────────────────────────────────────────────────────────────
-- ФИНАЛЬНАЯ ПРОВЕРКА
-- После выполнения этого скрипта список таблиц должен быть:
-- users, habits, reminders, completions, achievements, payments
-- ─────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
