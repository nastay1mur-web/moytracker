-- =============================================================
-- МИГРАЦИЯ 003: Таблица напоминаний
-- =============================================================
-- Метафора: это "будильники" для каждой привычки.
-- У привычки "Вода" может быть три будильника: 08:00, 12:00, 18:00.
-- Каждый будильник — отдельная строка в этой таблице.
--
-- Cron-задача каждую минуту смотрит: "Сейчас 08:00.
-- Кому нужно отправить напоминание?" — и находит здесь ответ.
-- =============================================================

CREATE TABLE IF NOT EXISTS reminders (
    id          SERIAL PRIMARY KEY,

    -- Привязка к привычке.
    -- ON DELETE CASCADE: удалили привычку — все её будильники тоже удаляются.
    habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,

    -- Время в формате "HH:MM" (24-часовой формат)
    -- Примеры: "06:00", "08:00", "19:00"
    time        TEXT NOT NULL,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Уникальность: одно и то же время нельзя добавить дважды для одной привычки
    UNIQUE(habit_id, time)
);

-- Индекс по habit_id — для запроса "все напоминания привычки X"
CREATE INDEX IF NOT EXISTS idx_reminders_habit_id ON reminders(habit_id);

-- Индекс по времени — для cron-запроса "все напоминания в 08:00"
-- Это самый важный индекс: cron бежит каждую минуту
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(time);

-- Проверка формата времени: только "HH:MM"
ALTER TABLE reminders ADD CONSTRAINT chk_time_format
    CHECK (time ~ '^\d{2}:\d{2}$');
