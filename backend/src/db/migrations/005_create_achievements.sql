-- =============================================================
-- МИГРАЦИЯ 005: Таблица достижений
-- =============================================================
-- Метафора: это "доска почёта".
-- Когда у пользователя серия дошла до 7 дней — вешаем медаль.
-- Одна медаль одного типа = один раз. Второй раз не вешаем,
-- потому что UNIQUE(habit_id, type).
--
-- Бот автоматически пишет поздравление в чат при получении медали.
-- =============================================================

CREATE TABLE IF NOT EXISTS achievements (
    id          SERIAL PRIMARY KEY,

    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,

    -- Тип достижения:
    -- 'streak_7'   — серия 7 дней подряд
    -- 'streak_30'  — серия 30 дней подряд
    -- 'streak_100' — серия 100 дней подряд
    type        TEXT NOT NULL
                CHECK (type IN ('streak_7', 'streak_30', 'streak_100')),

    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Защита от дублирования: одно достижение одного типа на привычку
    UNIQUE(habit_id, type)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_habit_id ON achievements(habit_id);
