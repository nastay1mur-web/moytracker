const express = require('express');
const db      = require('../db');
const { authMiddleware }  = require('./auth');
const { calculateStreak } = require('../lib/streak');

const router = express.Router();
router.use(authMiddleware);

const DAY_NAMES_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAY_KEYS     = ['sun','mon','tue','wed','thu','fri','sat'];

// Генерируем массив дат за последние N дней (сегодня включительно)
function lastNDays(n) {
    const days = [];
    for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    return days;
}

// Запланирована ли привычка в данный день
function isScheduled(habit, dateStr) {
    if (habit.frequency_type === 'daily') return true;
    const dayIdx = new Date(dateStr).getDay();
    return (habit.frequency_days || []).includes(DAY_KEYS[dayIdx]);
}

// ─────────────────────────────────────────────────────────────
// GET /api/stats?period=week|month
// Статистика за последние 7 или 30 дней.
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const period = req.query.period === 'month' ? 'month' : 'week';
    const days   = lastNDays(period === 'week' ? 7 : 30);
    const userId = req.user.id;

    try {
        // Все активные привычки пользователя
        const { rows: habits } = await db.query(
            `SELECT id, name, emoji, frequency_type, frequency_days
             FROM habits WHERE user_id = $1 AND is_archived = FALSE`,
            [userId]
        );

        if (!habits.length) {
            return res.json({
                period,
                completion_pct:   0,
                total_completions: 0,
                habits:            [],
                best_day:          null,
                hide_failures:     req.user.settings?.hide_failures || false,
            });
        }

        // Все выполнения за период
        const { rows: completions } = await db.query(`
            SELECT habit_id, completed_date::text AS completed_date
            FROM completions
            WHERE habit_id = ANY($1)
              AND completed_date >= $2
              AND completed_date <= $3
        `, [
            habits.map(h => h.id),
            days[days.length - 1], // самый старый день
            days[0],               // сегодня
        ]);

        const doneSet = new Set(completions.map(c => `${c.habit_id}::${c.completed_date}`));

        // ── Общий процент выполнения за период ──
        // Считаем только запланированные дни (daily=все, weekly=по расписанию)
        let totalPlanned = 0;
        let totalDone    = 0;

        for (const day of days) {
            for (const habit of habits) {
                if (!isScheduled(habit, day)) continue;
                totalPlanned++;
                if (doneSet.has(`${habit.id}::${day}`)) totalDone++;
            }
        }

        const completionPct = totalPlanned
            ? Math.round(totalDone / totalPlanned * 100)
            : 0;

        // ── Статистика по каждой привычке ──
        const habitStats = [];
        for (const habit of habits) {
            const streak   = await calculateStreak(habit.id);

            // Лучшая серия за всё время
            const { rows: allComp } = await db.query(
                'SELECT completed_date::text FROM completions WHERE habit_id = $1 ORDER BY completed_date',
                [habit.id]
            );
            const bestStreak = calcBestStreak(allComp.map(r => r.completed_date), habit);

            // Процент выполнения за 30 дней
            const days30 = lastNDays(30);
            let planned30 = 0, done30 = 0;
            for (const d of days30) {
                if (!isScheduled(habit, d)) continue;
                planned30++;
                if (doneSet.has(`${habit.id}::${d}`) ||
                    completions.some(c => c.habit_id === habit.id && c.completed_date === d)) {
                    done30++;
                }
            }

            habitStats.push({
                id:               habit.id,
                name:             habit.name,
                emoji:            habit.emoji,
                streak,
                best_streak:      bestStreak,
                completion_pct_30d: planned30 ? Math.round(done30 / planned30 * 100) : 0,
            });
        }

        // ── Лучший день недели ──
        // Считаем средний % выполнения по дням недели
        const dayStats = {}; // dayOfWeek → { done, planned }
        for (const day of days) {
            const dayIdx = new Date(day).getDay();
            if (!dayStats[dayIdx]) dayStats[dayIdx] = { done: 0, planned: 0 };
            for (const habit of habits) {
                if (!isScheduled(habit, day)) continue;
                dayStats[dayIdx].planned++;
                if (doneSet.has(`${habit.id}::${day}`)) dayStats[dayIdx].done++;
            }
        }

        let bestDay = null;
        let bestPct = 0;
        for (const [dayIdx, s] of Object.entries(dayStats)) {
            if (!s.planned) continue;
            const pct = Math.round(s.done / s.planned * 100);
            if (pct > bestPct) {
                bestPct = pct;
                bestDay = { name: DAY_NAMES_RU[+dayIdx], pct };
            }
        }

        res.json({
            period,
            completion_pct:    completionPct,
            total_completions: totalDone,
            habits:            habitStats,
            best_day:          bestDay,
        });
    } catch (e) {
        console.error('[Stats] GET error:', e.message);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Вычисляет лучшую серию за всё время
function calcBestStreak(sortedDates, habit) {
    if (!sortedDates.length) return 0;
    let best = 1, current = 1;

    for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

        if (habit.frequency_type === 'daily') {
            current = diffDays === 1 ? current + 1 : 1;
        } else {
            // Для weekly: проверяем что нет пропущенного запланированного дня между датами
            current = diffDays <= 7 ? current + 1 : 1;
        }

        if (current > best) best = current;
    }

    return best;
}

module.exports = router;
