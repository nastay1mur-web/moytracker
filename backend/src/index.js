require('dotenv').config();

const express = require('express');
const app = express();

// ── Базовые middleware ────────────────────────────────────────
app.use(express.json());

// CORS: разрешаем запросы с фронтенда на Vercel
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.WEBAPP_URL || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Health check (для UptimeRobot — чтобы сервер не засыпал) ──
app.get('/health', (req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
});

// ── API роутер ────────────────────────────────────────────────
const apiRouter = require('./api/router');
app.use('/api', apiRouter);

// ── Telegram Bot + Cron ──────────────────────────────────────
const { bot } = require('./bot');
const { startRemindersCron, startWeeklyReportCron, startSubscriptionCron } = require('./cron/reminders');

bot.launch().then(() => {
    console.log('[Bot] Запущен:', bot.botInfo?.username);
    startRemindersCron(bot);
    startWeeklyReportCron(bot);
    startSubscriptionCron(bot);
}).catch(e => {
    console.error('[Bot] Ошибка запуска:', e.message);
});

// ── Запуск сервера ────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`[Server] Запущен на порту ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Остановка...');
    process.exit(0);
});
