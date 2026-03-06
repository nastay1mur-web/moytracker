import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Flame, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Circle, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Trash2,
  LayoutGrid,
  Settings,
  Trophy,
  Star,
  Award,
  TrendingUp,
  AlertCircle,
  Moon,
  Sun,
  Download,
  Upload,
  RotateCcw,
  User,
  Bell,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  format, 
  startOfYear, 
  eachDayOfInterval, 
  isSameDay, 
  subDays, 
  parseISO, 
  startOfDay,
  endOfDay,
  isWithinInterval,
  eachDayOfInterval as getDays,
  startOfWeek,
  endOfWeek,
  addDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  differenceInDays,
  subWeeks,
  getDay,
  parse
} from 'date-fns';
import { ru } from 'date-fns/locale';
import * as Dialog from '@radix-ui/react-dialog';
import * as Progress from '@radix-ui/react-progress';
import * as Switch from '@radix-ui/react-switch';
import { cn } from './lib/utils';
import { 
  Habit, 
  Completion, 
  DEFAULT_HABITS, 
  getDailyPhrase, 
  calculateStreak,
  getEffectiveToday,
  calculateBestStreak,
  getLevelTitle,
  BADGES,
  SUPPORT_PHRASES,
  UserStats,
  UserSettings
} from './lib/habit-utils';

// --- Components ---

const Heatmap = ({ habits, completions, onDayClick, dayStartTime }: { 
  habits: Habit[], 
  completions: Completion[],
  onDayClick: (date: string) => void,
  dayStartTime: string
}) => {
  const today = parseISO(getEffectiveToday(dayStartTime));
  const startDate = subDays(today, 120); // Show last 120 days
  const days = eachDayOfInterval({ start: startDate, end: today });

  const getCompletionRate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayCompletions = completions.filter(c => c.date === dateStr);
    if (habits.length === 0) return 0;
    return dayCompletions.length / habits.length;
  };

  const getColor = (rate: number) => {
    if (rate === 0) return 'bg-stone-100 dark:bg-stone-800';
    if (rate < 0.3) return 'bg-emerald-200 dark:bg-emerald-900/40';
    if (rate < 0.6) return 'bg-emerald-400 dark:bg-emerald-700/60';
    if (rate < 0.9) return 'bg-emerald-600 dark:bg-emerald-500';
    return 'bg-emerald-700 dark:bg-emerald-400';
  };

  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {days.map((day, i) => {
        const rate = getCompletionRate(day);
        return (
          <motion.button
            key={i}
            whileHover={{ scale: 1.3, zIndex: 10 }}
            onClick={() => onDayClick(format(day, 'yyyy-MM-dd'))}
            className={cn(
              "w-3.5 h-3.5 rounded-[4px] transition-colors cursor-pointer",
              getColor(rate)
            )}
            title={`${format(day, 'd MMMM', { locale: ru })}: ${Math.round(rate * 100)}%`}
          />
        );
      })}
    </div>
  );
};

const AddHabitDialog = ({ onAdd }: { onAdd: (habit: Omit<Habit, 'id' | 'createdAt'>) => void }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [category, setCategory] = useState('Развитие');
  const [color, setColor] = useState('#10b981');
  const [frequency, setFrequency] = useState<'daily' | number>('daily');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderDays, setReminderDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  const colors = ['#3b82f6', '#a855f7', '#f97316', '#10b981', '#6366f1', '#ef4444', '#f59e0b', '#ec4899'];
  const emojis = ['💧', '🧘', '🏃', '📚', '😴', '🌳', '🍎', '💻', '🎨', '🎹', '🧹', '📞'];
  const weekDays = [
    { id: 1, name: 'Пн' },
    { id: 2, name: 'Вт' },
    { id: 3, name: 'Ср' },
    { id: 4, name: 'Чт' },
    { id: 5, name: 'Пт' },
    { id: 6, name: 'Сб' },
    { id: 7, name: 'Вс' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onAdd({ 
      name, 
      emoji, 
      category, 
      frequency, 
      color,
      reminder: reminderEnabled ? {
        time: reminderTime,
        days: reminderDays,
        enabled: true
      } : undefined
    });
    setName('');
    setOpen(false);
  };

  const toggleDay = (dayId: number) => {
    setReminderDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-emerald-700 transition-all active:scale-95 z-40">
          <Plus size={28} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white dark:bg-stone-900 rounded-3xl p-8 shadow-2xl z-50 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-2xl font-bold text-stone-900 dark:text-white">Новая привычка</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Название</label>
              <input 
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Напр. Пить воду"
                className="w-full p-4 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Иконка</label>
                <div className="flex flex-wrap gap-2 p-2 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700">
                  {emojis.slice(0, 6).map(e => (
                    <button 
                      key={e} 
                      type="button"
                      onClick={() => setEmoji(e)}
                      className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-all", emoji === e ? "bg-white dark:bg-stone-700 shadow-sm scale-110" : "opacity-50 hover:opacity-100")}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Цвет</label>
                <div className="flex flex-wrap gap-2 p-2 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700">
                  {colors.slice(0, 6).map(c => (
                    <button 
                      key={c} 
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn("w-6 h-6 rounded-full transition-all", color === c ? "ring-2 ring-offset-2 ring-stone-300 scale-110" : "opacity-80 hover:opacity-100")}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-stone-400" />
                  <span className="text-sm font-bold text-stone-700 dark:text-stone-200">Напоминание</span>
                </div>
                <Switch.Root 
                  checked={reminderEnabled}
                  onCheckedChange={setReminderEnabled}
                  className="w-10 h-5 bg-stone-200 dark:bg-stone-700 rounded-full relative shadow-inner focus:outline-none data-[state=checked]:bg-emerald-500 transition-colors"
                >
                  <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-5.5" />
                </Switch.Root>
              </div>

              {reminderEnabled && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Время</label>
                    <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700">
                      <Clock size={16} className="text-stone-400" />
                      <input 
                        type="time"
                        value={reminderTime}
                        onChange={e => setReminderTime(e.target.value)}
                        className="bg-transparent border-none focus:outline-none text-sm font-bold dark:text-white w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Дни недели</label>
                    <div className="flex justify-between gap-1">
                      {weekDays.map(day => (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-[10px] font-black transition-all",
                            reminderDays.includes(day.id) 
                              ? "bg-emerald-500 text-white" 
                              : "bg-stone-100 dark:bg-stone-800 text-stone-400"
                          )}
                        >
                          {day.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <button 
              type="submit"
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 active:scale-95 transition-all"
            >
              Создать
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const SettingsView = ({ settings, onUpdateSettings, onExport, onImport, onReset }: { 
  settings: UserSettings, 
  onUpdateSettings: (s: UserSettings) => void,
  onExport: () => void,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onReset: () => void
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 pb-10"
    >
      <div className="bg-white dark:bg-stone-900 p-8 rounded-[2.5rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <User className="text-emerald-600 dark:text-emerald-400" size={24} />
          </div>
          <h3 className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">Профиль</h3>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-1">Твое имя</label>
            <input 
              value={settings.username}
              onChange={e => onUpdateSettings({ ...settings, username: e.target.value })}
              className="w-full p-5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all dark:text-white font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-1">Главная цель</label>
            <input 
              value={settings.goal}
              onChange={e => onUpdateSettings({ ...settings, goal: e.target.value })}
              className="w-full p-5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all dark:text-white font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-1">Начало дня (сброс прогресса)</label>
            <input 
              type="time"
              value={settings.dayStartTime}
              onChange={e => onUpdateSettings({ ...settings, dayStartTime: e.target.value })}
              className="w-full p-5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all dark:text-white font-bold"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 p-8 rounded-[2.5rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <Settings className="text-emerald-600 dark:text-emerald-400" size={24} />
          </div>
          <h3 className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">Внешний вид</h3>
        </div>
        
        <div className="flex items-center justify-between p-2">
          <div className="space-y-1">
            <p className="font-bold text-stone-800 dark:text-stone-200">Темная тема</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">Переключить оформление приложения</p>
          </div>
          <Switch.Root 
            checked={settings.theme === 'dark'}
            onCheckedChange={checked => onUpdateSettings({ ...settings, theme: checked ? 'dark' : 'light' })}
            className="w-14 h-7 bg-stone-200 dark:bg-stone-700 rounded-full relative shadow-inner focus:outline-none data-[state=checked]:bg-emerald-500 transition-colors"
          >
            <Switch.Thumb className="block w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-7.5" />
          </Switch.Root>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 p-8 rounded-[2.5rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <Download className="text-emerald-600 dark:text-emerald-400" size={24} />
          </div>
          <h3 className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">Данные</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={onExport}
            className="flex items-center justify-center gap-3 w-full p-5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all"
          >
            <Download size={20} />
            Экспорт в JSON
          </button>
          
          <label className="flex items-center justify-center gap-3 w-full p-5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all cursor-pointer">
            <Upload size={20} />
            Импорт из JSON
            <input type="file" accept=".json" onChange={onImport} className="hidden" />
          </label>

          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button className="flex items-center justify-center gap-3 w-full p-5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all">
                <RotateCcw size={20} />
                Сбросить прогресс
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white dark:bg-stone-900 rounded-[3rem] p-10 shadow-2xl z-50 border border-stone-100 dark:border-stone-800">
                <Dialog.Title className="text-2xl font-black text-stone-900 dark:text-white mb-4 tracking-tight">Ты уверен?</Dialog.Title>
                <Dialog.Description className="text-stone-500 dark:text-stone-400 mb-10 leading-relaxed">
                  Это действие удалит все твои привычки, историю и достижения. Это невозможно отменить.
                </Dialog.Description>
                <div className="flex gap-4">
                  <Dialog.Close asChild>
                    <button className="flex-1 p-5 bg-stone-100 dark:bg-stone-800 rounded-2xl font-black text-xs uppercase tracking-widest text-stone-600 dark:text-stone-400">Отмена</button>
                  </Dialog.Close>
                  <button 
                    onClick={onReset}
                    className="flex-1 p-5 bg-red-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-red-200 dark:shadow-none"
                  >
                    Сбросить
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </motion.div>
  );
};

const StatsView = ({ data, period, setPeriod, overallStreak }: { data: any, period: 'week' | 'month' | 'all', setPeriod: (p: 'week' | 'month' | 'all') => void, overallStreak: number }) => {
  if (!data) return null;

  const getPeriodRate = () => {
    if (period === 'week') return data.lastWeekRate;
    // For month and all, we'd need more data, but I'll approximate or calculate here if I have enough info
    // Actually, I'll just use the data I have or calculate it from habitStats
    if (period === 'month') {
      const totalMonthlyRate = data.habitStats.reduce((acc: number, h: any) => acc + h.monthlyRate, 0);
      return totalMonthlyRate / data.habitStats.length;
    }
    // All time
    const totalCompletions = data.habitStats.reduce((acc: number, h: any) => acc + h.totalCompletions, 0);
    const totalPossible = data.habitStats.length * data.totalDays;
    return (totalCompletions / totalPossible) * 100;
  };

  const periodRate = getPeriodRate();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 pb-10"
    >
      {/* Period Filter */}
      <div className="flex p-1.5 bg-stone-100 dark:bg-stone-800 rounded-2xl w-full">
        {(['week', 'month', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              period === p ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-400 hover:text-stone-600"
            )}
          >
            {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Все время'}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Всего дней</p>
          <p className="text-3xl font-black text-stone-900 dark:text-white">{data.totalDays}</p>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">
            {period === 'week' ? 'За неделю' : period === 'month' ? 'За месяц' : 'За все время'}
          </p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{Math.round(periodRate)}%</p>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Лучшая привычка</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{data.bestHabit?.emoji}</span>
            <span className="font-bold text-stone-800 dark:text-stone-100 truncate">{data.bestHabit?.name}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Текущая серия</p>
          <div className="flex items-center gap-2 text-orange-500">
            <Flame size={24} fill="currentColor" />
            <span className="text-3xl font-black">{overallStreak}</span>
          </div>
        </div>
      </div>

      {/* Weekly Chart */}
      <div className="bg-white dark:bg-stone-900 p-8 rounded-[2.5rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
        <h3 className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest text-center">Прогресс по неделям</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.weeklyChartData}>
              <XAxis dataKey="name" hide />
              <YAxis hide domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ fontWeight: 'bold' }}
              />
              <Line 
                type="monotone" 
                dataKey="rate" 
                stroke="#10b981" 
                strokeWidth={4} 
                dot={{ r: 6, fill: '#10b981', strokeWidth: 0 }} 
                activeDot={{ r: 8, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day of Week Chart */}
      <div className="bg-white dark:bg-stone-900 p-8 rounded-[2.5rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
        <h3 className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest text-center">Активность по дням</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dayOfWeekData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#a8a29e' }} />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="count" 
                fill="#10b981" 
                radius={[8, 8, 8, 8]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Habit Stats */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest ml-4">Детально по привычкам</h3>
        {data.habitStats.map((h: any) => (
          <div key={h.id} className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-stone-50 dark:bg-stone-800 flex items-center justify-center text-2xl">
                  {h.emoji}
                </div>
                <div>
                  <h4 className="font-bold text-stone-800 dark:text-stone-100">{h.name}</h4>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-widest">{h.monthlyRate}% за месяц</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded-full">
                <Flame size={14} fill="currentColor" />
                <span className="text-sm font-black">{h.hStreak}</span>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-hidden rounded-lg">
              {h.history.map((completed: boolean, i: number) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex-1 h-8 rounded-md transition-colors",
                    completed ? "bg-emerald-500 dark:bg-emerald-400" : "bg-stone-100 dark:bg-stone-800"
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [view, setView] = useState<'today' | 'history' | 'achievements' | 'stats' | 'settings'>('today');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [xp, setXp] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);
  const [showResetMessage, setShowResetMessage] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [userSettings, setUserSettings] = useState<UserSettings>({
    username: 'Пользователь',
    goal: 'Хочу выработать привычку за 66 дней',
    dayStartTime: '00:00',
    theme: 'light'
  });

  // Load from localStorage
  useEffect(() => {
    const savedHabits = localStorage.getItem('habits');
    const savedCompletions = localStorage.getItem('completions');
    const savedXp = localStorage.getItem('xp');
    const savedBestStreak = localStorage.getItem('bestStreak');
    const savedBadges = localStorage.getItem('unlockedBadges');
    const savedSettings = localStorage.getItem('userSettings');
    
    if (savedHabits) setHabits(JSON.parse(savedHabits));
    else {
      setHabits(DEFAULT_HABITS);
      localStorage.setItem('habits', JSON.stringify(DEFAULT_HABITS));
    }
    
    if (savedCompletions) setCompletions(JSON.parse(savedCompletions));
    if (savedXp) setXp(parseInt(savedXp));
    if (savedBestStreak) setBestStreak(parseInt(savedBestStreak));
    if (savedBadges) setUnlockedBadges(JSON.parse(savedBadges));
    if (savedSettings) setUserSettings(JSON.parse(savedSettings));

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (habits.length > 0) localStorage.setItem('habits', JSON.stringify(habits));
    localStorage.setItem('completions', JSON.stringify(completions));
    localStorage.setItem('xp', xp.toString());
    localStorage.setItem('bestStreak', bestStreak.toString());
    localStorage.setItem('unlockedBadges', JSON.stringify(unlockedBadges));
    localStorage.setItem('userSettings', JSON.stringify(userSettings));

    // Apply theme
    if (userSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [habits, completions, xp, bestStreak, unlockedBadges, userSettings]);

  // Notification check
  useEffect(() => {
    if (!("Notification" in window)) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      const currentDay = getDay(now) === 0 ? 7 : getDay(now); // 1-7 (Mon-Sun)

      habits.forEach(habit => {
        if (habit.reminder?.enabled && 
            habit.reminder.time === currentTime && 
            habit.reminder.days.includes(currentDay)) {
          
          const todayStr = format(now, 'yyyy-MM-dd');
          const isCompleted = completions.some(c => c.habitId === habit.id && c.date === todayStr);
          
          if (!isCompleted) {
            if (Notification.permission === "granted") {
              new Notification(`Напоминание: ${habit.name}`, {
                body: `Пора выполнить привычку: ${habit.emoji} ${habit.name}`,
                icon: '/favicon.ico'
              });
            }
          }
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [habits, completions]);

  const streak = useMemo(() => calculateStreak(completions, userSettings.dayStartTime), [completions, userSettings.dayStartTime]);

  const statsData = useMemo(() => {
    if (habits.length === 0) return null;

    const today = parseISO(getEffectiveToday(userSettings.dayStartTime));
    const todayStr = format(today, 'yyyy-MM-dd');
    
    // 1. Total days in tracker
    const firstHabitDate = habits.reduce((min, h) => {
      const d = parseISO(h.createdAt);
      return d < min ? d : min;
    }, today);
    const totalDays = differenceInDays(today, firstHabitDate) + 1;

    // 2. Last week completion rate
    const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(today, i), 'yyyy-MM-dd'));
    const lastWeekCompletions = completions.filter(c => last7Days.includes(c.date)).length;
    const lastWeekRate = (lastWeekCompletions / (habits.length * 7)) * 100;

    // 3. Best habit
    const habitCompletionRates = habits.map(h => {
      const habitCompletions = completions.filter(c => c.habitId === h.id).length;
      const daysSinceCreation = Math.max(1, differenceInDays(today, parseISO(h.createdAt)) + 1);
      return { ...h, rate: (habitCompletions / daysSinceCreation) * 100 };
    });
    
    // Calculate streak for each habit to find the best one
    const habitStats = habits.map(h => {
      const hCompletions = completions.filter(c => c.habitId === h.id);
      const last30Days = Array.from({ length: 30 }, (_, i) => format(subDays(today, 29 - i), 'yyyy-MM-dd'));
      const monthlyCompletions = hCompletions.filter(c => last30Days.includes(c.date)).length;
      const monthlyRate = Math.round((monthlyCompletions / 30) * 100);
      
      let hStreak = 0;
      let checkDate = today;
      if (!hCompletions.some(c => c.date === todayStr)) {
        checkDate = subDays(today, 1);
      }
      while (hCompletions.some(c => c.date === format(checkDate, 'yyyy-MM-dd'))) {
        hStreak++;
        checkDate = subDays(checkDate, 1);
      }

      const history = last30Days.map(date => hCompletions.some(c => c.date === date));

      return {
        ...h,
        monthlyRate,
        hStreak,
        history,
        totalCompletions: hCompletions.length
      };
    });

    const bestHabit = habitStats.reduce((max, h) => h.monthlyRate > (max?.monthlyRate || 0) ? h : max, habitStats[0]);

    // 4. Weekly Chart Data (Last 8 weeks)
    const weeklyChartData = Array.from({ length: 8 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(today, 7 - i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const weekDateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'));
      
      const weekCompletions = completions.filter(c => weekDateStrings.includes(c.date)).length;
      const totalPossible = habits.length * 7;
      return {
        name: format(weekStart, 'dd.MM'),
        rate: Math.round((weekCompletions / totalPossible) * 100)
      };
    });

    // 5. Day of Week Data
    const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const dayOfWeekCounts = Array(7).fill(0);
    completions.forEach(c => {
      const d = parseISO(c.date);
      const dayIndex = (getDay(d) + 6) % 7; // Adjust to Mon-Sun
      dayOfWeekCounts[dayIndex]++;
    });
    const dayOfWeekData = daysOfWeek.map((name, i) => ({
      name,
      count: dayOfWeekCounts[i]
    }));

    return {
      totalDays,
      lastWeekRate,
      bestHabit,
      weeklyChartData,
      dayOfWeekData,
      habitStats
    };
  }, [habits, completions]);

  // Check for streak reset
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const sortedDates = [...new Set(completions.map(c => c.date))].sort().reverse();
    
    if (sortedDates.length > 0 && !sortedDates.includes(today) && !sortedDates.includes(yesterday)) {
      setShowResetMessage(true);
    } else {
      setShowResetMessage(false);
    }
  }, [completions]);

  // Update best streak
  useEffect(() => {
    if (streak > bestStreak) {
      setBestStreak(streak);
    }
  }, [streak, bestStreak]);

  // Badge checking logic
  useEffect(() => {
    const newBadges = [...unlockedBadges];
    let changed = false;

    if (completions.length > 0 && !newBadges.includes('first_day')) {
      newBadges.push('first_day');
      changed = true;
    }

    if (streak >= 7 && !newBadges.includes('week')) {
      newBadges.push('week');
      changed = true;
    }

    if (streak >= 30 && !newBadges.includes('month')) {
      newBadges.push('month');
      changed = true;
    }

    const todayStr = getEffectiveToday(userSettings.dayStartTime);
    const todayCompletions = completions.filter(c => c.date === todayStr);
    if (habits.length > 0 && todayCompletions.length === habits.length && !newBadges.includes('perfect_day')) {
      newBadges.push('perfect_day');
      changed = true;
    }

    const uniqueDays = new Set(completions.map(c => c.date)).size;
    if (uniqueDays >= 100 && !newBadges.includes('hundred')) {
      newBadges.push('hundred');
      changed = true;
    }

    if (changed) {
      setUnlockedBadges(newBadges);
    }
  }, [completions, streak, habits, unlockedBadges]);

  const toggleHabit = (habitId: string) => {
    const today = getEffectiveToday(userSettings.dayStartTime);
    const isCompleted = completions.some(c => c.habitId === habitId && c.date === today);
    
    if (isCompleted) {
      setCompletions(prev => prev.filter(c => !(c.habitId === habitId && c.date === today)));
      setXp(prev => Math.max(0, prev - 10));
    } else {
      setCompletions(prev => [...prev, { habitId, date: today }]);
      
      // XP Calculation
      let gainedXp = 10;
      const todayCompletions = completions.filter(c => c.date === today);
      if (todayCompletions.length + 1 === habits.length) {
        gainedXp += 50; // Perfect day bonus
      }
      gainedXp += streak * 5; // Streak bonus
      
      setXp(prev => prev + gainedXp);
    }
  };

  const addHabit = (newHabit: Omit<Habit, 'id' | 'createdAt'>) => {
    const habit: Habit = {
      ...newHabit,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    setHabits(prev => [...prev, habit]);
  };

  const deleteHabit = (id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    setCompletions(prev => prev.filter(c => c.habitId !== id));
  };

  const exportData = () => {
    const data = {
      habits,
      completions,
      xp,
      bestStreak,
      unlockedBadges,
      userSettings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.habits) setHabits(data.habits);
        if (data.completions) setCompletions(data.completions);
        if (data.xp) setXp(data.xp);
        if (data.bestStreak) setBestStreak(data.bestStreak);
        if (data.unlockedBadges) setUnlockedBadges(data.unlockedBadges);
        if (data.userSettings) setUserSettings(data.userSettings);
        alert('Данные успешно импортированы!');
      } catch (err) {
        alert('Ошибка при импорте файла. Убедитесь, что это корректный JSON.');
      }
    };
    reader.readAsText(file);
  };

  const resetProgress = () => {
    setHabits(DEFAULT_HABITS);
    setCompletions([]);
    setXp(0);
    setBestStreak(0);
    setUnlockedBadges([]);
    setUserSettings({
      username: 'Пользователь',
      goal: 'Хочу выработать привычку за 66 дней',
      dayStartTime: '00:00',
      theme: 'light'
    });
    localStorage.clear();
    window.location.reload();
  };

  const level = Math.floor(xp / 100) + 1;
  const levelTitle = getLevelTitle(level);
  const xpProgress = xp % 100;

  const todayStr = getEffectiveToday(userSettings.dayStartTime);
  const todayCompletions = completions.filter(c => c.date === todayStr);
  const progress = habits.length > 0 ? (todayCompletions.length / habits.length) * 100 : 0;
  const phrase = useMemo(() => getDailyPhrase(), []);
  const supportPhrase = useMemo(() => SUPPORT_PHRASES[Math.floor(Math.random() * SUPPORT_PHRASES.length)], []);

  const selectedDateDetails = useMemo(() => {
    if (!selectedDate) return null;
    const dateCompletions = completions.filter(c => c.date === selectedDate);
    return {
      date: selectedDate,
      completed: habits.filter(h => dateCompletions.some(c => c.habitId === h.id)),
      missed: habits.filter(h => !dateCompletions.some(c => c.habitId === h.id))
    };
  }, [selectedDate, completions, habits]);

  return (
    <div className="min-h-screen font-sans text-stone-900 dark:text-stone-100 pb-32">
      <div className="max-w-xl mx-auto px-6 pt-12 space-y-10">
        
        {/* Header Section */}
        <header className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                {format(new Date(), 'EEEE, d MMMM', { locale: ru })}
              </p>
              <h1 className="text-4xl font-black text-stone-900 dark:text-white tracking-tight">Привет, {userSettings.username}!</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black rounded-md uppercase tracking-wider">
                  Уровень {level}: {levelTitle}
                </span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-wider">{xp} XP</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1.5 text-orange-500 bg-white dark:bg-stone-900 px-4 py-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
                <Flame size={20} fill="currentColor" className="text-orange-500" />
                <span className="font-black text-xl">{streak}</span>
              </div>
              <div className="flex items-center gap-1 text-stone-400 text-[10px] font-bold uppercase tracking-tighter">
                <Trophy size={12} />
                <span>Рекорд: {bestStreak}</span>
              </div>
            </div>
          </div>

          {showResetMessage && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-stone-900 border border-amber-100 dark:border-amber-900/30 p-4 rounded-3xl flex items-center gap-3 text-amber-700 dark:text-amber-500 shadow-sm"
            >
              <AlertCircle size={20} className="flex-shrink-0" />
              <p className="text-sm font-medium leading-tight">{supportPhrase}</p>
            </motion.div>
          )}

          <div className="bg-white dark:bg-stone-900 p-6 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
            <div className="flex justify-between items-end">
              <p className="text-stone-500 dark:text-stone-400 text-sm italic font-medium leading-relaxed max-w-[80%]">
                "{phrase}"
              </p>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{Math.round(progress)}%</span>
              </div>
            </div>
            <Progress.Root className="relative overflow-hidden bg-stone-100 dark:bg-stone-800 rounded-full h-3 w-full">
              <Progress.Indicator 
                className="bg-emerald-500 dark:bg-emerald-400 w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
                style={{ transform: `translateX(-${100 - progress}%)` }}
              />
            </Progress.Root>
            <div className="flex justify-between items-center text-[10px] text-stone-400 dark:text-stone-500 uppercase font-bold tracking-widest">
              <span>Выполнено {todayCompletions.length} из {habits.length}</span>
              <span>XP до уровня: {100 - xpProgress}</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <AnimatePresence mode="wait">
          {view === 'today' ? (
            <motion.section 
              key="today"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {habits.map(habit => {
                const isCompleted = todayCompletions.some(c => c.habitId === habit.id);
                return (
                  <motion.div 
                    key={habit.id}
                    layout
                    className="group bg-white dark:bg-stone-900 p-5 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm flex items-center justify-between hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner"
                        style={{ backgroundColor: `${habit.color}15` }}
                      >
                        {habit.emoji}
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 dark:text-stone-100">{habit.name}</h3>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 uppercase font-bold tracking-widest">{habit.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => deleteHabit(habit.id)}
                        className="p-2 text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button 
                        onClick={() => toggleHabit(habit.id)}
                        className={cn(
                          "relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all overflow-hidden",
                          isCompleted 
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200 dark:shadow-none" 
                            : "bg-stone-50 dark:bg-stone-800 text-stone-300 border border-stone-100 dark:border-stone-700"
                        )}
                      >
                        <AnimatePresence mode="wait">
                          {isCompleted ? (
                            <motion.div
                              key="check"
                              initial={{ scale: 0, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0, rotate: 45 }}
                            >
                              <CheckCircle2 size={28} />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="circle"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <Circle size={28} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        {/* Wave Animation on completion */}
                        {isCompleted && (
                          <motion.div 
                            initial={{ scale: 0, opacity: 0.5 }}
                            animate={{ scale: 2, opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 bg-white rounded-full pointer-events-none"
                          />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              {habits.length === 0 && (
                <div className="text-center py-20 space-y-4">
                  <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                    <LayoutGrid className="text-stone-300" size={32} />
                  </div>
                  <p className="text-stone-400 font-medium">Пока нет привычек. Добавь первую!</p>
                </div>
              )}
            </motion.section>
          ) : view === 'history' ? (
            <motion.section 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-6 text-center">Карта активности</h3>
                <Heatmap habits={habits} completions={completions} onDayClick={setSelectedDate} dayStartTime={userSettings.dayStartTime} />
              </div>

              {selectedDateDetails && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white dark:bg-stone-900 p-8 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-xl text-stone-900 dark:text-white">
                      {format(parseISO(selectedDateDetails.date), 'd MMMM', { locale: ru })}
                    </h3>
                    <button onClick={() => setSelectedDate(null)} className="text-stone-400 hover:text-stone-600">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Выполнено ({selectedDateDetails.completed.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedDateDetails.completed.map(h => (
                          <div key={h.id} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2">
                            <span>{h.emoji}</span>
                            <span>{h.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Пропущено ({selectedDateDetails.missed.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedDateDetails.missed.map(h => (
                          <div key={h.id} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-xs font-bold border border-red-100 dark:border-red-900/30 flex items-center gap-2">
                            <span>{h.emoji}</span>
                            <span>{h.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.section>
          ) : view === 'achievements' ? (
            <motion.section 
              key="achievements"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 pb-10"
            >
              <div className="grid grid-cols-2 gap-4">
                {BADGES.map(badge => {
                  const isUnlocked = unlockedBadges.includes(badge.id);
                  return (
                    <div 
                      key={badge.id}
                      className={cn(
                        "p-6 rounded-[2.5rem] border flex flex-col items-center text-center gap-3 transition-all",
                        isUnlocked 
                          ? "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 shadow-sm" 
                          : "bg-stone-100 dark:bg-stone-800 border-transparent opacity-40 grayscale"
                      )}
                    >
                      <div className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner",
                        isUnlocked ? "bg-amber-50 dark:bg-amber-900/20" : "bg-stone-200 dark:bg-stone-700"
                      )}>
                        {badge.icon}
                      </div>
                      <div>
                        <h4 className="font-black text-stone-900 dark:text-white text-sm">{badge.name}</h4>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-tighter mt-1">{badge.desc}</p>
                      </div>
                      {isUnlocked && (
                        <div className="mt-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[8px] font-black rounded-full uppercase tracking-widest">
                          Получено
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="bg-emerald-900 p-10 rounded-[3rem] text-white space-y-8 relative overflow-hidden shadow-xl shadow-emerald-900/20">
                <div className="relative z-10">
                  <h3 className="text-2xl font-black tracking-tight">Твой путь к успеху</h3>
                  <p className="text-emerald-200 text-sm mt-3 leading-relaxed">Продолжай в том же духе! Каждый день приближает тебя к уровню Легенды.</p>
                  
                  <div className="mt-10 space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                      <span className="text-emerald-400">Уровень {level}</span>
                      <span className="text-emerald-400">{xpProgress} / 100 XP</span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${xpProgress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                      />
                    </div>
                  </div>
                </div>
                <TrendingUp className="absolute -right-12 -bottom-12 text-emerald-800 w-64 h-64 opacity-20" />
              </div>
            </motion.section>
          ) : view === 'stats' ? (
            <StatsView data={statsData} period={statsPeriod} setPeriod={setStatsPeriod} overallStreak={streak} />
          ) : (
            <SettingsView 
              settings={userSettings} 
              onUpdateSettings={setUserSettings}
              onExport={exportData}
              onImport={importData}
              onReset={resetProgress}
            />
          )}
        </AnimatePresence>

        <AddHabitDialog onAdd={addHabit} />

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl border-t border-stone-100 dark:border-stone-800 px-6 py-4 pb-8 z-40">
          <div className="max-w-xl mx-auto flex justify-between items-center">
            <NavButton 
              active={view === 'today'} 
              onClick={() => setView('today')} 
              icon={<CheckCircle2 size={24} />} 
              label="Сегодня" 
            />
            <NavButton 
              active={view === 'history'} 
              onClick={() => setView('history')} 
              icon={<CalendarIcon size={24} />} 
              label="Календарь" 
            />
            <NavButton 
              active={view === 'stats'} 
              onClick={() => setView('stats')} 
              icon={<TrendingUp size={24} />} 
              label="Статистика" 
            />
            <NavButton 
              active={view === 'achievements'} 
              onClick={() => setView('achievements')} 
              icon={<Award size={24} />} 
              label="Награды" 
            />
            <NavButton 
              active={view === 'settings'} 
              onClick={() => setView('settings')} 
              icon={<Settings size={24} />} 
              label="Настройки" 
            />
          </div>
        </nav>
      </div>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1 transition-all",
      active ? "text-emerald-600 dark:text-emerald-400 scale-110" : "text-stone-400 dark:text-stone-500 hover:text-stone-600"
    )}
  >
    {icon}
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);
