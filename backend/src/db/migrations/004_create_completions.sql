-- =============================================================
-- МИГРАЦИЯ 004: Таблица выполнений
-- =============================================================
-- Метафора: это "журнал отметок" — как дневник посещаемости в школе.
-- Каждый раз когда пользователь нажимает "Готово" —
-- появляется новая строка: "Привычка 5, выполнена 2026-03-07".
--
-- Один раз в день = одна строка. Нажал второй раз — не дублируется,
-- потому что стоит UNIQUE(habit_id, completed_date).
-- =============================================================

CREATE TABLE IF NOT EXISTS completions (
    id              SERIAL PRIMARY KEY,

    -- Привязка к привычке.
    -- ON DELETE CASCADE: удалили привычку — её история тоже удаляется.
    habit_id        INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,

    -- Дата выполнения. Тип DATE (без времени) — важно:
    -- нас не интересует в какое время нажали, только ДЕНЬ.
    completed_date  DATE NOT NULL,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Главное ограничение: одна запись на привычку в день
    UNIQUE(habit_id, completed_date)
);

-- Составной индекс: "выполнена ли привычка X в дату Y?"
-- Используется при каждом открытии главного экрана
CREATE INDEX IF NOT EXISTS idx_completions_habit_date
    ON completions(habit_id, completed_date);

-- Индекс только по дате — для статистики "все выполнения за неделю"
CREATE INDEX IF NOT EXISTS idx_completions_date
    ON completions(completed_date);
