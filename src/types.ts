export interface User {
  id: number;
  is_premium: number;
  xp: number;
  level: number;
}

export interface Habit {
  id: number;
  user_id: number;
  name: string;
  category: string;
  frequency: string;
  created_at: string;
  total_completions: number;
  is_completed_today: number;
}

export interface CompletionStat {
  date: string;
  count: number;
}
