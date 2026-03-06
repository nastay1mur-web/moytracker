/**
 * storage.js
 * Управление данными приложения через localStorage.
 * Все ключи хранилища начинаются с 'mxt_' (MAX Tracker).
 *
 * Структура данных:
 *   mxt_habits       — массив объектов привычек
 *   mxt_completions  — массив объектов выполнений
 *   mxt_settings     — объект настроек пользователя
 *   mxt_onboarding   — флаг прохождения онбординга
 */

// ──────────────────────────────────────────────────────────
//  Шаблоны привычек (выбираются на шаге 2 онбординга)
// ──────────────────────────────────────────────────────────
const HABIT_TEMPLATES = [
  { name: 'Пить воду',     icon: '💧', color: '#2AABEE', section: 'morning' },
  { name: 'Спорт',         icon: '🏃', color: '#FF9500', section: 'morning' },
  { name: 'Чтение',        icon: '📚', color: '#BF5AF2', section: 'evening' },
  { name: 'Медитация',     icon: '🧘', color: '#40C8E0', section: 'morning' },
  { name: 'Режим сна',     icon: '😴', color: '#5E5CE6', section: 'evening' },
  { name: 'Питание',       icon: '🥗', color: '#30D158', section: 'any'     },
  { name: 'Витамины',      icon: '💊', color: '#FF375F', section: 'morning' },
  { name: 'Прогулка',      icon: '🚶', color: '#FFD60A', section: 'any'     },
  { name: 'Дневник',       icon: '✍️',  color: '#FF9F0A', section: 'evening' },
  { name: 'Без соцсетей',  icon: '🙅', color: '#FF453A', section: 'any'     },
];

// Палитра цветов для выбора при создании привычки
const HABIT_COLORS = [
  '#2AABEE', '#FF9500', '#30D158', '#BF5AF2',
  '#FF375F', '#FFD60A', '#40C8E0', '#FF453A',
];

// Набор иконок для выбора при создании привычки
const HABIT_ICONS = [
  '💧','🏃','📚','🧘','😴','🥗','💊','🚶','✍️','🙅',
  '🏋️','🚴','🎵','🎨','💻','🌿','☕','🍎','💪','🧠',
  '🌅','🌙','❤️','⭐','🎯','🔋','🧹','🐕','🎸','🏊',
];

// ──────────────────────────────────────────────────────────
//  Ключи localStorage
// ──────────────────────────────────────────────────────────
const KEYS = {
  habits: 'mxt_habits',
  completions: 'mxt_completions',
  settings: 'mxt_settings',
  onboarding: 'mxt_onboarding',
};

// ──────────────────────────────────────────────────────────
//  Настройки по умолчанию
// ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  theme: 'auto',         // 'light' | 'dark' | 'auto'
  weekStart: 'mon',      // 'mon' | 'sun'
  remindersEnabled: true,
  morningTime: '08:00',
  eveningTime: '21:00',
  userName: '',          // заполняется из SDK при первом запуске
};

// ──────────────────────────────────────────────────────────
//  Вспомогательные функции
// ──────────────────────────────────────────────────────────

/** Генерирует уникальный ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Возвращает строку текущей даты в формате 'YYYY-MM-DD' */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/** Возвращает строку даты со смещением в днях (отрицательное = прошлое) */
function dateOffsetStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ──────────────────────────────────────────────────────────
//  Слой хранилища Storage
// ──────────────────────────────────────────────────────────
const Storage = {

  // ── Онбординг ──────────────────────────────────────────

  isOnboardingDone() {
    return localStorage.getItem(KEYS.onboarding) === 'done';
  },

  setOnboardingDone() {
    localStorage.setItem(KEYS.onboarding, 'done');
  },

  // ── Настройки ──────────────────────────────────────────

  getSettings() {
    const raw = localStorage.getItem(KEYS.settings);
    return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  },

  saveSettings(patch) {
    const current = this.getSettings();
    const updated = Object.assign(current, patch);
    localStorage.setItem(KEYS.settings, JSON.stringify(updated));
    return updated;
  },

  // ── Привычки ───────────────────────────────────────────

  /** Возвращает все активные привычки (не заархивированные) */
  getHabits() {
    const raw = localStorage.getItem(KEYS.habits);
    const all = raw ? JSON.parse(raw) : [];
    return all.filter(h => !h.archivedAt);
  },

  /** Возвращает все привычки включая архивные */
  getAllHabits() {
    const raw = localStorage.getItem(KEYS.habits);
    return raw ? JSON.parse(raw) : [];
  },

  /** Возвращает одну привычку по ID */
  getHabit(id) {
    return this.getAllHabits().find(h => h.id === id) || null;
  },

  /**
   * Сохраняет привычку.
   * Если habit.id уже существует — обновляет. Иначе создаёт новую.
   */
  saveHabit(habit) {
    const all = this.getAllHabits();
    const idx = all.findIndex(h => h.id === habit.id);
    if (idx !== -1) {
      all[idx] = habit;
    } else {
      habit.id = habit.id || generateId();
      habit.createdAt = habit.createdAt || todayStr();
      habit.archivedAt = null;
      all.push(habit);
    }
    localStorage.setItem(KEYS.habits, JSON.stringify(all));
    return habit;
  },

  /** Создаёт привычку из шаблона и сохраняет */
  createFromTemplate(template) {
    return this.saveHabit({
      id: generateId(),
      name: template.name,
      icon: template.icon,
      color: template.color,
      section: template.section || 'any',
      frequency: 'daily',
      createdAt: todayStr(),
      archivedAt: null,
    });
  },

  /** Перемещает привычку в архив (мягкое удаление) */
  archiveHabit(id) {
    const all = this.getAllHabits();
    const idx = all.findIndex(h => h.id === id);
    if (idx !== -1) {
      all[idx].archivedAt = todayStr();
      localStorage.setItem(KEYS.habits, JSON.stringify(all));
    }
  },

  // ── Выполнения ─────────────────────────────────────────

  /** Возвращает все выполнения для данной привычки */
  getCompletions(habitId) {
    const raw = localStorage.getItem(KEYS.completions);
    const all = raw ? JSON.parse(raw) : [];
    return all.filter(c => c.habitId === habitId);
  },

  /** Возвращает все выполнения за конкретный день */
  getCompletionsForDate(date) {
    const raw = localStorage.getItem(KEYS.completions);
    const all = raw ? JSON.parse(raw) : [];
    return all.filter(c => c.date === date);
  },

  /** Проверяет, выполнена ли привычка в указанный день */
  isCompleted(habitId, date) {
    const raw = localStorage.getItem(KEYS.completions);
    const all = raw ? JSON.parse(raw) : [];
    return all.some(c => c.habitId === habitId && c.date === date);
  },

  /** Переключает выполнение привычки на сегодня. Возвращает новый статус. */
  toggleCompletion(habitId) {
    const date = todayStr();
    const raw = localStorage.getItem(KEYS.completions);
    let all = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex(c => c.habitId === habitId && c.date === date);
    if (idx !== -1) {
      all.splice(idx, 1);
      localStorage.setItem(KEYS.completions, JSON.stringify(all));
      return false; // снято
    } else {
      all.push({ id: generateId(), habitId, date });
      localStorage.setItem(KEYS.completions, JSON.stringify(all));
      return true; // отмечено
    }
  },

  // ── Аналитика ──────────────────────────────────────────

  /**
   * Считает текущую непрерывную серию (streak) для привычки.
   * Серия идёт назад от сегодня (или вчера, если сегодня ещё не выполнено).
   */
  getStreak(habitId) {
    const completions = this.getCompletions(habitId);
    if (!completions.length) return 0;
    const dateSet = new Set(completions.map(c => c.date));
    const today = todayStr();
    let streak = 0;
    let cur = new Date();
    // Если сегодня ещё не выполнено — начинаем со вчера
    if (!dateSet.has(today)) cur.setDate(cur.getDate() - 1);
    while (true) {
      const s = cur.toISOString().split('T')[0];
      if (dateSet.has(s)) {
        streak++;
        cur.setDate(cur.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },

  /** Возвращает максимальную серию за всё время */
  getMaxStreak(habitId) {
    const completions = this.getCompletions(habitId);
    if (!completions.length) return 0;
    const dates = [...new Set(completions.map(c => c.date))].sort();
    let max = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const next = new Date(dates[i]);
      const diff = (next - prev) / 86400000;
      if (diff === 1) {
        cur++;
        if (cur > max) max = cur;
      } else {
        cur = 1;
      }
    }
    return max;
  },

  /** Процент выполнения привычки за последние N дней (0–100) */
  getCompletionRate(habitId, days) {
    let done = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (this.isCompleted(habitId, d.toISOString().split('T')[0])) done++;
    }
    return Math.round((done / days) * 100);
  },

  /** Общий % выполнения всех привычек за сегодня */
  getTodayProgress() {
    const habits = this.getHabits();
    if (!habits.length) return { done: 0, total: 0, percent: 0 };
    const today = todayStr();
    const done = habits.filter(h => this.isCompleted(h.id, today)).length;
    return { done, total: habits.length, percent: Math.round((done / habits.length) * 100) };
  },

  /**
   * Заполняет хранилище демо-данными для первого запуска.
   * Создаёт 5 привычек с ~30-дневной историей выполнений.
   * Вызывается только если данных ещё нет.
   */
  seedDemoData() {
    // Не перезаписывать, если данные уже есть
    if (this.getAllHabits().length > 0) return;

    const habits = [
      { id: 'demo1', name: 'Пить воду',    icon: '💧', color: '#2AABEE', section: 'morning', frequency: 'daily', createdAt: dateOffsetStr(-35), archivedAt: null },
      { id: 'demo2', name: 'Спорт',         icon: '🏃', color: '#FF9500', section: 'morning', frequency: 'daily', createdAt: dateOffsetStr(-35), archivedAt: null },
      { id: 'demo3', name: 'Чтение',        icon: '📚', color: '#BF5AF2', section: 'evening', frequency: 'daily', createdAt: dateOffsetStr(-35), archivedAt: null },
      { id: 'demo4', name: 'Медитация',     icon: '🧘', color: '#40C8E0', section: 'morning', frequency: 'daily', createdAt: dateOffsetStr(-35), archivedAt: null },
      { id: 'demo5', name: 'Режим сна',     icon: '😴', color: '#5E5CE6', section: 'evening', frequency: 'daily', createdAt: dateOffsetStr(-35), archivedAt: null },
    ];
    localStorage.setItem(KEYS.habits, JSON.stringify(habits));

    // Паттерны выполнения: 1 = выполнено, 0 = пропущено (индекс 0 = сегодня, 1 = вчера, ...)
    // demo1 (Вода):      выполнено сегодня, серия 5 дней
    // demo2 (Спорт):     не выполнено сегодня, серия 1 (вчера)
    // demo3 (Чтение):    выполнено сегодня, серия 8 дней
    // demo4 (Медитация): выполнено сегодня, серия 1
    // demo5 (Режим сна): не выполнено сегодня, серия 2 (вчера, позавчера)
    const patterns = {
      demo1: [1,1,1,1,1, 0,0, 1,1,1,0,1, 1,0,1,1,0,1, 1,1,0,1,0,0, 1,1,1,0,1,1],
      demo2: [0,1,0,1,0, 1,1, 0,1,0,1,1, 0,1,0,1,1,0, 1,0,1,0,1,0, 1,0,1,1,0,1],
      demo3: [1,1,1,1,1, 1,1,1, 0,0,1,1,0, 1,1,1,0,1, 1,0,1,1,1,0, 1,0,1,1,1,0],
      demo4: [1,0,0,0,1, 0,1,0, 1,0,0,1,0, 0,1,0,1,1, 0,1,0,0,1,0, 1,1,0,1,0,1],
      demo5: [0,1,1,0,1, 0,1,1, 0,1,0,0,1, 1,0,1,0,1, 0,0,1,0,1,1, 0,1,0,0,1,1],
    };

    const completions = [];
    for (const [habitId, pat] of Object.entries(patterns)) {
      pat.forEach((done, i) => {
        if (done) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          completions.push({
            id: generateId(),
            habitId,
            date: d.toISOString().split('T')[0],
          });
        }
      });
    }
    localStorage.setItem(KEYS.completions, JSON.stringify(completions));
    this.setOnboardingDone();
  },

  /** Возвращает данные для heatmap: объект {dateStr: true} за месяц */
  getHeatmapData(habitId, year, month) {
    const completions = this.getCompletions(habitId);
    const result = {};
    completions.forEach(c => {
      const d = new Date(c.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        result[c.date] = true;
      }
    });
    return result;
  },
};
