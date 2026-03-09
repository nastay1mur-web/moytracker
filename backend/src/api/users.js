const express = require('express');
const db      = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/users/me
//
// Первый запрос при каждом открытии Mini App.
// authMiddleware автоматически создаёт пользователя если его нет.
// Возвращает полный профиль: подписка, лимиты, настройки.
// ─────────────────────────────────────────────────────────────
router.post('/me', authMiddleware, async (req, res) => {
    const u = req.user;
    res.json({
        id:                     u.id,
        telegram_id:            u.telegram_id,
        first_name:             u.first_name,
        last_name:              u.last_name,
        username:               u.username,
        is_onboarded:           u.is_onboarded,
        subscription_status:    u.subscription_status,
        subscription_expires_at:u.subscription_expires_at,
        habits_limit:           u.habits_limit,
        settings:               u.settings,
    });
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/users/settings
//
// Обновление настроек: уведомления, тема, начало недели, онбординг.
// Принимает только те поля что переданы — остальные не трогает.
// ─────────────────────────────────────────────────────────────
router.patch('/settings', authMiddleware, async (req, res) => {
    const allowed = ['notifications', 'week_start', 'theme', 'is_onboarded'];
    const body    = req.body || {};

    // Разделяем: is_onboarded — колонка users, остальное — в settings JSONB
    const { is_onboarded, ...settingsFields } = body;

    // Фильтруем только разрешённые поля для JSONB
    const newSettings = {};
    for (const key of Object.keys(settingsFields)) {
        if (allowed.includes(key)) newSettings[key] = settingsFields[key];
    }

    try {
        // Если нужно обновить is_onboarded — обновляем колонку
        if (typeof is_onboarded === 'boolean') {
            await db.query(
                'UPDATE users SET is_onboarded = $1 WHERE id = $2',
                [is_onboarded, req.user.id]
            );
        }

        // Если есть изменения в JSONB-настройках — мержим с текущими
        if (Object.keys(newSettings).length > 0) {
            await db.query(
                `UPDATE users
                 SET settings = settings || $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify(newSettings), req.user.id]
            );
        }

        res.json({ ok: true });
    } catch (e) {
        console.error('[Users] settings error:', e.message);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
