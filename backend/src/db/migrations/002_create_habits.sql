-- =============================================================
-- МИГРАЦИЯ 002: Таблица привычек
-- =============================================================
-- Метафора: это "список задач на тренировке".
-- Каждая привычка принадлежит конкретному пользователю.
-- Удаляем не по-настоящему — просто помечаем archived=TRUE,
-- чтобы история выполнений не пропала.
-- =============================================================

CREATE TABLE IF NOT EXISTS habits (
    id              SERIAL PRIMARY KEY,

    -- Привязка к пользователю.
    -- ON DELETE CASCADE: если пользователь удалён — его привычки тоже удаляются.
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    emoji           TEXT NOT NULL DEFAULT '⭐',
    color           TEXT NOT NULL DEFAULT '#2AABEE',  -- hex-цвет для heatmap

    -- Секция дня: в какое время дня обычно выполняется привычка.
    -- Используется для группировки на главном экране.
    -- 'morning' | 'evening' | 'any'
    section         TEXT NOT NULL DEFAULT 'any'
                    CHECK (section IN ('morning', 'evening', 'any')),

    -- Частота: ежедневно или в конкретные дни недели
    -- 'daily'  — каждый день (frequency_days = NULL)
    -- 'weekly' — только выбранные дни (frequency_days = ['mon','wed','fri'])
    frequency_type  TEXT NOT NULL DEFAULT 'daily'
                    CHECK (frequency_type IN ('daily', 'weekly')),

    -- Массив дней недели для weekly-привычек
    -- Допустимые значения: 'mon','tue','wed','thu','fri','sat','sun'
    -- Для daily — всегда NULL
    frequency_days  TEXT[],

    -- Количество доступных "заморозок" серии (фича v1.1)
    -- Заморозка позволяет пропустить 1 день без потери streak
    freeze_count    INTEGER NOT NULL DEFAULT 0,

    -- Порядок отображения в списке (drag & drop)
    sort_order      INTEGER NOT NULL DEFAULT 0,

    -- Архив вместо физического удаления.
    -- При is_archived=TRUE привычка не показывается в интерфейсе,
    -- но история completions сохраняется.
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at     TIMESTAMP WITH TIME ZONE,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
-- Главный запрос: "все активные привычки пользователя X"
CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON habits(user_id)
    WHERE is_archived = FALSE;

-- Для сортировки внутри пользователя
CREATE INDEX IF NOT EXISTS idx_habits_user_order
    ON habits(user_id, sort_order);

-- Проверка: frequency_days обязателен если frequency_type = 'weekly'
ALTER TABLE habits ADD CONSTRAINT chk_frequency_days
    CHECK (
        (frequency_type = 'daily' AND frequency_days IS NULL)
        OR
        (frequency_type = 'weekly' AND frequency_days IS NOT NULL AND array_length(frequency_days, 1) > 0)
    );
