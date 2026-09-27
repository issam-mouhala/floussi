'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, CalendarX2, Crown, Repeat, ShoppingBag, AlertTriangle, PiggyBank, Minus,
} from 'lucide-react'
import { useApp } from './app-context'
import { useAnalytics } from './api'
import { formatMAD, formatPct } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { CategoryBars, SimpleBars } from './charts'
import { CatIcon } from './cat-icon'
import { cn } from '@/lib/utils'

function Delta({ pct, suffix }: { pct: number | null; suffix?: string }) {
  const { t } = useApp()
  if (pct === null) return <span className="text-[11px] text-muted-foreground">{t('an.noPrev')}</span>
  const up = pct > 0
  const flat = pct === 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5',
        flat ? 'text-muted-foreground bg-muted' : up ? 'text-rose-600 bg-rose-500/10 dark:text-rose-400' : 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400'
      )}
    >
      {flat ? <Minus className="size-3" /> : up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {formatPct(pct)} {suffix}
    </span>
  )
}

export function AnalyticsView() {
  const { t, lang } = useApp()
  const [days, setDays] = React.useState<30 | 90>(30)
  const [cut, setCut] = React.useState(30)
  const { data: a, isLoading } = useAnalytics(lang, days)

  if (isLoading || !a) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    )
  }

  const monthNames = a.byMonth.map((m) => m.label)
  const lastMonthLabel = monthNames[monthNames.length - 2] ?? ''
  const thisMonthLabel = monthNames[monthNames.length - 1] ?? ''

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('an.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('an.subtitle')}</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <TrendingUp className="size-3.5" /> {t('an.avgDaily')}
            </div>
            <div className="font-num font-bold text-xl">{formatMAD(a.avgDailyThis, lang)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{t('an.avgDailyPrev', { amount: formatMAD(a.avgDailyPrev, lang) })}</div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <CalendarX2 className="size-3.5" /> {t('an.highestDay')}
            </div>
            <div className="font-num font-bold text-xl">{a.highestDay ? formatMAD(a.highestDay.amount, lang) : '—'}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{a.highestDay?.label ?? '—'}</div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Crown className="size-3.5" /> {t('an.mostExpCat')}
            </div>
            <div className="font-semibold text-[15px] truncate">{a.byCategory[0]?.name ?? '—'}</div>
            <div className="font-num text-[11px] text-muted-foreground mt-1">
              {formatMAD(a.byCategory[0]?.amount ?? 0, lang)} · {a.byCategory[0]?.pct ?? 0}%
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <TrendingUp className="size-3.5" /> {t('an.weekendDiff')}
            </div>
            <div className={cn('font-num font-bold text-xl', (a.weekendPct ?? 0) > 0 && 'text-amber-500')}>
              {a.weekendPct === null ? '—' : formatPct(a.weekendPct)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {a.weekendPct === null
                ? '—'
                : (a.weekendPct >= 0 ? t('an.weekendMore', { pct: formatPct(a.weekendPct) }) : t('an.weekendLess', { pct: formatPct(-a.weekendPct) }))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Potential savings */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="card-shadow border-primary/25 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-amber-500/8 pointer-events-none" />
          <CardContent className="p-5 sm:p-6 relative">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="max-w-md">
                <div className="flex items-center gap-2 font-semibold">
                  <PiggyBank className="size-4.5 text-primary" />
                  {t('an.savings')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('an.savingsDesc', { amount: formatMAD(a.potential.wastedMonth, lang) })}
                </p>
              </div>
              <div className="text-end">
                <div className="text-3xl sm:text-4xl font-extrabold font-num text-primary">
                  {formatMAD(Math.round((a.potential.wastedMonth * cut) / 100), lang)}
                </div>
                <div className="text-[11px] text-muted-foreground font-num">
                  {t('an.saveResult', {
                    month: formatMAD(Math.round((a.potential.wastedMonth * cut) / 100), lang),
                    year: formatMAD(Math.round((a.potential.wastedMonth * cut * 12) / 100), lang),
                  })}
                </div>
              </div>
            </div>
            <div className="mt-5 max-w-md">
              <div className="flex items-center justify-between text-xs font-medium mb-2">
                <span>{t('an.cutLabel')}</span>
                <span className="font-num font-bold text-primary">{cut}%</span>
              </div>
              <Slider value={[cut]} min={5} max={70} step={5} onValueChange={([v]) => setCut(v)} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 font-num">
                {[5, 10, 20, 30, 50, 70].map((p) => (
                  <span key={p} className={cn(p === cut && 'text-primary font-bold')}>{p}%</span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Trends */}
      <Card className="card-shadow">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">{t('an.trend')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('an.changeVs', { period: days === 30 ? t('common.thisMonth') : '90d' })} ·{' '}
              <Delta pct={a.monthChangePct} /> {t('an.monthVsMonth', { month: thisMonthLabel, prev: lastMonthLabel })}
            </p>
          </div>
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 30 | 90)}>
            <TabsList className="rounded-full">
              <TabsTrigger value="30" className="rounded-full text-xs">{t('an.last30')}</TabsTrigger>
              <TabsTrigger value="90" className="rounded-full text-xs">{t('an.last90')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <SimpleBars data={a.byDay} lang={lang} height={230} color="#0d9488" />
        </CardContent>
      </Card>

      {/* by week / by month */}
      <div className="grid lg:grid-cols-2 gap-3 sm:gap-4">
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('an.byWeek')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('common.thisWeek')} {formatMAD(a.weekThis, lang)} · {t('common.lastWeek')} {formatMAD(a.weekPrev, lang)}
            </p>
          </CardHeader>
          <CardContent>
            <SimpleBars data={a.byWeek} lang={lang} height={200} color="#f59e0b" highlightLast />
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('an.monthlyCompare')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> {t('dash.necessary')}
                <span className="size-2 rounded-full bg-amber-500 ms-2" /> {t('dash.avoidable')}
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <SimpleBars data={a.byMonth} lang={lang} height={200} stacked />
          </CardContent>
        </Card>
      </div>

      {/* by category */}
      <Card className="card-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('an.byCategory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBars data={a.byCategory.map((c) => ({ name: c.name, amount: c.amount, color: c.color }))} lang={lang} height={Math.max(220, a.byCategory.length * 34)} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.byCategory.slice(0, 6).map((c) => (
              <Badge key={c.name} variant="outline" className="rounded-full gap-1.5 ps-2">
                <span className="size-2 rounded-full" style={{ background: c.color }} />
                {c.name}
                {c.changePct !== null && (
                  <span className={cn('font-num text-[10px]', c.changePct > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                    {formatPct(c.changePct)}
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* recurring / small / unusual */}
      <div className="grid lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Repeat className="size-4 text-primary" /> {t('an.recurring')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('an.recurringDesc')}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.recurring.slice(0, 6).map((r) => (
              <div key={r.note} className="flex items-center gap-3">
                <span className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${r.categoryColor}1a`, color: r.categoryColor }}>
                  <CatIcon name={r.icon} className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.note}</div>
                  <div className="text-[11px] text-muted-foreground">{r.categoryName}</div>
                </div>
                <span className="font-num text-sm font-semibold">{formatMAD(r.monthlyAvg, lang)}</span>
              </div>
            ))}
            {a.recurring.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          </CardContent>
        </Card>

        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingBag className="size-4 text-amber-500" /> {t('an.small')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('an.smallDesc', { count: a.small.count, amount: formatMAD(a.small.total, lang) })}</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="font-num font-bold text-3xl">{a.small.count}</span>
              <span className="text-xs text-muted-foreground mb-1">× ~{formatMAD(a.small.avg, lang)}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (a.small.count / 40) * 100)}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">{t('n.small', { count: a.small.count, amount: formatMAD(a.small.total, lang) })}</p>
          </CardContent>
        </Card>

        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-rose-500" /> {t('an.unusual')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('an.unusualDesc')}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.unusual.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <span className="size-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{u.note || u.categoryName}</div>
                  <div className="text-[11px] text-muted-foreground">{u.categoryName} · ×{u.ratio}</div>
                </div>
                <span className="font-num text-sm font-semibold">{formatMAD(u.amount, lang)}</span>
              </div>
            ))}
            {a.unusual.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          </CardContent>
        </Card>
      </div>

      {/* avoidable by category */}
      <Card className="card-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('an.avoidableByCat')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.potential.byCategory.map((c) => {
            const max = a.potential.byCategory[0]?.amount || 1
            return (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-28 sm:w-36 text-xs font-medium truncate">{c.name}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: c.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.amount / max) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="font-num text-xs font-semibold w-20 text-end">{formatMAD(c.amount, lang)}</span>
              </div>
            )
          })}
          {a.potential.byCategory.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
