const db = require('../db');

// ─────────────────────────────────────────────────────────────
// Расчёт streak (серия дней)
//
// Метафора: представь цепочку звеньев — каждый выполненный день
// добавляет звено. Первый пропущенный — цепочка рвётся.
// Считаем назад от сегодня: сегодня (если выполнено) или вчера,
// и идём всё дальше пока дни подряд выполнялись.
//
// Для weekly-привычек: пропущенные незапланированные дни
// не рвут серию — бассейн во вторник не ломает цепочку
// если бассейн запланирован пн/ср/пт.
// ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat'];

function toDateStr(date) {
    return date.toISOString().slice(0, 10);
}

// Проверяет: запланирована ли привычка на конкретный день
function isScheduled(habit, date) {
    if (habit.frequency_type === 'daily') return true;
    const dayName = DAY_NAMES[date.getDay()];
    return (habit.frequency_days || []).includes(dayName);
}

async function calculateStreak(habitId) {
    // Загружаем привычку
    const { rows: habitRows } = await db.query(
        'SELECT frequency_type, frequency_days FROM habits WHERE id = $1',
        [habitId]
    );
    if (!habitRows.length) return 0;
    const habit = habitRows[0];

    // Загружаем все даты выполнения (Set для быстрого поиска)
    const { rows: compRows } = await db.query(
        'SELECT completed_date FROM completions WHERE habit_id = $1 ORDER BY completed_date DESC',
        [habitId]
    );
    const doneSet = new Set(compRows.map(r => toDateStr(new Date(r.completed_date))));

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Стартуем со вчера если сегодня ещё не выполнено
    const todayStr = toDateStr(today);
    const startFromToday = doneSet.has(todayStr);

    const cursor = new Date(today);
    if (!startFromToday) cursor.setDate(cursor.getDate() - 1);

    // Идём назад максимум 365 дней
    for (let i = 0; i < 365; i++) {
        const dateStr = toDateStr(cursor);

        if (!isScheduled(habit, cursor)) {
            // Этот день не запланирован — пропускаем, серия не рвётся
            cursor.setDate(cursor.getDate() - 1);
            continue;
        }

        if (doneSet.has(dateStr)) {
            streak++;
        } else {
            break; // Запланированный день не выполнен — серия прервана
        }

        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

// Проверяет достижения и возвращает новое если есть
async function checkAchievements(habitId, userId, bot) {
    const streak = await calculateStreak(habitId);

    const milestones = [
        { type: 'streak_7',   days: 7,   text: '7 дней подряд — первая неделя пройдена!' },
        { type: 'streak_30',  days: 30,  text: '30 дней подряд — месяц без пропуска! Привычка закрепляется.' },
        { type: 'streak_100', days: 100, text: '100 дней подряд — это уже образ жизни!' },
    ];

    for (const m of milestones) {
        if (streak !== m.days) continue;

        const { rowCount } = await db.query(`
            INSERT INTO achievements (user_id, habit_id, type)
            VALUES ($1, $2, $3)
            ON CONFLICT (habit_id, type) DO NOTHING
        `, [userId, habitId, m.type]);

        if (rowCount > 0) {
            // Новое достижение — отправляем в Telegram если бот подключён
            if (bot) {
                try {
                    const { rows } = await db.query(
                        'SELECT telegram_id FROM users WHERE id = $1', [userId]
                    );
                    const { rows: h } = await db.query(
                        'SELECT name, emoji FROM habits WHERE id = $1', [habitId]
                    );
                    if (rows.length && h.length) {
                        await bot.telegram.sendMessage(
                            rows[0].telegram_id,
                            `${h[0].emoji} ${m.text}\n\nПривычка: ${h[0].name}`
                        );
                    }
                } catch (e) {
                    console.error('[Achievement] Bot send error:', e.message);
                }
            }
            return { type: m.type, days: m.days };
        }
    }

    return null;
}

module.exports = { calculateStreak, checkAchievements };
