export interface Habit {
  id: string;
  name: string;
  emoji: string;
  category: string;
  frequency: 'daily' | number; // number of times per week
  color: string;
  createdAt: string;
  reminder?: {
    time: string; // HH:mm
    days: number[]; // 1-7 (Mon-Sun)
    enabled: boolean;
  };
}

export interface UserSettings {
  username: string;
  goal: string;
  dayStartTime: string; // HH:mm
  theme: 'light' | 'dark';
}

export interface Completion {
  habitId: string;
  date: string; // ISO string YYYY-MM-DD
}

export interface UserStats {
  xp: number;
  level: number;
  bestStreak: number;
  unlockedBadges: string[];
}

export const DEFAULT_HABITS: Habit[] = [
  { id: '1', name: 'Вода', emoji: '💧', category: 'Здоровье', frequency: 'daily', color: '#3b82f6', createdAt: new Date().toISOString() },
  { id: '2', name: 'Медитация', emoji: '🧘', category: 'Осознанность', frequency: 'daily', color: '#a855f7', createdAt: new Date().toISOString() },
  { id: '3', name: 'Зарядка', emoji: '🏃', category: 'Фитнес', frequency: 'daily', color: '#f97316', createdAt: new Date().toISOString() },
  { id: '4', name: 'Чтение', emoji: '📚', category: 'Развитие', frequency: 'daily', color: '#10b981', createdAt: new Date().toISOString() },
  { id: '5', name: 'Сон', emoji: '😴', category: 'Здоровье', frequency: 'daily', color: '#6366f1', createdAt: new Date().toISOString() },
  { id: '6', name: 'Прогулка', emoji: '🌳', category: 'Активность', frequency: 'daily', color: '#ef4444', createdAt: new Date().toISOString() },
];

export const MOTIVATIONAL_PHRASES = [
  "Дисциплина — это мост между целями и достижениями.",
  "Маленькие шаги ведут к большим результатам.",
  "Твой единственный предел — это ты сам.",
  "Успех — это сумма маленьких усилий, повторяющихся изо дня в день.",
  "Не останавливайся, пока не будешь гордиться собой.",
  "Твое будущее создается тем, что ты делаешь сегодня, а не завтра.",
  "Лучшее время, чтобы посадить дерево, было 20 лет назад. Следующее лучшее время — сегодня.",
  "Секрет успеха — в постоянстве цели.",
  "Каждый день — это новый шанс стать лучше.",
  "Ты сильнее, чем ты думаешь."
];

export const SUPPORT_PHRASES = [
  "Ничего страшного! Завтра — новый шанс начать серию.",
  "Ошибки — это часть пути. Главное — вернуться в строй.",
  "Не вини себя. Один пропуск не перечеркивает весь твой прогресс.",
  "Сброс серии — это повод поставить новый рекорд!",
  "Главное не то, сколько раз ты упал, а сколько раз поднялся."
];

export const getDailyPhrase = () => {
  const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MOTIVATIONAL_PHRASES[dayOfYear % MOTIVATIONAL_PHRASES.length];
};

export const getEffectiveToday = (dayStartTime: string = '00:00'): string => {
  const now = new Date();
  const [startHour, startMinute] = dayStartTime.split(':').map(Number);
  
  const effectiveDate = new Date(now);
  if (now.getHours() < startHour || (now.getHours() === startHour && now.getMinutes() < startMinute)) {
    effectiveDate.setDate(now.getDate() - 1);
  }
  
  return format(effectiveDate, 'yyyy-MM-dd');
};

export const calculateStreak = (completions: Completion[], dayStartTime: string = '00:00') => {
  if (completions.length === 0) return 0;
  
  const sortedDates = [...new Set(completions.map(c => c.date))].sort().reverse();
  const today = getEffectiveToday(dayStartTime);
  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');
  
  let currentStreak = 0;
  let checkDate = today;
  
  // If not completed today, check if it was completed yesterday to continue the streak
  if (!sortedDates.includes(today)) {
    if (!sortedDates.includes(yesterday)) return 0;
    checkDate = yesterday;
  }
  
  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates.find(d => d === checkDate);
    if (date) {
      currentStreak++;
      const nextDate = subDays(parseISO(checkDate), 1);
      checkDate = format(nextDate, 'yyyy-MM-dd');
    } else {
      break;
    }
  }
  
  return currentStreak;
};

export const calculateBestStreak = (completions: Completion[]) => {
  if (completions.length === 0) return 0;
  
  const sortedDates = [...new Set(completions.map(c => c.date))].sort();
  if (sortedDates.length === 0) return 0;

  let maxStreak = 0;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = parseISO(sortedDates[i - 1]);
    const currDate = parseISO(sortedDates[i]);
    
    const diff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 1) {
      currentStreak++;
    } else {
      maxStreak = Math.max(maxStreak, currentStreak);
      currentStreak = 1;
    }
  }
  
  return Math.max(maxStreak, currentStreak);
};

export const getLevelTitle = (level: number) => {
  if (level < 5) return "Новичок";
  if (level < 15) return "Практик";
  if (level < 30) return "Мастер";
  return "Легенда";
};

export const BADGES = [
  { id: 'first_day', name: 'Первый день', desc: 'Отметил первую привычку', icon: '🌟' },
  { id: 'week', name: 'Неделя', desc: '7 дней подряд без пропусков', icon: '🔥' },
  { id: 'month', name: 'Месяц', desc: '30 дней подряд', icon: '🏆' },
  { id: 'perfect_day', name: 'Идеальный день', desc: 'Все привычки выполнены', icon: '✨' },
  { id: 'hundred', name: 'Сотня', desc: '100 дней в трекере', icon: '💯' },
];

const parseISO = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

import { format, subDays } from 'date-fns';
