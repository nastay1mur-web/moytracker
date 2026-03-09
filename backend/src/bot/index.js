const { Telegraf } = require('telegraf');
const db           = require('../db');
const {
    welcomeMessage,
    helpMessage,
    weeklyReport,
} = require('../lib/messages');

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN не задан в .env');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─────────────────────────────────────────────────────────────
// Вспомогательная функция: получить или создать пользователя
// ─────────────────────────────────────────────────────────────
async function getOrCreateUser(tgUser) {
    const { rows } = await db.query(`
        INSERT INTO users (telegram_id, first_name, last_name, username)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name  = EXCLUDED.last_name,
            username   = EXCLUDED.username,
            updated_at = NOW()
        RETURNING *
    `, [tgUser.id, tgUser.first_name, tgUser.last_name || null, tgUser.username || null]);
    return rows[0];
}

// ─────────────────────────────────────────────────────────────
// /start — приветствие + кнопка открыть Mini App + инструкция
// ─────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
    try {
        await getOrCreateUser(ctx.from);

        await ctx.replyWithHTML(
            welcomeMessage(ctx.from.first_name),
            {
                reply_markup: {
                    inline_keyboard: [[{
                        text: '📱 Открыть трекер',
                        web_app: { url: process.env.WEBAPP_URL }
                    }]]
                }
            }
        );
    } catch (e) {
        console.error('[Bot] /start error:', e.message);
        await ctx.reply('Произошла ошибка. Попробуй ещё раз.');
    }
});

// ─────────────────────────────────────────────────────────────
// /help — полная инструкция
// ─────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(
        helpMessage(),
        {
            reply_markup: {
                inline_keyboard: [[{
                    text: '📱 Открыть трекер',
                    web_app: { url: process.env.WEBAPP_URL }
                }]]
            }
        }
    );
});

// ─────────────────────────────────────────────────────────────
// /stats — быстрая статистика в чате (без открытия Mini App)
// ─────────────────────────────────────────────────────────────
bot.command('stats', async (ctx) => {
    try {
        const { rows: userRows } = await db.query(
            'SELECT * FROM users WHERE telegram_id = $1', [ctx.from.id]
        );
        if (!userRows.length) {
            return ctx.reply('Сначала открой трекер — /start');
        }
        const user = userRows[0];

        // Загружаем привычки
        const { rows: habits } = await db.query(
            `SELECT id, name, emoji FROM habits WHERE user_id = $1 AND is_archived = FALSE`,
            [user.id]
        );

        if (!habits.length) {
            return ctx.replyWithHTML(
                `У тебя пока нет привычек.\n\n<a href="${process.env.WEBAPP_URL}">Добавить первую →</a>`
            );
        }

        // Считаем streak для каждой привычки
        const { calculateStreak } = require('../lib/streak');
        const habitStats = [];
        for (const h of habits) {
            const streak = await calculateStreak(h.id);
            habitStats.push({ ...h, streak });
        }

        // Статистика за 7 дней
        const days = Array.from({length: 7}, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            return d.toISOString().slice(0, 10);
        });
        const { rows: completions } = await db.query(`
            SELECT COUNT(*) as cnt FROM completions
            WHERE habit_id = ANY($1)
              AND completed_date >= $2
              AND completed_date <= $3
        `, [habits.map(h => h.id), days[6], days[0]]);

        const totalDone    = parseInt(completions[0].cnt, 10);
        const totalPlanned = habits.length * 7;
        const pct          = Math.round(totalDone / totalPlanned * 100);

        const streakLines = habitStats
            .sort((a, b) => b.streak - a.streak)
            .map(h => `${h.emoji} ${h.name} — 🔥${h.streak} дн.`)
            .join('\n');

        await ctx.replyWithHTML(
            `📊 <b>Твой прогресс за неделю:</b>\n\nВыполнено: <b>${pct}%</b>\n\n<b>Серии:</b>\n${streakLines}`,
            {
                reply_markup: {
                    inline_keyboard: [[{
                        text: '📱 Подробная статистика',
                        web_app: { url: process.env.WEBAPP_URL }
                    }]]
                }
            }
        );
    } catch (e) {
        console.error('[Bot] /stats error:', e.message);
        await ctx.reply('Не удалось загрузить статистику. Попробуй ещё раз.');
    }
});

// ─────────────────────────────────────────────────────────────
// Обработка неизвестных команд
// ─────────────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
    await ctx.replyWithHTML(
        `Используй команды:\n/start — главное меню\n/help — инструкция\n/stats — статистика`,
        {
            reply_markup: {
                inline_keyboard: [[{
                    text: '📱 Открыть трекер',
                    web_app: { url: process.env.WEBAPP_URL }
                }]]
            }
        }
    );
});

module.exports = { bot };
