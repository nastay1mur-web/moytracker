const cron = require('node-cron');
const db   = require('../db');
const { reminderMessage, weeklyReport } = require('../lib/messages');
const { calculateStreak } = require('../lib/streak');

// ─────────────────────────────────────────────────────────────
// SQL: найти всех пользователей с напоминанием в данное время,
// у которых привычка запланирована на сегодня и ещё не выполнена
// ─────────────────────────────────────────────────────────────
const REMINDER_QUERY = `
    SELECT
        u.telegram_id,
        u.first_name,
        h.id        AS habit_id,
        h.name      AS habit_name,
        h.emoji,
        h.frequency_type,
        h.frequency_days,
        r.time
    FROM reminders r
    JOIN habits h ON h.id = r.habit_id
    JOIN users  u ON u.id = h.user_id
    WHERE
        r.time = $1
        AND h.is_archived = FALSE
        AND (u.settings->>'notifications')::boolean = true
        AND (
            h.frequency_type = 'daily'
            OR (h.frequency_type = 'weekly' AND $2 = ANY(h.frequency_days))
        )
        AND NOT EXISTS (
            SELECT 1 FROM completions c
            WHERE c.habit_id = h.id
              AND c.completed_date = CURRENT_DATE
        )
`;

// ─────────────────────────────────────────────────────────────
// CRON 1: Напоминания — каждую минуту
// ─────────────────────────────────────────────────────────────
function startRemindersCron(bot) {
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        const time = [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
        ].join(':');

        const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
        const dayOfWeek = DAY_KEYS[now.getDay()];

        let rows;
        try {
            const result = await db.query(REMINDER_QUERY, [time, dayOfWeek]);
            rows = result.rows;
        } catch (e) {
            console.error('[Cron] DB query error:', e.message);
            return;
        }

        if (!rows.length) return;

        // Группируем по telegram_id: один пользователь — одно сообщение в минуту
        const byUser = {};
        for (const row of rows) {
            const key = String(row.telegram_id);
            if (!byUser[key]) byUser[key] = { firstName: row.first_name, habits: [] };
            byUser[key].habits.push(row);
        }

        // Отправляем сообщения
        for (const [telegramId, data] of Object.entries(byUser)) {
            // Добавляем streak к каждой привычке
            const habitsWithStreak = [];
            for (const h of data.habits) {
                const streak = await calculateStreak(h.habit_id);
                habitsWithStreak.push({ name: h.habit_name, emoji: h.emoji, streak });
            }

            const text = reminderMessage(time, habitsWithStreak);

            try {
                await bot.telegram.sendMessage(telegramId, text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '✅ Открыть трекер',
                            web_app: { url: process.env.WEBAPP_URL }
                        }]]
                    }
                });
                console.log(`[Cron] Напоминание ${time} → user ${telegramId} (${habitsWithStreak.length} привычек)`);
            } catch (e) {
                // Пользователь заблокировал бота
                if (e.code === 403 || (e.response && e.response.error_code === 403)) {
                    console.log(`[Cron] Пользователь ${telegramId} заблокировал бота — отключаем уведомления`);
                    await db.query(
                        `UPDATE users SET settings = settings || '{"notifications":false}'::jsonb
                         WHERE telegram_id = $1`,
                        [telegramId]
                    ).catch(() => {});
                } else {
                    console.error(`[Cron] Ошибка отправки ${telegramId}:`, e.message);
                }
            }
        }
    });

    console.log('[Cron] Планировщик напоминаний запущен');
}

// ─────────────────────────────────────────────────────────────
// CRON 2: Еженедельный итог — каждое воскресенье в 20:00
// ─────────────────────────────────────────────────────────────
function startWeeklyReportCron(bot) {
    cron.schedule('0 20 * * 0', async () => {
        console.log('[Cron] Запуск еженедельного отчёта...');

        const { rows: users } = await db.query(
            `SELECT id, telegram_id, first_name FROM users
             WHERE (settings->>'notifications')::boolean = true`
        ).catch(() => ({ rows: [] }));

        for (const user of users) {
            try {
                const { rows: habits } = await db.query(
                    `SELECT id, name, emoji, frequency_type, frequency_days
                     FROM habits WHERE user_id = $1 AND is_archived = FALSE`,
                    [user.id]
                );
                if (!habits.length) continue;

                const days = Array.from({length: 7}, (_, i) => {
                    const d = new Date(); d.setDate(d.getDate() - i);
                    return d.toISOString().slice(0, 10);
                });

                const { rows: comps } = await db.query(
                    `SELECT COUNT(*) as cnt FROM completions
                     WHERE habit_id = ANY($1) AND completed_date >= $2`,
                    [habits.map(h => h.id), days[6]]
                );

                const habitStats = [];
                for (const h of habits) {
                    const streak = await calculateStreak(h.id);
                    habitStats.push({ ...h, streak });
                }

                const pct = Math.round(
                    parseInt(comps[0].cnt) / (habits.length * 7) * 100
                );

                const text = weeklyReport(user.first_name, {
                    completion_pct:    pct,
                    total_completions: parseInt(comps[0].cnt),
                    habits:            habitStats,
                });

                await bot.telegram.sendMessage(user.telegram_id, text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '📊 Подробная статистика',
                            web_app: { url: process.env.WEBAPP_URL }
                        }]]
                    }
                });
            } catch (e) {
                if (e.code === 403) {
                    await db.query(
                        `UPDATE users SET settings = settings || '{"notifications":false}'::jsonb
                         WHERE telegram_id = $1`, [user.telegram_id]
                    ).catch(() => {});
                }
            }
        }

        console.log(`[Cron] Еженедельный отчёт отправлен ${users.length} пользователям`);
    });

    console.log('[Cron] Планировщик еженедельного отчёта запущен (вс 20:00)');
}

// ─────────────────────────────────────────────────────────────
// CRON 3: Проверка истёкших подписок — каждый день в 01:00
// ─────────────────────────────────────────────────────────────
function startSubscriptionCron(bot) {
    cron.schedule('0 1 * * *', async () => {
        // Уведомляем за 3 дня до истечения
        const { rows: expiringSoon } = await db.query(`
            SELECT telegram_id, first_name,
                   EXTRACT(DAY FROM subscription_expires_at - NOW())::int AS days_left
            FROM users
            WHERE subscription_status = 'active'
              AND subscription_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
        `).catch(() => ({ rows: [] }));

        for (const u of expiringSoon) {
            await bot.telegram.sendMessage(
                u.telegram_id,
                `⚠️ ${u.first_name}, подписка истекает через ${u.days_left} дн.\n\nПосле окончания будут доступны только 3 привычки.`,
                {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '💳 Продлить за 100 ₽',
                            web_app: { url: process.env.WEBAPP_URL }
                        }]]
                    }
                }
            ).catch(() => {});
        }

        // Снимаем подписку у истёкших
        const { rows: expired } = await db.query(`
            UPDATE users SET
                subscription_status = 'expired',
                habits_limit = 3
            WHERE subscription_status = 'active'
              AND subscription_expires_at < NOW()
            RETURNING telegram_id, first_name
        `).catch(() => ({ rows: [] }));

        for (const u of expired) {
            await bot.telegram.sendMessage(
                u.telegram_id,
                `${u.first_name}, подписка закончилась.\n\nТвои данные и история в сохранности.\nДоступны первые 3 привычки.`,
                {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '💳 Продлить за 100 ₽',
                            web_app: { url: process.env.WEBAPP_URL }
                        }]]
                    }
                }
            ).catch(() => {});
        }

        if (expired.length) {
            console.log(`[Cron] Подписка истекла у ${expired.length} пользователей`);
        }
    });

    console.log('[Cron] Планировщик подписок запущен (01:00 каждый день)');
}

module.exports = { startRemindersCron, startWeeklyReportCron, startSubscriptionCron };
