'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AnalyticsDTO, CategoryDTO, DailyStatsDTO, NotifDTO, OverviewDTO, SettingsDTO, TransactionDTO } from '@/lib/types'
import type { Lang } from '@/lib/i18n'
import { clearMirror } from '@/lib/mirror'

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ---------------- settings ----------------

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => j<SettingsDTO>('/api/settings'),
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SettingsDTO>) => j<{ ok: boolean }>('/api/settings', jsonInit('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// ---------------- overview + analytics ----------------

export function useOverview(lang: Lang) {
  return useQuery({
    queryKey: ['overview', lang],
    queryFn: () => j<{ overview: OverviewDTO; analytics: AnalyticsDTO }>(`/api/overview?lang=${lang}`),
    staleTime: 60_000,
  })
}

export function useAnalytics(lang: Lang, days = 30) {
  return useQuery({
    queryKey: ['analytics', lang, days],
    queryFn: () => j<AnalyticsDTO>(`/api/analytics?lang=${lang}&days=${days}`),
    staleTime: 60_000,
  })
}

export function useDailyStats(lang: Lang) {
  return useQuery({
    queryKey: ['daily', lang],
    queryFn: () => j<DailyStatsDTO>(`/api/daily?lang=${lang}`),
    staleTime: 60_000,
  })
}

// ---------------- transactions ----------------

export interface TxFilters {
  q?: string
  category?: string
  essential?: '' | 'yes' | 'no'
  recurring?: '' | 'yes' | 'no'
  from?: string // ISO instant — date-range search start
  to?: string // ISO instant — date-range search end
  weekday?: number | null // smart search — recurring Casablanca weekday (0=Sun)
  amount?: number | null // smart search — exact amount
  sort?: 'new' | 'old' | 'high' | 'low'
  limit?: number
  offset?: number
}

export function txQueryKey(f: TxFilters) {
  return ['transactions', f.q ?? '', f.category ?? '', f.essential ?? '', f.recurring ?? '', f.from ?? '', f.to ?? '', f.weekday ?? '', f.amount ?? '', f.sort ?? 'new']
}

/** Aggregate over the whole filtered set — powers the smart-search card. */
export interface TxAgg {
  sum: number
  avg: number
  max: number
  maxNote: string | null
  maxDate: string | null
  essPct: number
  topDay: number | null
  topDayPct: number
}

export interface CatSumDTO {
  id: string
  name: string
  icon: string
  color: string
  count: number
  total: number
}

export interface SimilarHitDTO {
  id: string
  amount: number
  note: string | null
  date: string
  categoryId: string
  score: number
  kind: 'duplicate' | 'recurring' | 'merchant' | 'pattern'
  daysAgo: number
}

export interface SimilarGroupDTO {
  count: number
  total: number
  items: SimilarHitDTO[]
  cadenceDays: number | null
}

export function useTransactions(filters: TxFilters, lang?: string) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.category) params.set('category', filters.category)
  if (filters.essential) params.set('essential', filters.essential)
  if (filters.recurring) params.set('recurring', filters.recurring)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.weekday != null) params.set('weekday', String(filters.weekday))
  if (filters.amount != null) params.set('amount', String(filters.amount))
  if (filters.sort) params.set('sort', filters.sort)
  params.set('limit', String(filters.limit ?? 50))
  params.set('offset', String(filters.offset ?? 0))
  if (lang) params.set('lang', lang) // localized category names + catSums
  return useQuery({
    // limit/offset MUST be part of the key — otherwise "Load more" (limit 50→100)
    // keeps the same key and React Query never refetches
    queryKey: [...txQueryKey(filters), filters.limit ?? 50, filters.offset ?? 0, lang ?? ''],
    queryFn: () => j<{ total: number; agg: TxAgg; catSums: CatSumDTO[]; transactions: TransactionDTO[] }>(`/api/transactions?${params}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData, // keep rows visible while the next page loads
  })
}

export function useSaveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tx: {
      id?: string
      amount: number
      note?: string
      categoryId: string
      date?: string
      necessary?: boolean | null
      icon?: string | null
      isRecurring?: boolean
      paymentMethod?: string
    }) => (tx.id ? j('/api/transactions/' + tx.id, jsonInit('PATCH', tx)) : j('/api/transactions', jsonInit('POST', tx))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      qc.invalidateQueries({ queryKey: ['daily'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => j(`/api/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      qc.invalidateQueries({ queryKey: ['daily'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

// ---------------- categories ----------------

export function useCategories(lang: Lang) {
  return useQuery({
    queryKey: ['categories', lang],
    queryFn: () => j<CategoryDTO[]>(`/api/categories?lang=${lang}`),
    staleTime: 5 * 60_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: { nameEn: string; nameFr?: string; nameAr?: string; icon: string; color: string; essential: boolean }) =>
      j<{ id: string }>('/api/categories', jsonInit('POST', c)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & { nameEn?: string; nameFr?: string; nameAr?: string; icon?: string; color?: string; essential?: boolean }) =>
      j<{ ok: boolean }>(`/api/categories/${id}`, jsonInit('PATCH', patch)),
    // a rename changes labels everywhere (overview wheel, analytics, lists)
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => j(`/api/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

// ---------------- budgets ----------------

export interface BudgetRow {
  id: string
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string
  categoryColor: string
  amount: number
  spent: number
  pct: number
  remaining: number
  status: 'ok' | 'warn' | 'over'
}

export interface BudgetsDTO {
  monthlyBudget: number
  dailyBudget: number
  weekendBudget: number
  monthSpent: number
  overallPct: number
  budgets: BudgetRow[]
  availableCategories: { id: string; name: string; icon: string; color: string }[]
}

export function useBudgets(lang: Lang) {
  return useQuery({
    queryKey: ['budgets', lang],
    queryFn: () => j<BudgetsDTO>(`/api/budgets?lang=${lang}`),
    staleTime: 30_000,
  })
}

export function useSaveBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { categoryId: string; amount: number }) => j('/api/budgets', jsonInit('POST', b)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => j(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

// ---------------- goals ----------------

export interface GoalDTO {
  id: string
  title: string
  emoji: string
  targetAmount: number
  currentAmount: number
  deadline: string | null
  pct: number
  completed: boolean
}

export function useGoals() {
  return useQuery({ queryKey: ['goals'], queryFn: () => j<GoalDTO[]>('/api/goals'), staleTime: 30_000 })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (g: { title: string; emoji: string; targetAmount: number; currentAmount?: number; deadline?: string | null }) =>
      j('/api/goals', jsonInit('POST', g)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; addAmount?: number; title?: string; targetAmount?: number; deadline?: string | null }) =>
      j(`/api/goals/${id}`, jsonInit('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => j(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

// ---------------- notifications ----------------

export function useNotifications(lang: Lang) {
  return useQuery({
    queryKey: ['notifications', lang],
    queryFn: () => j<{ notifications: NotifDTO[]; unread: number }>(`/api/notifications?lang=${lang}`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => j('/api/notifications', jsonInit('PATCH', { markAllRead: true })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useClearNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => j('/api/notifications?scope=all', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => j(`/api/notifications/${id}`, jsonInit('PATCH', {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

// ---------------- wipe / start from zero ----------------

export function useWipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => j<{ transactions: number }>('/api/reset', { method: 'POST' }),
    onSuccess: () => {
      clearMirror() // intentional wipe → forget the device mirror, never resurrect
      qc.invalidateQueries()
    },
  })
}

// ---------------- backup / restore ----------------

export function downloadBackup(format: 'json' | 'csv') {
  const a = document.createElement('a')
  a.href = `/api/export?format=${format}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function useImportBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('bad-file')
      }
      const res = await fetch('/api/import', jsonInit('POST', parsed))
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || 'import-failed')
      }
      return (await res.json()) as { transactions: number; invalid: number }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------- auto-backup status ----------------

export interface BackupStatus {
  last: string | null
  transactions: number
  budgets: number
  goals: number
  mode?: 'turso' | 'local'
}

export function useBackupStatus() {
  return useQuery({
    queryKey: ['backup-status'],
    queryFn: () => j<BackupStatus>('/api/backup-status'),
    staleTime: 30_000,
  })
}

// ---------------- Floussi IQ (financial intelligence) ----------------

export interface IntelligenceTipDTO {
  key: string
  params?: Record<string, string | number>
  tone: 'good' | 'warn' | 'bad' | 'info'
}

export interface IntelligenceDTO {
  empty: boolean
  score: number
  gradeKey: string
  burn: number
  projected: number
  monthBudget: number
  monthSpent: number
  projectedSaving: number
  elapsedPct: number
  usedPct: number
  safeToday: number
  dailyBudget: number
  streak: number
  anomalies: { name: string; icon: string; color: string; pct: number; delta: number }[]
  weekendShare: number
  necessaryShare: number
  tips: IntelligenceTipDTO[]
}

export function useIntelligence(lang: string) {
  return useQuery({
    queryKey: ['intelligence', lang],
    queryFn: () => j<IntelligenceDTO>(`/api/intelligence?lang=${lang}`),
    staleTime: 60_000,
  })
}

// ---------------- Intelligence Hub (pro analytics layer) ----------------

export interface RecurringGroupDTO {
  label: string
  count: number
  total: number
  avg: number
  cadenceDays: number | null
  lastDate: string
  categoryName: string
  icon: string
  color: string
}

export interface MerchantDTO {
  label: string
  count: number
  total: number
  categoryName: string
  icon: string
  color: string
}

export interface CatTrendDTO {
  name: string
  icon: string
  color: string
  total: number
  prev: number
  deltaPct: number | null
  sharePct: number
}

export interface IntelDTO {
  health: IntelligenceDTO
  monthTotal: number
  prevMonthTotal: number
  deltaPct: number | null
  txCount: number
  recurring: RecurringGroupDTO[]
  recurringMonthlyEstimate: number
  merchants: MerchantDTO[]
  cats: CatTrendDTO[]
  week: { date: string; total: number; weekend: boolean }[]
}

export function useIntel(lang: string) {
  return useQuery({
    queryKey: ['intel', lang],
    queryFn: () => j<IntelDTO>(`/api/intel?lang=${lang}`),
    staleTime: 60_000,
  })
}

// ---------------- per-transaction stats ----------------

export interface TxStatsDTO {
  tx: {
    id: string
    amount: number
    note: string | null
    date: string
    necessary: boolean
    icon?: string | null
    isRecurring: boolean
    paymentMethod: string
    categoryId: string
    category: { slug: string; nameEn: string; nameFr: string; nameAr: string; nameAry?: string | null; icon: string; color: string }
  }
  stats: {
    monthCount: number
    monthTotal: number
    monthShare: number
    categoryTotal: number
    categoryShare: number
    categoryCount: number
    categoryRank: number | null
    avgTx: number
    multipleOfAvg: number | null
    dayTotal: number
    dayCount: number
    isWeekend: boolean
    allTimeCount: number
    allTimeTotal: number
    monthKey: string
  }
  similar: SimilarGroupDTO
}

export function useTxStats(id: string | null) {
  return useQuery({
    queryKey: ['tx-stats', id],
    queryFn: () => j<TxStatsDTO>(`/api/transactions/${id}/stats`),
    enabled: !!id,
    staleTime: 60_000,
  })
}
