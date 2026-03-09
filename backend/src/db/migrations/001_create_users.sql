-- =============================================================
-- МИГРАЦИЯ 001: Таблица пользователей
-- =============================================================
-- Метафора: это "личная карточка" каждого пользователя.
-- Telegram говорит нам: "Пришёл Иван, id=12345" —
-- мы ищем карточку Ивана. Нет карточки — создаём новую.
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL PRIMARY KEY,

    -- Уникальный ID пользователя в Telegram (число, не текст)
    telegram_id             BIGINT UNIQUE NOT NULL,

    first_name              TEXT NOT NULL,
    last_name               TEXT,
    username                TEXT,             -- @handle без @
    language_code           TEXT DEFAULT 'ru',

    -- Прошёл ли пользователь онбординг (3 стартовых слайда)
    is_onboarded            BOOLEAN DEFAULT FALSE,

    -- Настройки в формате JSON — храним одним полем,
    -- чтобы не добавлять новую колонку при каждом новом параметре
    settings                JSONB NOT NULL DEFAULT '{
        "notifications": true,
        "week_start": "monday",
        "theme": "system"
    }',

    -- Подписка
    -- 'free'    — бесплатный тариф, до 3 привычек
    -- 'active'  — платная подписка активна
    -- 'expired' — подписка истекла, откат к free-ограничениям
    subscription_status     TEXT NOT NULL DEFAULT 'free'
                            CHECK (subscription_status IN ('free', 'active', 'expired')),

    subscription_expires_at TIMESTAMP WITH TIME ZONE,

    -- Сколько привычек разрешено добавить
    -- free=3, active=999 (фактически безлимит)
    habits_limit            INTEGER NOT NULL DEFAULT 3,

    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс по telegram_id — самый частый запрос ("найди пользователя по Telegram ID")
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Функция автоматического обновления updated_at при изменении строки
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
