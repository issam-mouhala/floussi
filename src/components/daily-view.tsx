'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, Flame, Feather, TrendingUp, TrendingDown, Coins, Sparkles, Table2 } from 'lucide-react'
import { useApp } from './app-context'
import { useDailyStats } from './api'
import { formatMAD } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { CatIcon } from './cat-icon'
import { StatsTable } from './stats-table'
import type { DailyDayDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function dayLabel(iso: string, loc: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(loc, opts).format(new Date(iso + 'T12:00:00Z'))
}

/** 4-step emerald intensity from quartiles of non-zero day totals. */
function useLevels(data: DailyDayDTO[] | undefined): number[] {
  return React.useMemo(() => {
    if (!data) return [1, 2, 3, 4]
    const v = data.filter((d) => !d.future && d.total > 0).map((d) => d.total).sort((a, b) => a - b)
    if (v.length === 0) return [1, 2, 3, 4]
    const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))]
    return [q(0.25), q(0.5), q(0.75), q(0.98)]
  }, [data])
}

function levelClass(total: number, levels: number[]): string {
  if (total <= 0) return 'bg-muted'
  if (total <= levels[0]) return 'bg-emerald-500/25'
  if (total <= levels[1]) return 'bg-emerald-500/45'
  if (total <= levels[2]) return 'bg-emerald-500/70'
  return 'bg-emerald-500/90'
}

function KpiCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <Card className="card-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          <Icon className={cn('size-3.5', tone)} /> {label}
        </div>
        <div className="font-num font-bold text-xl truncate" dir={value.includes('%') ? 'ltr' : undefined} style={value.includes('%') ? { unicodeBidi: 'isolate' } : undefined}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function DailyView() {
  const { t, lang, dir } = useApp()
  const loc = lang === 'fr' ? 'fr-FR' : lang === 'ary' ? 'ar-MA' : 'en-GB'
  const { data, isLoading } = useDailyStats(lang)

  const [monthIdx, setMonthIdx] = React.useState(2) // current month
  const [selected, setSelected] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<'calendar' | 'table'>('calendar')
  const todayIso = isoOf(new Date())
  const levels = useLevels(data?.months.flatMap((m) => m.days))

  React.useEffect(() => {
    if (data && monthIdx > data.months.length - 1) setMonthIdx(data.months.length - 1)
  }, [data, monthIdx])

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }

  const s = data.summary
  const month = data.months[Math.min(monthIdx, data.months.length - 1)]
  const allDays = data.months.flatMap((m) => m.days)
  const sel: DailyDayDTO | undefined = selected
    ? allDays.find((d) => d.iso === selected)
    : month.days.find((d) => d.iso === todayIso)
  const active = sel && !sel.future ? sel : undefined

  // Monday-first weekday headers (grid mirrors automatically in RTL)
  const wdHeaders = Array.from({ length: 7 }, (_, i) => {
    const monday = new Date('2024-01-01T12:00:00Z')
    monday.setUTCDate(monday.getUTCDate() + i)
    return new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(monday)
  })

  // leading blanks: Monday-first offset of day 1
  const firstDow = (new Date(month.days[0].iso + 'T12:00:00Z').getUTCDay() + 6) % 7
  const blanks = Array.from({ length: firstDow })

  // last 30 days (newest first) for the list
  const last30 = allDays
    .filter((d) => !d.future && d.iso <= todayIso)
    .slice(-30)
    .reverse()

  const hasData = s.total > 0

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('ds.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('ds.subtitle')}</p>
        </div>
        {/* Calendar | Smart table segmented control */}
        <div className="inline-flex rounded-2xl bg-muted p-1 gap-1" role="tablist" aria-label={t('ds.title')}>
          {([['calendar', t('ds.tabCalendar'), CalendarDays], ['table', t('ds.tabTable'), Table2]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
                tab === k ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <Card className="card-shadow">
          <CardContent className="p-10 text-center space-y-3">
            <div className="mx-auto size-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
              <CalendarDays className="size-7" />
            </div>
            <div className="font-semibold text-lg">{t('ds.empty')}</div>
            <p className="text-sm text-muted-foreground">{t('ds.emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={Coins} label={t('ds.avgActive')}
              value={formatMAD(s.avgActive, lang)}
              sub={t('ds.avgActiveDesc', { n: s.activeDays })}
              tone="text-primary"
            />
            <KpiCard
              icon={Flame} label={t('ds.maxDay')}
              value={s.maxDay ? formatMAD(s.maxDay.total, lang) : '—'}
              sub={s.maxDay ? dayLabel(s.maxDay.iso, loc, { day: 'numeric', month: 'short' }) : undefined}
              tone="text-rose-500"
            />
            <KpiCard
              icon={Feather} label={t('ds.minDay')}
              value={s.minDay ? formatMAD(s.minDay.total, lang) : '—'}
              sub={s.minDay ? dayLabel(s.minDay.iso, loc, { day: 'numeric', month: 'short' }) : undefined}
              tone="text-sky-500"
            />
            <KpiCard
              icon={s.weekendPct !== null && s.weekendPct > 0 ? TrendingUp : TrendingDown}
              label={t('ds.weekend')}
              value={s.weekendPct === null ? '—' : `${s.weekendPct > 0 ? '+' : ''}${s.weekendPct}%`}
              sub={
                s.weekendPct === null
                  ? `${formatMAD(s.weekendAvg, lang)} / ${formatMAD(s.weekdayAvg, lang)}`
                  : s.weekendPct >= 0
                    ? t('ds.weekendMore', { pct: `${s.weekendPct}%` })
                    : t('ds.weekendLess', { pct: `${-s.weekendPct}%` })
              }
              tone={s.weekendPct !== null && s.weekendPct > 0 ? 'text-amber-500' : 'text-emerald-500'}
            />
          </div>

          {tab === 'calendar' ? (
            <>
          {/* Calendar heatmap */}
          <Card className="card-shadow">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-semibold">{t('ds.calendar')}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{t('ds.calendarDesc')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label="prev"
                  disabled={monthIdx === 0}
                  onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
                  className="size-8 rounded-xl border flex items-center justify-center transition-colors hover:bg-accent disabled:opacity-30"
                >
                  {dir === 'rtl' ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                </button>
                <span className="text-sm font-semibold font-num min-w-28 text-center">{month.label}</span>
                <button
                  aria-label="next"
                  disabled={monthIdx >= data.months.length - 1}
                  onClick={() => setMonthIdx((i) => Math.min(data.months.length - 1, i + 1))}
                  className="size-8 rounded-xl border flex items-center justify-center transition-colors hover:bg-accent disabled:opacity-30"
                >
                  {dir === 'rtl' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {wdHeaders.map((w, i) => (
                  <div key={i} className={cn('text-center text-[10px] font-semibold', i >= 5 ? 'text-amber-500/80' : 'text-muted-foreground')}>
                    {w}
                  </div>
                ))}
              </div>
              <motion.div
                key={month.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-7 gap-1.5"
              >
                {blanks.map((_, i) => <div key={`b${i}`} />)}
                {month.days.map((d) => {
                  const isToday = d.iso === todayIso
                  const isSel = (selected ?? todayIso) === d.iso
                  return (
                    <button
                      key={d.iso}
                      disabled={d.future}
                      title={`${d.day} · ${formatMAD(d.total, lang)}`}
                      onClick={() => { setSelected(d.iso); setMonthIdx(data.months.findIndex((m) => m.key === month.key)) }}
                      className={cn(
                        'relative h-9 sm:h-10 rounded-xl text-[11px] font-num font-semibold transition-all',
                        levelClass(d.total, levels),
                        d.future && 'opacity-25 pointer-events-none',
                        isSel && 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-[1.04]',
                        !isSel && 'hover:ring-1 hover:ring-primary/40',
                      )}
                    >
                      <span className={cn('absolute top-1 start-1.5 leading-none', d.total > 0 ? 'text-foreground/80' : 'text-muted-foreground')}>
                        {d.day}
                      </span>
                      {isToday && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />}
                      {d.total > 0 && d.count > 0 && (
                        <span className="absolute bottom-1 end-1.5 leading-none text-[9px] text-foreground/60">{d.count}</span>
                      )}
                    </button>
                  )
                })}
              </motion.div>
              <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                <span>{t('ds.less')}</span>
                {['bg-muted', 'bg-emerald-500/25', 'bg-emerald-500/45', 'bg-emerald-500/70', 'bg-emerald-500/90'].map((c) => (
                  <span key={c} className={cn('size-3 rounded-[4px]', c)} />
                ))}
                <span>{t('ds.more')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Selected day detail */}
          <AnimatePresence mode="wait">
            <motion.div
              key={active?.iso ?? 'none'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <Card className="card-shadow border-primary/20 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-amber-500/8 pointer-events-none" />
                <CardContent className="p-5 sm:p-6 relative">
                  {active ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-lg capitalize">{dayLabel(active.iso, loc)}</h3>
                            {active.iso === todayIso && (
                              <Badge className="rounded-full bg-primary/15 text-primary border-0">{t('common.today')}</Badge>
                            )}
                            {active.weekend && (
                              <Badge variant="outline" className="rounded-full text-amber-500 border-amber-500/40">Weekend</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('ds.dayTx', { n: active.count })}</p>
                        </div>
                        <div className="text-end">
                          <div className="text-3xl sm:text-4xl font-extrabold font-num">{formatMAD(active.total, lang)}</div>
                          {s.avgActive > 0 && active.total > 0 && (
                            <div className="text-[11px] text-muted-foreground font-num mt-1">
                              {t('ds.vsAvg', { x: (active.total / s.avgActive).toFixed(1), avg: formatMAD(s.avgActive, lang) })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* necessary vs avoidable */}
                      {active.total > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-2 rounded-full bg-emerald-500" /> {t('ds.necessary')} · <span className="font-num">{formatMAD(active.necessary, lang)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-num">{formatMAD(active.unnecessary, lang)}</span> {t('ds.avoidable')} <span className="size-2 rounded-full bg-amber-500" />
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
                            <motion.div
                              className="h-full bg-emerald-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${(active.necessary / Math.max(1, active.total)) * 100}%` }}
                              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            />
                            <motion.div
                              className="h-full bg-amber-400"
                              initial={{ width: 0 }}
                              animate={{ width: `${(active.unnecessary / Math.max(1, active.total)) * 100}%` }}
                              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* budget status */}
                      {s.dailyBudget > 0 && active.total > 0 && (
                        <div>
                          {(() => {
                            const pct = Math.round((active.total / s.dailyBudget) * 100)
                            const over = pct > 100
                            return (
                              <span className={cn(
                                'inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5',
                                over ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                              )}>
                                {over ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                                {over ? t('ds.budgetOver', { pct: `${pct}%` }) : t('ds.budgetOk', { pct: `${pct}%` })}
                              </span>
                            )
                          })()}
                        </div>
                      )}

                      {/* categories */}
                      {active.topCats.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-primary" /> {t('ds.topCats')}
                          </div>
                          <div className="space-y-2">
                            {active.topCats.map((c, i) => (
                              <div key={c.name} className="flex items-center gap-3">
                                <span className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.color}1a`, color: c.color }}>
                                  <CatIcon name={c.icon} className="size-3.5" />
                                </span>
                                <span className="w-24 sm:w-36 text-xs font-medium truncate">{c.name}</span>
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                  <motion.div
                                    className="h-full rounded-full"
                                    style={{ background: c.color }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(c.amount / Math.max(...active.topCats.map((x) => x.amount))) * 100}%` }}
                                    transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                  />
                                </div>
                                <span className="font-num text-xs font-semibold w-20 text-end">{formatMAD(c.amount, lang)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {active.total === 0 && (
                        <p className="text-sm text-muted-foreground">{t('ds.noDay')}</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm text-muted-foreground">{t('ds.empty')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('ds.emptyHint')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* last 30 days */}
          <Card className="card-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t('ds.last30')}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('ds.rangeTotal')} {formatMAD(s.total, lang)} · {t('ds.activeDays', { n: s.activeDays })}
              </p>
            </CardHeader>
            <CardContent className="space-y-1">
              {last30.map((d) => {
                const maxAmt = Math.max(...last30.map((x) => x.total), 1)
                const isSel = (selected ?? todayIso) === d.iso
                return (
                  <button
                    key={d.iso}
                    onClick={() => {
                      setSelected(d.iso)
                      const idx = data.months.findIndex((m) => m.key === d.iso.slice(0, 7))
                      if (idx >= 0) setMonthIdx(idx)
                    }}
                    className={cn(
                      'w-full grid grid-cols-[5.5rem_1fr_auto] sm:grid-cols-[7rem_1fr_auto_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors',
                      isSel ? 'bg-primary/10' : 'hover:bg-accent',
                    )}
                  >
                    <span className="text-xs text-muted-foreground truncate capitalize">{dayLabel(d.iso, loc, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="min-w-0 flex-1 flex flex-col gap-1">
                      {/* segments colored by category — always matches the key dot */}
                      <span className="h-2.5 rounded-full bg-muted overflow-hidden flex" aria-hidden>
                        {d.count > 0 && (
                          <>
                            {d.topCats.slice(0, 4).map((c, i) => (
                              <span key={i} className="h-full" style={{ width: `${(c.amount / maxAmt) * 100}%`, background: c.color }} />
                            ))}
                            {(() => {
                              const topSum = d.topCats.slice(0, 4).reduce((a, c) => a + c.amount, 0)
                              const rest = d.total - topSum
                              return rest > 0 ? <span className="h-full bg-foreground/15" style={{ width: `${(rest / maxAmt) * 100}%` }} /> : null
                            })()}
                          </>
                        )}
                      </span>
                      {/* mobile: chip under the bar so bar & key always correspond */}
                      {d.topCats[0] && (
                        <span className="flex sm:hidden items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                          <span className="size-2 rounded-full shrink-0" style={{ background: d.topCats[0].color }} />
                          <span className="truncate">{d.topCats[0].name}</span>
                        </span>
                      )}
                    </span>
                    <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground w-24 justify-end">
                      {d.topCats[0] && (
                        <>
                          <span className="size-2 rounded-full shrink-0" style={{ background: d.topCats[0].color }} />
                          <span className="truncate">{d.topCats[0].name}</span>
                        </>
                      )}
                    </span>
                    <span className={cn('font-num text-sm font-semibold text-end w-20', d.total === 0 && 'text-muted-foreground')}>
                      {d.total > 0 ? formatMAD(d.total, lang) : '—'}
                    </span>
                  </button>
                )
              })}
            </CardContent>
          </Card>
            </>
          ) : (
            <StatsTable
              stats={data}
              selectedIso={selected ?? todayIso}
              onPickDay={(iso) => {
                setSelected(iso)
                setTab('calendar')
                const idx = data.months.findIndex((m) => m.key === iso.slice(0, 7))
                if (idx >= 0) setMonthIdx(idx)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
