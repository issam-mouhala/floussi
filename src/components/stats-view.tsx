'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarRange, Flame, Hash, Plus, Receipt, TrendingUp } from 'lucide-react'
import { useApp } from './app-context'
import { useYearStats, type MonthStatDTO } from './api'
import { Card, CardContent } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { QueryErrorState } from './feedback'
import { CatIcon } from './cat-icon'
import { formatMAD } from '@/lib/money'
import { useAppStore } from '@/lib/store'

/**
 * Yearly statistics (Task 21) — "every month, every transaction": the full
 * year broken into 12 month tiles, a stacked essential/avoidable chart, the
 * year roll-up and the all-transaction records. Read-only, zero-fabrication:
 * every number comes straight from /api/stats over the user's real data.
 */

const EMERALD = '#10b981'
const AMBER = '#f59e0b'

function Kpi({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <Card className="card-shadow">
      <CardContent className="p-4 sm:p-5 flex items-start gap-3.5">
        <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-num font-display font-bold text-xl sm:text-2xl leading-tight mt-0.5 truncate">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function MonthTile({ m, max, index }: { m: MonthStatDTO; max: number; index: number }) {
  const { t, lang } = useApp()
  const active = m.count > 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card className={`card-shadow h-full ${active ? '' : 'opacity-60'}`}>
        <CardContent className="p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-sm">{m.label}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-num text-[10px] font-semibold text-muted-foreground">
              {t('stats.txIn', { n: m.count })}
            </span>
          </div>
          <p className={`font-num font-display font-bold text-lg leading-none ${active ? '' : 'text-muted-foreground'}`}>
            {formatMAD(m.total, lang)}
          </p>
          {/* share of the busiest month — quick visual rhythm across the year */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full hero-gradient transition-[width] duration-500"
              style={{ width: max > 0 ? `${Math.max(active ? 6 : 0, Math.round((m.total / max) * 100))}%` : '0%' }}
            />
          </div>
          {m.topCategory ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
              <CatIcon name={m.topCategory.icon} className="size-3.5" />
              <span className="truncate">{m.topCategory.name}</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/50">—</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function StatsView() {
  const { t, lang } = useApp()
  const openAdd = useAppStore((s) => s.openAdd)
  const [year, setYear] = React.useState<number | undefined>(undefined)
  const { data, isPending, isError, refetch } = useYearStats(lang, year)

  if (isPending) {
    return (
      <div className="space-y-4 pt-2">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="pt-6">
        <QueryErrorState title={t('err.title')} desc={t('err.descTx')} retry={t('err.retry')} onRetry={() => void refetch()} />
      </div>
    )
  }

  const yearsDesc = data.years
  const max = Math.max(...data.months.map((m) => m.total), 1)
  const essPct = data.totals.total > 0 ? Math.round((data.totals.necessary / data.totals.total) * 100) : 0

  if (data.allTime.txCount === 0) {
    return (
      <div className="pt-4">
        <Card className="card-shadow">
          <CardContent className="p-10 text-center flex flex-col items-center gap-4">
            <span className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <CalendarRange className="size-7" />
            </span>
            <div>
              <h2 className="font-display font-bold text-lg">{t('stats.noData')}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">{t('stats.noDataDesc')}</p>
            </div>
            <Button onClick={openAdd} className="rounded-xl font-semibold hero-gradient text-white border-0 glow-primary">
              <Plus className="size-4" /> {t('nav.addExpense')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const chartData = data.months.map((m) => ({
    name: m.label,
    necessary: m.necessary,
    unnecessary: m.unnecessary,
  }))

  return (
    <div className="space-y-5 pt-2 pb-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{t('stats.title')}</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('stats.subtitle')}</p>
        </div>
        {yearsDesc.length > 1 && (
          <Select value={String(data.year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[130px] rounded-xl h-9.5 font-num font-semibold" aria-label={t('stats.year')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {yearsDesc.map((y) => (
                <SelectItem key={y} value={String(y)} className="font-num">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* year KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} label={t('stats.total')} value={formatMAD(data.totals.total, lang)} />
        <Kpi icon={Hash} label={t('stats.count')} value={String(data.totals.count)} />
        <Kpi icon={CalendarRange} label={t('stats.avgMonth')} value={formatMAD(data.totals.avgMonth, lang)} sub={`${data.totals.activeMonths}/12`} />
        <Kpi icon={Receipt} label={t('stats.essShare')} value={`${essPct}%`} sub={formatMAD(data.totals.necessary, lang)} />
      </div>

      {/* stacked monthly chart */}
      <Card className="card-shadow">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-display font-semibold text-[15px]">{t('stats.byMonth')}</h3>
            <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: EMERALD }} /> {t('stats.necessary')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: AMBER }} /> {t('stats.unnecessary')}
              </span>
            </div>
          </div>
          <div dir="ltr" className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }}
                />
                <YAxis width={38} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                  contentStyle={{
                    borderRadius: 14,
                    border: '1px solid rgba(120,120,120,0.2)',
                    fontSize: 12,
                    boxShadow: '0 10px 30px -12px rgba(0,0,0,0.25)',
                  }}
                  formatter={(value: number | string, name: string) => [
                    formatMAD(Number(value), lang),
                    name === 'necessary' ? t('stats.necessary') : t('stats.unnecessary'),
                  ]}
                />
                <Bar dataKey="necessary" stackId="a" fill={EMERALD} radius={[0, 0, 3, 3]} />
                <Bar dataKey="unnecessary" stackId="a" fill={AMBER} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* all months grid */}
      <div>
        <h3 className="font-display font-semibold text-[15px] mb-3">{t('stats.months')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.months.map((m, i) => (
            <MonthTile key={m.key} m={m} max={max} index={i} />
          ))}
        </div>
      </div>

      {/* all-time records */}
      <Card className="card-shadow">
        <CardContent className="p-4 sm:p-5">
          <h3 className="font-display font-semibold text-[15px]">{t('stats.allTime')}</h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Hash className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('stats.count')}</p>
                <p className="font-num font-display font-bold text-lg leading-tight">{data.allTime.txCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Receipt className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('stats.avgTx')}</p>
                <p className="font-num font-display font-bold text-lg leading-tight">{formatMAD(data.allTime.avgTx, lang)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Flame className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('stats.biggest')}</p>
                <p className="font-num font-display font-bold text-lg leading-tight truncate">
                  {data.allTime.biggest ? formatMAD(data.allTime.biggest.amount, lang) : '—'}
                  {data.allTime.biggest?.note && (
                    <span className="ms-1.5 text-[11px] font-medium text-muted-foreground font-sans">{data.allTime.biggest.note}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
