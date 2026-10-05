'use client'

import * as React from 'react'
import { Search, MoreHorizontal, Pencil, Trash2, Repeat, Info, LayoutList, PieChart, CalendarDays, Sparkles, Coins, X } from 'lucide-react'
import { useApp } from './app-context'
import { useAppStore } from '@/lib/store'
import { useCategories, useDeleteTransaction, useTransactions, type CatSumDTO } from './api'
import type { TransactionDTO } from '@/lib/types'
import { formatMAD } from '@/lib/money'
import { parseSmartQuery, buildSmartComment, type SmartChip } from '@/lib/smart-search'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TxDetailSheet } from './tx-detail-sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QueryErrorState } from './feedback'
import { CatIcon } from './cat-icon'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { intlLocale, type Key } from '@/lib/i18n'

type Filter = '' | 'yes' | 'no'
type GroupView = 'day' | 'cat'
type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

/** Local-timezone day helpers — the range is computed on-device so "today"
 *  always means the user's own today (Casablanca), regardless of server TZ. */
function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dateRange(preset: DatePreset, fromStr: string, toStr: string): { from?: string; to?: string } {
  if (preset === 'all') return {}
  const now = new Date()
  if (preset === 'today') {
    return { from: startOfDay(now).toISOString(), to: now.toISOString() }
  }
  if (preset === 'week') {
    const s = startOfDay(now)
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7)) // Monday start
    return { from: s.toISOString(), to: now.toISOString() }
  }
  if (preset === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: s.toISOString(), to: now.toISOString() }
  }
  // custom — <input type="date"> gives YYYY-MM-DD, parsed in local time
  const r: { from?: string; to?: string } = {}
  if (fromStr) {
    const d = new Date(`${fromStr}T00:00:00`)
    if (!isNaN(d.getTime())) r.from = d.toISOString()
  }
  if (toStr) {
    const d = new Date(`${toStr}T23:59:59.999`)
    if (!isNaN(d.getTime())) r.to = d.toISOString()
  }
  return r
}

export function TransactionsView() {
  const { t, lang } = useApp()
  const setEditing = useAppStore((s) => s.setEditing)
  const openAdd = useAppStore((s) => s.openAdd)
  const del = useDeleteTransaction()

  const [q, setQ] = React.useState('')
  const [essential, setEssential] = React.useState<Filter>('')
  const [recurring, setRecurring] = React.useState<'' | 'yes'>('')
  const [category, setCategory] = React.useState('')
  const [datePreset, setDatePreset] = React.useState<DatePreset>('all')
  const [fromStr, setFromStr] = React.useState('')
  const [toStr, setToStr] = React.useState('')
  const [sort, setSort] = React.useState<'new' | 'old' | 'high' | 'low'>('new')
  const [limit, setLimit] = React.useState(50)
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [view, setView] = React.useState<GroupView>('day')

  const { data: cats } = useCategories(lang)
  const range = React.useMemo(() => dateRange(datePreset, fromStr, toStr), [datePreset, fromStr, toStr])

  // smart search — natural language → structured filters (dates, weekdays, amounts, keywords)
  const sm = React.useMemo(() => parseSmartQuery(q, lang), [q, lang])
  const removeChip = React.useCallback((c: SmartChip) => {
    setQ((cur) => {
      let out = cur
      for (const s of c.removeSpans) out = out.replace(s, ' ')
      return out.replace(/\s+/g, ' ').trim()
    })
  }, [])

  // "By category" loads the whole filtered set (server cap 500) so every group
  // lists ALL its transactions; day view stays paginated with Load more
  const effLimit = view === 'cat' ? 500 : limit
  const filters = {
    q: sm.q,
    essential,
    recurring,
    category,
    sort,
    limit: effLimit,
    from: sm.from ?? range.from,
    to: sm.to ?? range.to,
    weekday: sm.weekday,
    amount: sm.amount,
  }
  const { data, isLoading, isFetching, isError, refetch } = useTransactions(filters, lang)

  const fmtDay = new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' })

  // group by Casablanca day key
  const groups = React.useMemo(() => {
    const map = new Map<string, { label: string; total: number; items: TransactionDTO[] }>()
    for (const tx of data?.transactions ?? []) {
      const d = new Date(tx.date)
      const shifted = new Date(d.getTime() + 3600000)
      const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
      const g = map.get(key) ?? { label: fmtDay.format(shifted), total: 0, items: [] }
      g.total += tx.amount
      g.items.push(tx)
      map.set(key, g)
    }
    return [...map.entries()]
  }, [data, lang])

  // category groups: exact sums from the server (whole filtered set),
  // rows from the currently loaded page
  const catGroups = React.useMemo(() => {
    const sums = data?.catSums ?? []
    const txs = data?.transactions ?? []
    return sums
      .map((s) => ({ ...s, items: txs.filter((tx) => tx.category.id === s.id) }))
      .filter((s) => s.items.length > 0 || sums.length <= 8)
  }, [data])

  const total = data?.total ?? 0
  const smartActive = q.trim() !== ''
  const comment = React.useMemo(
    () => (data ? buildSmartComment(sm, data.agg, data.total, lang) : ''),
    [sm, data, lang]
  )

  const openDetail = React.useCallback((id: string) => setDetailId(id), [])
  const editTx = React.useCallback(
    (tx: TransactionDTO) =>
      setEditing({
        id: tx.id,
        amount: tx.amount,
        note: tx.note,
        categoryId: tx.category.id,
        date: tx.date,
        necessary: tx.necessary,
        isRecurring: tx.isRecurring,
        paymentMethod: tx.paymentMethod,
      }),
    [setEditing]
  )

  const chips: { value: Filter; label: string; key: Key }[] = [
    { value: '', label: t('common.all'), key: 'common.all' },
    { value: 'yes', label: t('common.essential'), key: 'common.essential' },
    { value: 'no', label: t('common.avoidable'), key: 'common.avoidable' },
  ]

  const dateChips: { v: DatePreset; label: string }[] = [
    { v: 'all', label: t('tx.dateAll') },
    { v: 'today', label: t('tx.dateToday') },
    { v: 'week', label: t('tx.dateWeek') },
    { v: 'month', label: t('tx.dateMonth') },
    { v: 'custom', label: t('tx.dateCustom') },
  ]

  const viewTabs: { v: GroupView; label: string; icon: React.ElementType }[] = [
    { v: 'day', label: t('tx.groupDay'), icon: LayoutList },
    { v: 'cat', label: t('tx.groupCat'), icon: PieChart },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight">{t('tx.title')}</h2>
        <Button onClick={openAdd} className="rounded-xl h-10">{t('nav.addExpense')}</Button>
      </div>

      {/* toolbar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('tx.searchPh')}
            className="ps-10 h-11 rounded-2xl bg-card"
          />
        </div>
        {/* date-range search */}
        <div className="flex gap-2 items-center overflow-x-auto no-scrollbar pb-1">
          <span className="size-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <CalendarDays className="size-4 text-muted-foreground" />
          </span>
          <div className="flex gap-1.5">
            {dateChips.map((c) => (
              <button
                key={c.v}
                onClick={() => setDatePreset(c.v)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap',
                  datePreset === c.v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground hover:bg-accent'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 rounded-2xl border bg-card p-2.5">
            <label className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground shrink-0">{t('tx.dateFrom')}</span>
              <Input
                type="date"
                value={fromStr}
                max={toStr || undefined}
                onChange={(e) => setFromStr(e.target.value)}
                className="h-9 rounded-xl text-xs font-num bg-background"
              />
            </label>
            <span className="text-muted-foreground/60 text-xs shrink-0">→</span>
            <label className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground shrink-0">{t('tx.dateTo')}</span>
              <Input
                type="date"
                value={toStr}
                min={fromStr || undefined}
                onChange={(e) => setToStr(e.target.value)}
                className="h-9 rounded-xl text-xs font-num bg-background"
              />
            </label>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <div className="flex gap-1.5 shrink-0">
            {chips.map((c) => (
              <button
                key={c.value}
                onClick={() => setEssential(c.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap',
                  essential === c.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground hover:bg-accent'
                )}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => setRecurring(recurring === 'yes' ? '' : 'yes')}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap inline-flex items-center gap-1.5',
                recurring === 'yes'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground hover:bg-accent'
              )}
            >
              <Repeat className="size-3" /> {t('common.recurring')}
            </button>
          </div>
          <div className="ms-auto flex gap-2 shrink-0">
            <Select value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 rounded-full text-xs w-[130px] sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {cats?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="h-9 rounded-full text-xs w-[110px] sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('tx.sortNew')}</SelectItem>
                <SelectItem value="old">{t('tx.sortOld')}</SelectItem>
                <SelectItem value="high">{t('tx.sortHigh')}</SelectItem>
                <SelectItem value="low">{t('tx.sortLow')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">{t('tx.count', { n: total })}</p>
          {/* group-view toggle */}
          <div className="inline-flex rounded-full border bg-card p-0.5">
            {viewTabs.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* smart search — result summary + intelligent comment */}
      {smartActive && data && (
        <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-4 space-y-3 card-shadow">
          <div className="flex items-center gap-2">
            <span className="size-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="size-4" />
            </span>
            <p className="text-sm font-bold">{t('tx.smartTitle')}</p>
          </div>
          {sm.chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sm.chips.map((c, i) => (
                <span
                  key={`${c.kind}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-background/80 border ps-2 pe-1.5 py-1 text-[11px] font-semibold max-w-full"
                >
                  {c.kind === 'when' ? (
                    <CalendarDays className="size-3 text-primary shrink-0" />
                  ) : c.kind === 'amount' ? (
                    <Coins className="size-3 text-primary shrink-0" />
                  ) : (
                    <Search className="size-3 text-primary shrink-0" />
                  )}
                  <span className="truncate">{c.label}</span>
                  <button
                    onClick={() => removeChip(c)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="remove"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">{t('tx.smartTotal')}</p>
              <p className="text-[26px] leading-none font-bold font-num mt-1">{formatMAD(data.agg.sum, lang)}</p>
            </div>
            <div className="flex gap-4 text-end">
              <div>
                <p className="text-sm font-bold font-num leading-none">{data.total}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t('tx.smartN')}</p>
              </div>
              <div>
                <p className="text-sm font-bold font-num leading-none">{formatMAD(data.agg.avg, lang)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t('tx.smartAvg')}</p>
              </div>
              <div>
                <p className="text-sm font-bold font-num leading-none">{formatMAD(data.agg.max, lang)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t('tx.smartMax')}</p>
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground border-t border-primary/10 pt-2.5">{comment}</p>
        </div>
      )}

      {/* list */}
      {isError ? (
        <QueryErrorState title={t('err.title')} desc={t('err.descTx')} retry={t('err.retry')} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : total === 0 && !smartActive ? (
        <div className="rounded-3xl border border-dashed py-14 text-center">
          <p className="font-semibold">{t('tx.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('tx.emptyHint')}</p>
        </div>
      ) : view === 'day' ? (
        <div className="space-y-5">
          {groups.map(([key, g]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-xs font-semibold text-muted-foreground capitalize">{g.label}</span>
                <span className="text-xs font-num font-semibold text-muted-foreground">{formatMAD(g.total, lang)}</span>
              </div>
              <div className="rounded-2xl border bg-card card-shadow overflow-hidden divide-y">
                {g.items.map((tx) => (
                  <TxRow key={tx.id} tx={tx} onOpen={openDetail} onEdit={editTx} onDelete={setConfirmId} />
                ))}
              </div>
            </div>
          ))}
          <MoreButton
            shown={data?.transactions.length ?? 0}
            total={total}
            isFetching={isFetching}
            onMore={() => setLimit((l) => l + 50)}
            label={isFetching ? t('common.loading') : t('tx.showMore')}
            progressLabel={t('tx.shownOf', { shown: data?.transactions.length ?? 0, n: total })}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {catGroups.map((s) => (
            <div key={s.id} className="rounded-2xl border bg-card card-shadow overflow-hidden">
              <div className="flex items-center gap-2.5 px-3.5 py-3 bg-muted/40 border-b">
                <span
                  className="size-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${s.color}1a`, color: s.color }}
                >
                  <CatIcon name={s.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{t('tx.catCount', { n: s.count })}</p>
                </div>
                <span className="font-num font-bold text-sm" style={{ color: s.color }}>
                  {formatMAD(s.total, lang)}
                </span>
              </div>
              <div className="divide-y">
                {s.items.length > 0 ? (
                  s.items.map((tx) => (
                    <TxRow key={tx.id} tx={tx} onOpen={openDetail} onEdit={editTx} onDelete={setConfirmId} compact />
                  ))
                ) : (
                  <p className="px-3.5 py-3 text-xs text-muted-foreground">{t('tx.showMore')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TxDetailSheet txId={detailId} onClose={() => setDetailId(null)} onAskDelete={(id) => setConfirmId(id)} />

      <AlertDialog open={confirmId !== null} onOpenChange={(v) => !v && setConfirmId(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('tx.deletedToast')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmId) del.mutate(confirmId, { onSuccess: () => toast.success(t('tx.deletedToast')) })
                setConfirmId(null)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MoreButton({ shown, total, isFetching, onMore, label, progressLabel }: { shown: number; total: number; isFetching: boolean; onMore: () => void; label: string; progressLabel: string }) {
  if (total <= shown && shown <= 50) return null
  return (
    <div className="text-center space-y-1.5">
      {total > shown && (
        <Button variant="outline" onClick={onMore} disabled={isFetching} className="rounded-xl min-w-40">
          {label}
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground font-num">{progressLabel}</p>
    </div>
  )
}

const TxRow = React.memo(function TxRow({
  tx,
  onOpen,
  onEdit,
  onDelete,
  compact,
}: {
  tx: TransactionDTO
  onOpen: (id: string) => void
  onEdit: (tx: TransactionDTO) => void
  onDelete: (id: string) => void
  compact?: boolean
}) {
  const { t, lang } = useApp()
  return (
    <div
      onClick={() => onOpen(tx.id)}
      className="flex items-center gap-3 px-3.5 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
    >
      <span
        className={cn('rounded-xl flex items-center justify-center shrink-0', compact ? 'size-8' : 'size-10')}
        style={{ background: `${tx.category.color}1a`, color: tx.category.color }}
      >
        <CatIcon name={tx.icon ?? tx.category.icon} className={compact ? 'size-3.5' : 'size-4.5'} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{tx.note || tx.category.name}</span>
          {tx.isRecurring && <Repeat className="size-3 text-muted-foreground shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{tx.category.name}</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide',
              tx.necessary ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            )}
          >
            {tx.necessary ? t('common.essential') : t('common.avoidable')}
          </span>
        </div>
      </div>
      <span className="font-num font-semibold">{formatMAD(tx.amount, lang)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="size-8 rounded-lg opacity-60 group-hover:opacity-100">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onOpen(tx.id)}>
            <Info className="size-4" /> {t('txd.title')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(tx)}>
            <Pencil className="size-4" /> {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(tx.id)} className="text-destructive focus:text-destructive">
            <Trash2 className="size-4" /> {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
