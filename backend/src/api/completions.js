const express = require('express');
const db      = require('../db');
const { authMiddleware }                  = require('./auth');
const { calculateStreak, checkAchievements } = require('../lib/streak');

const router = express.Router();
router.use(authMiddleware);

// Получаем бот из глобального контекста (будет подключён после запуска бота)
function getBot() {
    try { return require('../bot').bot; } catch(e) { return null; }
}

// ─────────────────────────────────────────────────────────────
// POST /api/completions
// Отметить привычку выполненной сегодня.
// После отметки проверяем достижения (streak 7/30/100).
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { habit_id, date } = req.body || {};

    if (!habit_id) {
        return res.status(400).json({ error: 'habit_id is required' });
    }

    // Дата: если не передана — сегодня
    const completedDate = date || new Date().toISOString().slice(0, 10);

    // Валидация формата даты
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    try {
        // Проверяем что привычка принадлежит пользователю
        const { rows: habitRows } = await db.query(
            'SELECT id FROM habits WHERE id = $1 AND user_id = $2 AND is_archived = FALSE',
            [habit_id, req.user.id]
        );
        if (!habitRows.length) {
            return res.status(404).json({ error: 'Habit not found' });
        }

        // Вставляем выполнение. ON CONFLICT DO NOTHING — идемпотентно:
        // нажал два раза — вторая запись просто игнорируется
        await db.query(`
            INSERT INTO completions (habit_id, completed_date)
            VALUES ($1, $2)
            ON CONFLICT (habit_id, completed_date) DO NOTHING
        `, [habit_id, completedDate]);

        // Считаем актуальный streak
        const streak = await calculateStreak(habit_id);

        // Проверяем достижения (7, 30, 100 дней)
        const achievement = await checkAchievements(habit_id, req.user.id, getBot());

        res.json({
            ok:          true,
            streak,
            achievement, // null или { type: 'streak_7', days: 7 }
        });
    } catch (e) {
        console.error('[Completions] POST error:', e.message);
        res.status(500).json({ error: 'Failed to save completion' });
    }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/completions
// Снять отметку о выполнении.
// ─────────────────────────────────────────────────────────────
router.delete('/', async (req, res) => {
    const { habit_id, date } = req.body || {};

    if (!habit_id) {
        return res.status(400).json({ error: 'habit_id is required' });
    }

    const completedDate = date || new Date().toISOString().slice(0, 10);

    try {
        // Проверяем владельца через JOIN
        const { rowCount } = await db.query(`
            DELETE FROM completions
            WHERE habit_id = $1
              AND completed_date = $2
              AND habit_id IN (
                  SELECT id FROM habits WHERE user_id = $3
              )
        `, [habit_id, completedDate, req.user.id]);

        if (!rowCount) {
            return res.status(404).json({ error: 'Completion not found' });
        }

        const streak = await calculateStreak(habit_id);
        res.json({ ok: true, streak });
    } catch (e) {
        console.error('[Completions] DELETE error:', e.message);
        res.status(500).json({ error: 'Failed to remove completion' });
    }
});

module.exports = router;
