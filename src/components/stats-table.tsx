'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Flame, Table2, Filter } from 'lucide-react'
import { useApp } from './app-context'
import { formatMAD } from '@/lib/money'
import { CatIcon } from './cat-icon'
import { cn } from '@/lib/utils'
import type { DailyStatsDTO, DailyDayDTO } from '@/lib/types'

type SortKey = 'date' | 'total' | 'count' | 'necessary' | 'unnecessary'
type FilterKey = 'all' | 'over' | 'weekend' | 'top5'

const sortVal = (d: DailyDayDTO, k: SortKey): number =>
  k === 'date' ? Number(d.iso.replace(/-/g, '')) : k === 'count' ? d.count : d[k]

function SortTh({ k, active, asc, onSort, children, className }: {
  k: SortKey
  active: boolean
  asc: boolean
  onSort: (k: SortKey) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2.5 text-start font-semibold whitespace-nowrap', className)}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg px-1 py-0.5 -ms-1 transition-colors hover:text-foreground',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-label={typeof children === 'string' ? children : undefined}
      >
        {children}
        {active ? (
          asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

/** Smart per-date statistics table: sortable columns, smart filters,
 *  auto highlights (record day, over-budget, weekends), share bars keyed to
 *  category colors, totals footer. Trilingual + RTL-safe. */
export function StatsTable({
  stats, onPickDay, selectedIso,
}: {
  stats: DailyStatsDTO
  onPickDay?: (iso: string) => void
  selectedIso?: string | null
}) {
  const { t, lang } = useApp()
  const loc = lang === 'fr' ? 'fr-FR' : lang === 'ary' ? 'ar-MA' : 'en-GB'
  const s = stats.summary

  const [sortKey, setSortKey] = React.useState<SortKey>('date')
  const [sortAsc, setSortAsc] = React.useState(false)
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [monthKey, setMonthKey] = React.useState<string>('all')

  const allDays = React.useMemo(
    () => stats.months.flatMap((m) => m.days).filter((d) => !d.future && d.count > 0),
    [stats],
  )

  const top5 = React.useMemo(
    () => new Set([...allDays].sort((a, b) => b.total - a.total).slice(0, 5).map((d) => d.iso)),
    [allDays],
  )

  const rows = React.useMemo(() => {
    let out = allDays
    if (monthKey !== 'all') out = out.filter((d) => d.iso.startsWith(monthKey))
    if (filter === 'over' && s.dailyBudget > 0) out = out.filter((d) => d.total > s.dailyBudget)
    if (filter === 'weekend') out = out.filter((d) => d.weekend)
    if (filter === 'top5') out = out.filter((d) => top5.has(d.iso))
    return [...out].sort((a, b) => (sortAsc ? sortVal(a, sortKey) - sortVal(b, sortKey) : sortVal(b, sortKey) - sortVal(a, sortKey)))
  }, [allDays, monthKey, filter, sortKey, sortAsc, s.dailyBudget, top5])

  const maxTotal = React.useMemo(() => Math.max(...allDays.map((d) => d.total), 1), [allDays])
  const filteredTotal = rows.reduce((a, d) => a + d.total, 0)
  const filteredTx = rows.reduce((a, d) => a + d.count, 0)
  const filteredNec = rows.reduce((a, d) => a + d.necessary, 0)
  const filteredAvoid = rows.reduce((a, d) => a + d.unnecessary, 0)
  const activeRows = rows.filter((d) => d.count > 0).length

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((v) => !v)
    else {
      setSortKey(k)
      setSortAsc(false) // newest / biggest first by default
    }
  }

  const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(loc, opts).format(new Date(iso + 'T12:00:00Z'))

  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('ds.filterAll') },
    { key: 'over', label: t('ds.filterOver') },
    { key: 'weekend', label: t('ds.filterWeekend') },
    { key: 'top5', label: t('ds.filterTop') },
  ]

  return (
    <div className="space-y-3">
      {/* month chips + smart filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => setMonthKey('all')}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
              monthKey === 'all' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('ds.allMonths')}
          </button>
          {stats.months.map((m) => (
            <button
              key={m.key}
              onClick={() => setMonthKey(m.key)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all truncate max-w-28',
                monthKey === m.key ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
          <Filter className="size-3 mx-1 text-muted-foreground" aria-hidden />
          {filterChips.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
                filter === f.key ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground ms-auto hidden sm:inline">{t('ds.sortHint')}</span>
      </div>

      {/* table */}
      <div className="rounded-2xl border bg-card overflow-hidden card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" dir={lang === 'ary' ? 'rtl' : 'ltr'}>
            <thead className="bg-muted/60 backdrop-blur text-xs border-b">
              <tr>
                <SortTh k="date" active={sortKey === 'date'} asc={sortAsc} onSort={toggleSort}>{t('ds.colDate')}</SortTh>
                <SortTh k="total" active={sortKey === 'total'} asc={sortAsc} onSort={toggleSort}>{t('ds.colTotal')}</SortTh>
                <SortTh k="count" active={sortKey === 'count'} asc={sortAsc} onSort={toggleSort} className="w-16">{t('ds.colTx')}</SortTh>
                <SortTh k="necessary" active={sortKey === 'necessary'} asc={sortAsc} onSort={toggleSort}>{t('ds.colNec')}</SortTh>
                <SortTh k="unnecessary" active={sortKey === 'unnecessary'} asc={sortAsc} onSort={toggleSort}>{t('ds.colAvoid')}</SortTh>
                <th className="px-3 py-2.5 text-start font-semibold text-muted-foreground whitespace-nowrap w-36">{t('ds.colShare')}</th>
                <th className="px-3 py-2.5 text-start font-semibold text-muted-foreground whitespace-nowrap">{t('ds.colTop')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Table2 className="size-6 mx-auto mb-2 opacity-40" />
                    {t('ds.emptyTable')}
                  </td>
                </tr>
              )}
              {rows.map((d) => {
                const isMax = s.maxDay?.iso === d.iso
                const over = s.dailyBudget > 0 && d.total > s.dailyBudget
                const isSel = selectedIso === d.iso
                const pctOfDay = s.total > 0 ? Math.round((d.total / s.total) * 100) : 0
                return (
                  <tr
                    key={d.iso}
                    onClick={() => onPickDay?.(d.iso)}
                    className={cn(
                      'border-b border-border/40 last:border-0 transition-colors cursor-pointer',
                      isSel ? 'bg-primary/10' : 'hover:bg-accent/50',
                      d.weekend && !isSel && 'bg-amber-500/[0.045]',
                    )}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {d.weekend && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" title={t('ds.filterWeekend')} />}
                        <div className="leading-tight">
                          <div className="font-medium capitalize">{dayLabel(d.iso, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                          {d.iso === todayIso && <div className="text-[10px] text-primary font-semibold">{t('common.today')}</div>}
                        </div>
                        {isMax && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 text-rose-500 px-1.5 py-0.5 text-[10px] font-bold">
                            <Flame className="size-2.5" /> {t('ds.maxBadge')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('font-num font-bold', over && 'text-rose-500')}>{formatMAD(d.total, lang)}</span>
                      {over && (
                        <span className="ms-1.5 inline-block rounded-full bg-rose-500/10 text-rose-500 px-1.5 py-px text-[10px] font-bold align-middle">
                          {t('ds.overBadge')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-num text-muted-foreground">{d.count}</td>
                    <td className="px-3 py-2.5 font-num text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatMAD(d.necessary, lang)}</td>
                    <td className="px-3 py-2.5 font-num text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {d.unnecessary > 0 ? formatMAD(d.unnecessary, lang) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex min-w-14" aria-hidden>
                          {d.topCats.slice(0, 4).map((c, i) => (
                            <span
                              key={i}
                              className="h-full first:rounded-s-full"
                              style={{ width: `${(c.amount / maxTotal) * 100}%`, background: c.color }}
                            />
                          ))}
                        </div>
                        <span className="font-num text-[11px] text-muted-foreground w-9 text-end" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                          {pctOfDay}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {d.topCats[0] ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-5 rounded-md flex items-center justify-center shrink-0" style={{ background: `${d.topCats[0].color}1a`, color: d.topCats[0].color }}>
                            <CatIcon name={d.topCats[0].icon} className="size-3" />
                          </span>
                          <span className="text-xs font-medium truncate max-w-28">{d.topCats[0].name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/50 border-t text-xs">
                <tr>
                  <td className="px-3 py-2 font-bold">{t('ds.totalRow')}</td>
                  <td className="px-3 py-2 font-num font-bold">{formatMAD(filteredTotal, lang)}</td>
                  <td className="px-3 py-2 font-num">{filteredTx}</td>
                  <td className="px-3 py-2 font-num text-emerald-600 dark:text-emerald-400">{formatMAD(filteredNec, lang)}</td>
                  <td className="px-3 py-2 font-num text-amber-600 dark:text-amber-400">{formatMAD(filteredAvoid, lang)}</td>
                  <td className="px-3 py-2 font-num text-muted-foreground" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                    {s.total > 0 ? Math.round((filteredTotal / s.total) * 100) : 0}%
                  </td>
                  <td className="px-3 py-2" />
                </tr>
                <tr className="border-t border-border/30">
                  <td className="px-3 py-2 text-muted-foreground">{t('ds.avgRow')}</td>
                  <td className="px-3 py-2 font-num text-muted-foreground">
                    {activeRows > 0 ? formatMAD(Math.round(filteredTotal / activeRows), lang) : '—'}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
