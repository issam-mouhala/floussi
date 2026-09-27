'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Flame, TrendingUp, CalendarDays, ShieldCheck, Lightbulb, AlertTriangle, CheckCircle2, Info, Brain } from 'lucide-react'
import { useApp } from './app-context'
import { useIntelligence } from './api'
import { formatMAD } from '@/lib/money'
import { Skeleton } from '@/components/ui/skeleton'
import { CatIcon } from './cat-icon'
import { TiltCard } from './fx/tilt-card'
import { cn } from '@/lib/utils'
import type { Key } from '@/lib/i18n'

/**
 * Floussi IQ — the flagship intelligence card.
 * Aurora gradient, animated score ring, live signals and smart tips.
 */

const toneIcon = { good: CheckCircle2, warn: AlertTriangle, bad: TrendingUp, info: Info } as const
const toneStyle = {
  good: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/25',
  warn: 'text-amber-200 bg-amber-300/10 border-amber-300/25',
  bad: 'text-rose-200 bg-rose-400/10 border-rose-300/25',
  info: 'text-sky-200 bg-sky-400/10 border-sky-300/25',
} as const

function useCountUp(value: number, dur = 900) {
  const [display, setDisplay] = React.useState(0)
  React.useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, dur])
  return display
}

function ScoreRing({ score }: { score: number }) {
  const shown = useCountUp(score)
  const R = 54
  const C = 2 * Math.PI * R
  const dash = (shown / 100) * C
  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="size-full -rotate-90">
        <defs>
          <linearGradient id="iqGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
        </defs>
        <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <motion.circle
          cx="66" cy="66" r={R} fill="none"
          stroke="url(#iqGrad)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - dash }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-white font-num leading-none">{shown}</span>
        <span className="text-[10px] text-white/55 mt-1 font-num">/ 100</span>
      </div>
    </div>
  )
}

function Chip({ icon: Icon, children, className }: { icon: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm', className)}>
      <Icon className="size-3.5 shrink-0" />
      <span className="font-num" dir="auto">{children}</span>
    </span>
  )
}

export function IntelligenceCard() {
  const { t, lang } = useApp()
  const { data, isLoading } = useIntelligence(lang)

  if (isLoading) return <Skeleton className="h-[230px] rounded-3xl" />
  if (!data) return null

  if (data.empty) {
    return (
      <section className="relative overflow-hidden rounded-3xl p-5 text-white card-shadow bg-[linear-gradient(135deg,#1e1b4b,#312e81_45%,#4c1d95)]">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-xl bg-white/10 flex items-center justify-center"><Brain className="size-4.5" /></span>
          <div>
            <p className="text-sm font-bold">Floussi IQ</p>
            <p className="text-[11px] text-white/60">{t('iq.subtitle')}</p>
          </div>
        </div>
        <p className="text-sm font-semibold mt-4">{t('iq.empty')}</p>
        <p className="text-xs text-white/60 mt-1">{t('iq.emptyHint')}</p>
      </section>
    )
  }

  const paceOver = data.usedPct > data.elapsedPct + 3
  const pacePct = Math.min(100, data.usedPct)

  return (
    <TiltCard max={3.5} className="!rounded-3xl">
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white card-shadow shine bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_30%,#4c1d95_65%,#701a75_100%)]"
    >
      {/* aurora decoration */}
      <div className="absolute -top-20 -end-16 size-56 rounded-full bg-fuchsia-400/20 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-24 -start-14 size-52 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(75%_100%_at_80%_0%,black,transparent)] pointer-events-none" aria-hidden />

      <div className="relative">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Brain className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Floussi IQ</p>
              <p className="text-[11px] text-white/55 leading-tight">{t('iq.subtitle')}</p>
            </div>
          </div>
          <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold backdrop-blur-sm">
            {t(data.gradeKey as Key)}
          </span>
        </div>

        {/* main row */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
          <ScoreRing score={data.score} />

          <div className="flex-1 w-full min-w-0 space-y-3">
            {/* safe to spend */}
            <div>
              <p className="text-[11px] text-white/60">{t('iq.safeToday')}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold font-num leading-none text-emerald-300">
                  {formatMAD(data.safeToday, lang)}
                </span>
                <span className="text-[11px] text-white/50 font-num">/ {formatMAD(data.dailyBudget, lang)}</span>
              </div>
            </div>

            {/* burn + projection */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/8 border border-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[10px] text-white/55">{t('iq.burn')}</p>
                <p className="font-num font-bold text-sm">{formatMAD(data.burn, lang)}<span className="text-white/50 font-normal">/{t('iq.day')}</span></p>
              </div>
              <div className="rounded-2xl bg-white/8 border border-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[10px] text-white/55">{t('iq.projected')}</p>
                <p className={cn('font-num font-bold text-sm', data.projected > data.monthBudget && data.monthBudget > 0 && 'text-rose-300')}>
                  {formatMAD(data.projected, lang)}
                </p>
              </div>
            </div>

            {/* pace bar: used vs elapsed marker */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-white/55 mb-1">
                <span>{t('iq.paceUsed', { used: data.usedPct })}</span>
                <span className="font-num">{t('iq.paceElapsed', { elapsed: data.elapsedPct })}</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/15 overflow-visible">
                <motion.div
                  className={cn('h-full rounded-full', paceOver ? 'bg-amber-300' : 'bg-emerald-300')}
                  initial={{ width: 0 }}
                  animate={{ width: `${pacePct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
                <span
                  className="absolute -top-0.5 size-3 rounded-full bg-white shadow ring-2 ring-indigo-400/60"
                  style={{ insetInlineStart: `calc(${data.elapsedPct}% - 6px)` }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>

        {/* signal chips */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.streak >= 2 && (
            <Chip icon={Flame} className="border-amber-300/25 bg-amber-300/10 text-amber-200">
              {t('iq.streak', { n: data.streak })}
            </Chip>
          )}
          {data.anomalies.map((a) => (
            <Chip key={a.name} icon={TrendingUp} className="border-rose-300/25 bg-rose-400/10 text-rose-200">
              {t('iq.anomaly', { cat: a.name, pct: a.pct })}
            </Chip>
          ))}
          {data.weekendShare > 0 && (
            <Chip icon={CalendarDays} className="border-sky-300/25 bg-sky-400/10 text-sky-200">
              {t('iq.weekend', { pct: data.weekendShare })}
            </Chip>
          )}
          {data.necessaryShare > 0 && (
            <Chip icon={ShieldCheck} className="border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
              {t('iq.necessary', { pct: data.necessaryShare })}
            </Chip>
          )}
        </div>

        {/* tips */}
        {data.tips.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {data.tips.map((tip) => {
              const Icon = tip.tone === 'bad' ? AlertTriangle : tip.tone === 'info' ? Info : tip.tone === 'warn' ? AlertTriangle : Lightbulb
              return (
                <div key={tip.key} className={cn('flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed', toneStyle[tip.tone])}>
                  <Icon className="size-3.5 mt-0.5 shrink-0" />
                  <span dir="auto">{t(tip.key as Key, tip.params)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.section>
    </TiltCard>
  )
}
