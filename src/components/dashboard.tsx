'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Flame, CalendarDays, TrendingUp, Wallet, PiggyBank, ReceiptText, Trophy,
  ShieldCheck, ArrowRight, Sparkles,
} from 'lucide-react'
import { useApp } from './app-context'
import { useAppStore } from '@/lib/store'
import { useOverview, useNotifications } from './api'
import { formatMAD } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { DailyTrendArea, NecessaryDonut } from './charts'
import { SpendingWheel } from './spending-wheel'
import { IntelligenceCard } from './intelligence-card'
import { CatIcon } from './cat-icon'
import { CountUp } from './fx/count-up'
import { Reveal } from './fx/reveal'
import { QueryErrorState } from './feedback'
import { cn } from '@/lib/utils'
import type { Key } from '@/lib/i18n'

function KpiCard({ icon: Icon, label, children, accent, delay = 0 }: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
  accent?: 'default' | 'amber' | 'emerald' | 'rose'
  delay?: number
}) {
  const accents = {
    default: 'text-foreground bg-muted',
    amber: 'text-amber-500 bg-gradient-to-br from-amber-400/30 to-amber-500/5',
    emerald: 'text-emerald-500 bg-gradient-to-br from-emerald-400/30 to-emerald-500/5',
    rose: 'text-rose-500 bg-gradient-to-br from-rose-400/30 to-rose-500/5',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
    >
      <Card className="card-shadow card-hover border-border/60">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2.5">
            <div className={cn('size-7 rounded-xl flex items-center justify-center transition-transform duration-300', accents[accent ?? 'default'])}>
              <Icon className="size-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}

const MemoKpiCard = React.memo(KpiCard)

export function DashboardView() {
  const { t, lang } = useApp()
  const { data, isLoading, isError, refetch } = useOverview(lang)
  const { data: notifData } = useNotifications(lang)
  const setView = useAppStore((s) => s.setView)
  const o = data?.overview

  if (isError) {
    return <QueryErrorState title={t('err.title')} desc={t('err.desc')} retry={t('err.retry')} onRetry={() => refetch()} className="mt-6" />
  }

  if (isLoading || !o) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  const overPace = o.projectedSaving < 0
  const dailyPct = Math.min(100, Math.max(0, o.dailyBudgetPct))
  const insights = (notifData?.notifications ?? []).slice(0, 3)
  const levelStyles: Record<string, string> = {
    danger: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    success: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    info: 'text-primary bg-primary/10 border-primary/20',
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero — today (clean 2D product surface) */}
      <motion.section
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="hero-gradient shine rounded-3xl p-5 sm:p-7 text-white card-shadow relative overflow-hidden"
        >
          {/* decorative texture — subtle, static */}
          <div className="absolute inset-0 hero-dots [mask-image:radial-gradient(70%_90%_at_85%_15%,black,transparent)] pointer-events-none" aria-hidden />
          <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/75 text-sm font-medium">{t('dash.spentToday')}</p>
            <div className="mt-1 text-4xl sm:text-5xl font-display font-bold tracking-tight">
              <CountUp value={o.todayTotal} format={(n) => formatMAD(n, lang)} />
            </div>
            <p className="text-white/60 text-xs mt-1.5">
              {o.txToday} {t('dash.tx')} · {t('dash.last14')} ↓
            </p>
          </div>
          <div className="text-end space-y-1.5 hidden sm:block">
            <div className="rounded-2xl bg-white/10 backdrop-blur px-3.5 py-2">
              <div className="text-[11px] text-white/70">{t('dash.spentThisWeek')}</div>
              <div className="font-num font-bold">{formatMAD(o.weekTotal, lang)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur px-3.5 py-2">
              <div className="text-[11px] text-white/70">{t('dash.spentThisMonth')}</div>
              <div className="font-num font-bold">{formatMAD(o.monthTotal, lang)}</div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-white/75 mb-1.5">
            <span>{t('dash.dailyBudgetUsed')}</span>
            <span className="font-num">
              {formatMAD(o.todayVar, lang)} / {formatMAD(o.dailyBudget, lang)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', dailyPct >= 100 ? 'bg-rose-400' : dailyPct >= 70 ? 'bg-amber-300' : 'bg-emerald-300')}
              initial={{ width: 0 }}
              animate={{ width: `${dailyPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* week/month chips — visible on mobile too */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <div className="rounded-2xl bg-white/10 backdrop-blur px-3 py-2">
            <div className="text-[10px] text-white/70">{t('dash.spentThisWeek')}</div>
            <div className="font-num font-bold text-sm">{formatMAD(o.weekTotal, lang)}</div>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur px-3 py-2">
            <div className="text-[10px] text-white/70">{t('dash.spentThisMonth')}</div>
            <div className="font-num font-bold text-sm">{formatMAD(o.monthTotal, lang)}</div>
          </div>
        </div>
        </div>
        </motion.section>

      {/* Floussi IQ — flagship intelligence */}
      <IntelligenceCard />

      {/* Expense dynamics — radial category wheel (month) */}
      <SpendingWheel />

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MemoKpiCard icon={CalendarDays} label={t('dash.spentThisMonth')} delay={0.02}>
          <div className="font-num font-display font-bold text-xl tracking-tight">{formatMAD(o.monthTotal, lang)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {o.txMonth} {t('dash.tx')}
          </div>
        </MemoKpiCard>

        <MemoKpiCard icon={Flame} label={t('dash.wasted')} accent="amber" delay={0.06}>
          <div className="font-num font-display font-bold text-xl tracking-tight text-amber-500">{formatMAD(o.monthUnnecessary, lang)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{t('dash.wastedDesc', { period: t('common.thisMonth') })}</div>
        </MemoKpiCard>

        <MemoKpiCard icon={Wallet} label={t('dash.remainingBudget')} accent={o.remainingBudget < 0 ? 'rose' : 'emerald'} delay={0.1}>
          <div className={cn('font-num font-display font-bold text-xl tracking-tight', o.remainingBudget < 0 && 'text-rose-500')}>
            {formatMAD(o.remainingBudget, lang)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{t('dash.remainingDesc', { budget: formatMAD(o.monthlyBudget, lang) })}</div>
        </MemoKpiCard>

        <MemoKpiCard icon={TrendingUp} label={t('dash.dailyAvg')} delay={0.14}>
          <div className="font-num font-display font-bold text-xl tracking-tight">{formatMAD(o.dailyAvgVar, lang)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{t('dash.dailyAvgDesc')}</div>
        </MemoKpiCard>

        <MemoKpiCard icon={PiggyBank} label={t('dash.savingProgress')} accent={overPace ? 'rose' : 'emerald'} delay={0.18}>
          <div className="font-num font-display font-bold text-xl tracking-tight">{o.savingProgressPct}%</div>
          <Progress value={o.savingProgressPct} className="h-1.5 mt-2" />
          <div className={cn('text-[11px] mt-1.5', overPace ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
            {overPace ? t('dash.overPace', { amount: formatMAD(Math.abs(o.projectedSaving), lang) }) : t('dash.onTrackToSave', { amount: formatMAD(o.projectedSaving, lang) })}
          </div>
        </MemoKpiCard>

        <MemoKpiCard icon={ReceiptText} label={t('dash.transactionsCount')} delay={0.22}>
          <div className="font-num font-display font-bold text-xl tracking-tight">{o.txTotal}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{o.txToday} {t('common.today').toLowerCase()}</div>
        </MemoKpiCard>

        <MemoKpiCard icon={Trophy} label={t('dash.biggestCategory')} delay={0.26}>
          {o.topCategory ? (
            <>
              <div className="font-semibold text-[15px] tracking-tight truncate">{o.topCategory.name}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {formatMAD(o.topCategory.amount, lang)} · {t('dash.topCatOf', { pct: o.topCategory.pct })}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </MemoKpiCard>

        {/* Necessary vs unnecessary mini */}
        <MemoKpiCard icon={ShieldCheck} label={t('dash.necessary')} accent="emerald" delay={0.3}>
          <div className="font-num font-display font-bold text-xl tracking-tight text-emerald-500">{formatMAD(o.monthNecessary, lang)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {o.monthTotal > 0 ? Math.round((o.monthNecessary / o.monthTotal) * 100) : 0}%
          </div>
        </MemoKpiCard>
      </div>

      {/* Necessary vs Unnecessary breakdown + projection */}
      <Reveal>
      <div className="grid lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="card-shadow lg:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-500" />
              {t('dash.breakdownTitle')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('dash.breakdownDesc')}</p>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <NecessaryDonut necessary={o.monthNecessary} unnecessary={o.monthUnnecessary} lang={lang} size={170} />
            <div className="space-y-3 min-w-0">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  {t('dash.necessary')}
                </div>
                <div className="font-num font-bold ms-4.5">{formatMAD(o.monthNecessary, lang)}</div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  {t('dash.avoidable')}
                </div>
                <div className="font-num font-bold ms-4.5 text-amber-500">{formatMAD(o.monthUnnecessary, lang)}</div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('analytics')}>
                {t('nav.analytics')} <ArrowRight className="size-3.5 rtl:-scale-x-100" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow lg:col-span-3">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">{t('dash.last14')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> {t('dash.necessary')}
                <span className="size-2 rounded-full bg-amber-500 ms-2" /> {t('dash.avoidable')}
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <DailyTrendArea data={o.last14} lang={lang} height={216} />
          </CardContent>
        </Card>
      </div>
      </Reveal>

      {/* Insights + recent */}
      <Reveal delay={0.05}>
      <div className="grid lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="card-shadow lg:col-span-3">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> {t('dash.insights')}
            </CardTitle>
            <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setView('notifications')}>
              {t('common.viewAll')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {insights.length === 0 && <p className="text-sm text-muted-foreground">{t('no.emptyDesc')}</p>}
            {insights.map((n) => (
              <div key={n.id} className={cn('flex items-start gap-3 rounded-2xl border px-3.5 py-3', levelStyles[n.level])}>
                <span className="text-sm leading-5">{n.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-shadow lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">{t('dash.recent')}</CardTitle>
            <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setView('transactions')}>
              {t('common.viewAll')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {o.recent.map((tx) => (
              <button
                key={tx.id}
                onClick={() => useAppStore.getState().setView('transactions')}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent transition-colors text-start"
              >
                <span
                  className="size-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${tx.category.color}1a`, color: tx.category.color }}
                >
                  <CatIcon name={tx.icon ?? tx.category.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{tx.note || tx.category.name}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{tx.category.name}</span>
                </span>
                <span className="font-num font-semibold text-sm">{formatMAD(tx.amount, lang)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      </Reveal>
    </div>
  )
}
