const express = require('express');
const db      = require('../db');
const { authMiddleware }    = require('./auth');
const { calculateStreak }   = require('../lib/streak');

const router = express.Router();

// Все роуты требуют авторизации
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────
// GET /api/habits
// Список всех активных привычек пользователя.
// Каждая привычка содержит: напоминания, streak, is_done_today.
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const userId  = req.user.id;
        const today   = new Date().toISOString().slice(0, 10);

        // Загружаем привычки с напоминаниями одним запросом через JSON_AGG
        const { rows } = await db.query(`
            SELECT
                h.id,
                h.name,
                h.emoji,
                h.color,
                h.section,
                h.frequency_type,
                h.frequency_days,
                h.sort_order,
                h.created_at,
                -- Напоминания: собираем в массив, сортируем
                COALESCE(
                    (SELECT json_agg(r.time ORDER BY r.time)
                     FROM reminders r WHERE r.habit_id = h.id),
                    '[]'
                ) AS reminders,
                -- Выполнена ли сегодня
                EXISTS(
                    SELECT 1 FROM completions c
                    WHERE c.habit_id = h.id AND c.completed_date = $2
                ) AS is_done_today
            FROM habits h
            WHERE h.user_id = $1
              AND h.is_archived = FALSE
            ORDER BY h.sort_order ASC, h.created_at ASC
        `, [userId, today]);

        // Добавляем streak (отдельный запрос на каждую привычку — приемлемо для MVP)
        const result = [];
        for (const habit of rows) {
            const streak = await calculateStreak(habit.id);
            result.push({ ...habit, streak });
        }

        res.json(result);
    } catch (e) {
        console.error('[Habits] GET error:', e.message);
        res.status(500).json({ error: 'Failed to load habits' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/habits
// Создать новую привычку.
// Проверяет лимит для free-тарифа.
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        name,
        emoji          = '⭐',
        color          = '#2AABEE',
        section        = 'any',
        frequency_type = 'daily',
        frequency_days = null,
        reminders      = [],
    } = req.body || {};

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
    }

    // Валидация frequency
    if (!['daily', 'weekly'].includes(frequency_type)) {
        return res.status(400).json({ error: 'Invalid frequency_type' });
    }
    if (frequency_type === 'weekly' && (!Array.isArray(frequency_days) || frequency_days.length === 0)) {
        return res.status(400).json({ error: 'frequency_days required for weekly habits' });
    }

    try {
        const userId = req.user.id;

        // Проверяем лимит привычек
        const { rows: countRows } = await db.query(
            'SELECT COUNT(*) as cnt FROM habits WHERE user_id = $1 AND is_archived = FALSE',
            [userId]
        );
        const currentCount = parseInt(countRows[0].cnt, 10);

        if (currentCount >= req.user.habits_limit) {
            return res.status(403).json({
                error:            'habits_limit_reached',
                message:          `На бесплатном тарифе можно добавить не более ${req.user.habits_limit} привычек`,
                current_count:    currentCount,
                limit:            req.user.habits_limit,
                upgrade_available: true,
            });
        }

        // Определяем sort_order: в конец списка
        const { rows: orderRows } = await db.query(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM habits WHERE user_id = $1',
            [userId]
        );
        const sortOrder = orderRows[0].next_order;

        // Создаём привычку
        const { rows } = await db.query(`
            INSERT INTO habits
                (user_id, name, emoji, color, section, frequency_type, frequency_days, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            userId,
            name.trim(),
            emoji,
            color,
            section,
            frequency_type,
            frequency_type === 'weekly' ? frequency_days : null,
            sortOrder,
        ]);

        const habit = rows[0];

        // Создаём напоминания если переданы
        if (reminders.length > 0) {
            const reminderValues = reminders
                .slice(0, 12) // максимум 12
                .filter(t => /^\d{2}:\d{2}$/.test(t));

            for (const time of reminderValues) {
                await db.query(
                    'INSERT INTO reminders (habit_id, time) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [habit.id, time]
                );
            }
        }

        // Возвращаем привычку с напоминаниями и streak=0
        res.status(201).json({
            ...habit,
            reminders:    reminders.filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 12),
            streak:       0,
            is_done_today: false,
        });
    } catch (e) {
        console.error('[Habits] POST error:', e.message);
        res.status(500).json({ error: 'Failed to create habit' });
    }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/habits/:id
// Редактировать привычку. Только свою.
// ─────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
    const habitId = parseInt(req.params.id, 10);

    // Проверяем что привычка принадлежит этому пользователю
    const { rows: checkRows } = await db.query(
        'SELECT id FROM habits WHERE id = $1 AND user_id = $2 AND is_archived = FALSE',
        [habitId, req.user.id]
    );
    if (!checkRows.length) {
        return res.status(404).json({ error: 'Habit not found' });
    }

    const {
        name,
        emoji,
        color,
        section,
        frequency_type,
        frequency_days,
        reminders,
    } = req.body || {};

    try {
        // Собираем только те поля что переданы
        const updates = [];
        const values  = [];
        let idx = 1;

        if (name  !== undefined) { updates.push(`name = $${idx++}`);  values.push(name.trim()); }
        if (emoji !== undefined) { updates.push(`emoji = $${idx++}`); values.push(emoji); }
        if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }
        if (section !== undefined) { updates.push(`section = $${idx++}`); values.push(section); }

        if (frequency_type !== undefined) {
            updates.push(`frequency_type = $${idx++}`);
            values.push(frequency_type);
            updates.push(`frequency_days = $${idx++}`);
            values.push(frequency_type === 'weekly' ? frequency_days : null);
        }

        if (updates.length > 0) {
            values.push(habitId);
            await db.query(
                `UPDATE habits SET ${updates.join(', ')} WHERE id = $${idx}`,
                values
            );
        }

        // Обновляем напоминания если переданы
        if (Array.isArray(reminders)) {
            await db.query('DELETE FROM reminders WHERE habit_id = $1', [habitId]);
            for (const time of reminders.filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 12)) {
                await db.query(
                    'INSERT INTO reminders (habit_id, time) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [habitId, time]
                );
            }
        }

        // Возвращаем обновлённую привычку
        const { rows } = await db.query(`
            SELECT h.*,
                COALESCE(
                    (SELECT json_agg(r.time ORDER BY r.time) FROM reminders r WHERE r.habit_id = h.id),
                    '[]'
                ) AS reminders
            FROM habits h WHERE h.id = $1
        `, [habitId]);

        const streak = await calculateStreak(habitId);
        res.json({ ...rows[0], streak });
    } catch (e) {
        console.error('[Habits] PATCH error:', e.message);
        res.status(500).json({ error: 'Failed to update habit' });
    }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/habits/:id
// Архивировать привычку (не физическое удаление).
// История completions сохраняется.
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const habitId = parseInt(req.params.id, 10);

    const { rowCount } = await db.query(
        `UPDATE habits SET is_archived = TRUE, archived_at = NOW()
         WHERE id = $1 AND user_id = $2 AND is_archived = FALSE`,
        [habitId, req.user.id]
    );

    if (!rowCount) {
        return res.status(404).json({ error: 'Habit not found' });
    }

    res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/habits/reorder
// Изменить порядок привычек в списке.
// ─────────────────────────────────────────────────────────────
router.patch('/reorder', async (req, res) => {
    const { order } = req.body || {};
    if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array of habit IDs' });
    }

    try {
        for (let i = 0; i < order.length; i++) {
            await db.query(
                'UPDATE habits SET sort_order = $1 WHERE id = $2 AND user_id = $3',
                [i, order[i], req.user.id]
            );
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('[Habits] reorder error:', e.message);
        res.status(500).json({ error: 'Failed to reorder habits' });
    }
});

module.exports = router;
