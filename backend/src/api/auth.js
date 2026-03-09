const crypto = require('crypto');
const db     = require('../db');

// ─────────────────────────────────────────────────────────────
// Верификация Telegram initData (HMAC-SHA256)
//
// Метафора: Telegram — это охранник на входе. Он выдаёт пользователю
// пропуск (initData) с печатью (hash). Мы проверяем печать:
// если подделана — не пускаем. Если настоящая — создаём запись.
//
// Алгоритм из официальной документации Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ─────────────────────────────────────────────────────────────

function verifyInitData(rawInitData, botToken) {
    const params   = new URLSearchParams(rawInitData);
    const hash     = params.get('hash');
    if (!hash) return false;

    params.delete('hash');

    // Шаг 1: отсортировать параметры и собрать строку "key=value\nkey=value"
    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    // Шаг 2: secretKey = HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    // Шаг 3: expectedHash = HMAC-SHA256(dataCheckString, secretKey)
    const expectedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return expectedHash === hash;
}

// ─────────────────────────────────────────────────────────────
// Middleware: вешается на все защищённые роуты
// Ожидает заголовок: Authorization: tg-initdata <rawInitData>
// ─────────────────────────────────────────────────────────────
async function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];

    if (!header || !header.startsWith('tg-initdata ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const rawInitData = header.slice('tg-initdata '.length);

    // В development-режиме пропускаем проверку подписи
    // (удобно для тестирования через Postman без реального Telegram)
    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev && !verifyInitData(rawInitData, process.env.BOT_TOKEN)) {
        return res.status(401).json({ error: 'Invalid initData signature' });
    }

    // Парсим данные пользователя из initData
    let telegramUser;
    try {
        const params = new URLSearchParams(rawInitData);
        const userStr = params.get('user');

        if (!userStr) {
            return res.status(401).json({ error: 'No user in initData' });
        }
        telegramUser = JSON.parse(userStr);
    } catch (e) {
        return res.status(401).json({ error: 'Invalid user data in initData' });
    }

    // Получаем или создаём пользователя в БД
    try {
        const { rows } = await db.query(`
            INSERT INTO users (telegram_id, first_name, last_name, username)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (telegram_id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name  = EXCLUDED.last_name,
                username   = EXCLUDED.username,
                updated_at = NOW()
            RETURNING *
        `, [
            telegramUser.id,
            telegramUser.first_name,
            telegramUser.last_name  || null,
            telegramUser.username   || null,
        ]);

        req.telegramUser = telegramUser;  // сырые данные от Telegram
        req.user         = rows[0];       // объект из таблицы users
        next();
    } catch (e) {
        console.error('[Auth] DB error:', e.message);
        res.status(500).json({ error: 'Auth database error' });
    }
}

module.exports = { authMiddleware, verifyInitData };
