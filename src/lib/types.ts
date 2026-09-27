import type { Lang } from './i18n'

export interface SettingsDTO {
  displayName: string
  language: Lang
  currency: string
  theme: 'light' | 'dark' | 'system'
  monthlyBudget: number
  dailyBudget: number
  weekendBudget: number
  savingsTarget: number
}

export interface CategoryDTO {
  id: string
  slug: string
  name: string
  nameEn: string
  nameFr: string
  nameAr: string
  /** native Darija display name (Arabic script) — null = use nameAr */
  nameAry?: string | null
  icon: string
  color: string
  essential: boolean
  sortOrder: number
  txCount?: number
}

export interface TransactionDTO {
  id: string
  amount: number
  note: string | null
  date: string
  necessary: boolean
  /** precise per-expense icon from smart detection (null/absent = use category icon) */
  icon?: string | null
  isRecurring: boolean
  paymentMethod: string
  category: { id: string; slug: string; name: string; icon: string; color: string; essential: boolean }
}

export interface NotifDTO {
  id: string
  type: string
  level: 'info' | 'success' | 'warning' | 'danger'
  key: string
  message: string
  read: boolean
  createdAt: string
}

export interface SeriesPoint {
  label: string
  iso: string
  amount: number
  necessary?: number
  unnecessary?: number
}

export interface OverviewDTO {
  todayTotal: number
  todayVar: number
  todayNecessary: number
  todayUnnecessary: number
  weekTotal: number
  monthTotal: number
  monthNecessary: number
  monthUnnecessary: number
  monthlyBudget: number
  dailyBudget: number
  weekendBudget: number
  savingsTarget: number
  remainingBudget: number
  dailyAvgVar: number
  projectedMonthEnd: number
  projectedSaving: number
  savingProgressPct: number
  dailyBudgetPct: number
  txToday: number
  txMonth: number
  txTotal: number
  topCategory: { name: string; color: string; icon: string; amount: number; pct: number } | null
  /** month spending wheel (Expense dynamics card): top categories + prorated trend */
  wheel: {
    total: number
    changePct: number | null // vs same elapsed days of previous month
    cats: { name: string; slug: string; color: string; icon: string; amount: number; pct: number }[]
  }
  last14: SeriesPoint[]
  recent: TransactionDTO[]
  unreadCount: number
}

export interface CategoryAggDTO {
  name: string
  color: string
  icon: string
  essential: boolean
  amount: number
  count: number
  pct: number
  prevAmount: number
  changePct: number | null
}

export interface AnalyticsDTO {
  byCategory: CategoryAggDTO[]
  byDay: SeriesPoint[]
  byWeek: SeriesPoint[]
  byMonth: SeriesPoint[]
  avgDailyThis: number
  avgDailyPrev: number
  highestDay: { label: string; amount: number } | null
  weekendPct: number | null
  weekThis: number
  weekPrev: number
  monthDailyRateThis: number
  monthDailyRatePrev: number
  monthChangePct: number | null
  recurring: { note: string; categoryName: string; categoryColor: string; icon: string; monthlyAvg: number; lastDate: string }[]
  small: { count: number; total: number; avg: number }
  unusual: { id: string; amount: number; note: string | null; date: string; categoryName: string; categoryColor: string; ratio: number }[]
  potential: {
    wastedMonth: number
    scenarios: { pct: number; month: number; year: number }[]
    byCategory: { name: string; color: string; amount: number }[]
  }
}

// ---------------------------------------------------------------- daily stats (per-date view)

export interface DailyDayDTO {
  iso: string // YYYY-MM-DD (Casablanca)
  day: number // 1..31
  total: number
  count: number
  necessary: number
  unnecessary: number
  weekend: boolean
  future: boolean
  topCats: { name: string; color: string; icon: string; amount: number }[]
}

export interface DailyMonthDTO {
  key: string // YYYY-MM
  label: string
  days: DailyDayDTO[]
}

export interface DailyStatsDTO {
  months: DailyMonthDTO[] // current month + 2 previous
  summary: {
    total: number
    txCount: number
    activeDays: number
    avgActive: number // per active day
    avgCalendar: number // per calendar day
    maxDay: { iso: string; total: number; count: number } | null
    minDay: { iso: string; total: number; count: number } | null // cheapest active day
    weekendAvg: number
    weekdayAvg: number
    weekendPct: number | null
    underBudgetDays: number
    overBudgetDays: number
    dailyBudget: number
    unnecessaryTotal: number
    unnecessaryPct: number
  }
}
