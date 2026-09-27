'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, Repeat, TrendingUp, TrendingDown, Tag, CalendarRange,
  ShieldCheck, BrainCircuit, GaugeCircle, Wallet, Minus,
} from 'lucide-react'
import { useApp } from './app-context'
import { useIntel } from './api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CatIcon } from './cat-icon'
import { formatMAD } from '@/lib/money'
import { intlLocale, type Key } from '@/lib/i18n'
import type { IntelDTO } from './api'
import { cn } from '@/lib/utils'

/**
 * Intelligence Hub — the pro analytics layer.
 * Bento grid: health ring hero, month momentum, recurring commitments with
 * detected cadence, category trends, top labels and the 7-day activity shape.
 * Every number is server-computed from real transactions (FACTS only).
 */

const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
})

function ScoreRing({ score }: { score: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, score)) / 100
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="9" className="stroke-muted" />
        <motion.circle
          cx="60" cy="60" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
          stroke="url(#intelRing)" strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="intelRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-num text-3xl font-extrabold tracking-tight">{score}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}

function DeltaChip({ deltaPct }: { deltaPct: number | null }) {
  const { t } = useApp()
  if (deltaPct === null) {
    return <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[10.5px] font-bold text-sky-600 dark:text-sky-400">{t('intel.new')}</span>
  }
  const up = deltaPct > 0
  const flat = deltaPct === 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold',
        flat
          ? 'bg-muted text-muted-foreground'
          : up
            ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
            : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      )}
    >
      <Icon className="size-3" />
      {Math.abs(deltaPct)}%
    </span>
  )
}

export function IntelView() {
  const { t, lang } = useApp()
  const { data, isLoading } = useIntel(lang)
  const locale = intlLocale(lang)

  const dayLabel = React.useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(`${iso}T12:00:00`)),
    [locale],
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-52 rounded-xl bg-muted animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl lg:col-span-2" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    )
  }

  const d = data as IntelDTO | undefined
  if (!d || d.health.empty) {
    return (
      <div className="space-y-4">
        <SectionHeader title={t('intel.title')} subtitle={t('intel.subtitle')} />
        <Card className="card-shadow">
          <CardContent className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="size-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
              <BrainCircuit className="size-7" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">{t('intel.empty')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const h = d.health
  const maxWeek = Math.max(...d.week.map((w) => w.total), 1)
  const monthUsagePct = h.monthBudget > 0 ? Math.min(100, Math.round((d.monthTotal / h.monthBudget) * 100)) : 0

  return (
    <div className="space-y-4 sm:space-y-5">
      <SectionHeader title={t('intel.title')} subtitle={t('intel.subtitle')} badge={t('intel.txCount', { n: d.txCount })} />

      {/* ---- hero bento: health ring + month momentum ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div {...rise(0)}>
          <Card className="card-shadow card-hover h-full overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-1 intel-gradient" />
            <CardContent className="p-5 flex items-center gap-4">
              <ScoreRing score={h.score} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <GaugeCircle className="size-3.5" /> {t('intel.healthScore')}
                </div>
                <div className="mt-1 text-lg font-extrabold tracking-tight intel-text-gradient">{t(h.gradeKey as Key)}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip>{t('iq.streak', { n: h.streak })}</Chip>
                  <Chip>{t('iq.necessary', { pct: h.necessaryShare })}</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...rise(1)} className="lg:col-span-2">
          <Card className="card-shadow card-hover h-full">
            <CardContent className="p-5 h-full flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Wallet className="size-3.5" /> {t('intel.monthSpend')}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2.5 flex-wrap">
                    <span className="font-num text-4xl font-extrabold tracking-tight">{formatMAD(d.monthTotal, lang)}</span>
                    <DeltaChip deltaPct={d.deltaPct} />
                    {d.deltaPct !== null && (
                      <span className="text-xs text-muted-foreground">{t('intel.vsLastMonth', { a: formatMAD(d.prevMonthTotal, lang) })}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <MiniStat label={t('iq.safeToday')} value={formatMAD(h.safeToday, lang)} tone="good" />
                  <MiniStat label={t('intel.projection')} value={formatMAD(h.projected, lang)} tone={h.projectedSaving >= 0 ? 'good' : 'bad'} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
                  <span>{t('intel.budgetUse', { pct: monthUsagePct })}</span>
                  <span className="font-num">{formatMAD(h.monthBudget, lang)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', monthUsagePct > 90 ? 'bg-rose-500' : monthUsagePct > 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                    initial={{ width: 0 }}
                    animate={{ width: `${monthUsagePct}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ---- recurring commitments + category intelligence ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div {...rise(2)}>
          <Card className="card-shadow card-hover h-full">
            <CardContent className="p-5">
              <CardTitle icon={Repeat} title={t('intel.recurring')} extra={d.recurring.length > 0 ? t('intel.recurringEstimate', { a: formatMAD(d.recurringMonthlyEstimate, lang) }) : undefined} />
              {d.recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('intel.noRecurring')}</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {d.recurring.slice(0, 5).map((g) => (
                    <li key={g.label} className="flex items-center gap-3 rounded-2xl border bg-card/60 p-3">
                      <span className="size-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${g.color}1a`, color: g.color }}>
                        <CatIcon name={g.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{g.label}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          {g.cadenceDays ? (
                            <span className="rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-400 px-2 py-0.5 font-bold inline-flex items-center gap-1">
                              <CalendarRange className="size-3" />
                              {t('intel.cadence', { d: g.cadenceDays })}
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-bold">
                              {t('intel.repeating')}
                            </span>
                          )}
                          <span>{t('intel.occurrences', { n: g.count })}</span>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="font-num text-sm font-extrabold">{formatMAD(g.total, lang)}</div>
                        <div className="text-[10.5px] text-muted-foreground">{t('intel.avgEach', { a: formatMAD(g.avg, lang) })}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...rise(3)}>
          <Card className="card-shadow card-hover h-full">
            <CardContent className="p-5">
              <CardTitle icon={TrendingUp} title={t('intel.cats')} />
              {d.cats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('common.noData')}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {d.cats.map((c) => (
                    <li key={c.name}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="size-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.color}1a`, color: c.color }}>
                          <CatIcon name={c.icon} className="size-3.5" />
                        </span>
                        <span className="font-semibold truncate flex-1 min-w-0">{c.name}</span>
                        <DeltaChip deltaPct={c.deltaPct} />
                        <span className="font-num font-bold shrink-0">{formatMAD(c.total, lang)}</span>
                      </div>
                      <div className="mt-1.5 ms-9 h-1.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: c.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(3, c.sharePct)}%` }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <div className="mt-0.5 ms-9 text-[10px] text-muted-foreground">{t('intel.share', { p: c.sharePct })}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ---- top labels + 7-day shape ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div {...rise(4)}>
          <Card className="card-shadow card-hover h-full">
            <CardContent className="p-5">
              <CardTitle icon={Tag} title={t('intel.merchants')} />
              {d.merchants.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('common.noData')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-border/60">
                  {d.merchants.map((m, i) => (
                    <li key={`${m.label}-${i}`} className="flex items-center gap-3 py-2.5">
                      <span className="font-num text-[11px] font-bold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{m.label}</div>
                        <div className="text-[11px] text-muted-foreground">{m.categoryName} · {t('intel.occurrences', { n: m.count })}</div>
                      </div>
                      <span className="font-num text-sm font-bold shrink-0">{formatMAD(m.total, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...rise(5)}>
          <Card className="card-shadow card-hover h-full">
            <CardContent className="p-5 flex flex-col h-full">
              <CardTitle icon={ShieldCheck} title={t('intel.week')} extra={t('intel.weekendShare', { pct: h.weekendShare })} />
              <div className="mt-4 flex-1 flex items-end justify-between gap-2 min-h-28">
                {d.week.map((w, i) => (
                  <div key={w.date} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="font-num text-[10px] font-bold text-muted-foreground">{w.total > 0 ? Math.round(w.total) : ''}</span>
                    <motion.div
                      className={cn('w-full max-w-8 rounded-t-lg', w.weekend ? 'bg-gradient-to-t from-amber-500/70 to-amber-400' : 'bg-gradient-to-t from-emerald-500/70 to-emerald-400')}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(4, (w.total / maxWeek) * 100)}%` }}
                      transition={{ delay: 0.08 * i, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      style={{ minHeight: 4 }}
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">{dayLabel(w.date)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span className="size-8 rounded-xl intel-gradient flex items-center justify-center text-white glow-intel">
            <Sparkles className="size-4" />
          </span>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {badge && <span className="rounded-full border bg-card/70 px-3 py-1 text-[11px] font-semibold text-muted-foreground">{badge}</span>}
    </div>
  )
}

function CardTitle({ icon: Icon, title, extra }: { icon: React.ElementType; title: string; extra?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="size-7 rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400 flex items-center justify-center">
          <Icon className="size-3.5" />
        </span>
        {title}
      </div>
      {extra && <span className="text-[11px] font-semibold text-muted-foreground">{extra}</span>}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{children}</span>
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className={cn('rounded-2xl border px-3.5 py-2.5 min-w-28', tone === 'good' ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-rose-500/25 bg-rose-500/[0.06]')}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-num text-base font-extrabold mt-0.5">{value}</div>
    </div>
  )
}
