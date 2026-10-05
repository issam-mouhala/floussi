'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Wallet, Brain, ArrowRight } from 'lucide-react'
import { useApp } from '../app-context'
import { useOverview, useIntelligence } from '../api'
import { formatMAD } from '@/lib/money'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { SeriesPoint } from '@/lib/types'
import type { LandingCopy } from './copy'

/**
 * Product preview — a faithful CSS recreation of the Floussi dashboard,
 * populated with the visitor's REAL account data (no fake metrics).
 */
export function ProductPreview({ c }: { c: LandingCopy }) {
  const { lang, dir } = useApp()
  const { data, isLoading } = useOverview(lang)
  const { data: iq } = useIntelligence(lang)
  const o = data?.overview

  const last14: SeriesPoint[] = o?.last14 ?? []
  const max = Math.max(1, ...last14.map((d) => d.amount))

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      className="relative mx-auto w-full max-w-3xl"
    >
      {/* glow bed — single, subtle */}
      <div className="absolute -inset-x-8 -top-8 bottom-10 rounded-[2.5rem] bg-gradient-to-b from-primary/10 via-primary/[0.04] to-transparent blur-2xl pointer-events-none" aria-hidden />

      <figure className="relative rounded-3xl border bg-card card-shadow overflow-hidden">
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-background/80 border border-border/60 px-3 py-0.5 text-[10px] text-muted-foreground font-num">
            <Wallet className="size-3 text-primary" /> floussi.app
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {c.liveLabel}
          </span>
        </div>

        {/* dashboard body */}
        <div className="grid gap-3 p-4 sm:grid-cols-5 sm:p-5">
          {/* hero mini card */}
          <div className="sm:col-span-3 hero-gradient rounded-2xl p-4 text-white relative overflow-hidden">
            <div className="absolute inset-0 hero-dots opacity-60 [mask-image:radial-gradient(70%_90%_at_85%_15%,black,transparent)] pointer-events-none" aria-hidden />
            <div className="relative">
              <p className="text-[10px] text-white/70 font-medium">{c.prevToday}</p>
              {isLoading || !o ? (
                <Skeleton className="mt-1.5 h-9 w-28 bg-white/20" />
              ) : (
                <p className="mt-1 font-display font-bold text-3xl leading-none">
                  <span dir="ltr" className="inline-block">{formatMAD(o.todayTotal, lang)}</span>
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 backdrop-blur px-2.5 py-1.5">
                  <p className="text-[9px] text-white/65">{c.prevWeek}</p>
                  {isLoading || !o ? <Skeleton className="mt-1 h-4 w-14 bg-white/20" /> : (
                    <p className="font-num font-bold text-xs"><span dir="ltr" className="inline-block">{formatMAD(o.weekTotal, lang)}</span></p>
                  )}
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur px-2.5 py-1.5">
                  <p className="text-[9px] text-white/65">{c.prevMonth}</p>
                  {isLoading || !o ? <Skeleton className="mt-1 h-4 w-14 bg-white/20" /> : (
                    <p className="font-num font-bold text-xs"><span dir="ltr" className="inline-block">{formatMAD(o.monthTotal, lang)}</span></p>
                  )}
                </div>
              </div>
              {/* 14-day sparkline — real data */}
              <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
                {(isLoading || !o ? (Array.from({ length: 14 }) as (SeriesPoint | null)[]) : last14).map((d, i) => {
                  const v = d ? d.amount : 0
                  return isLoading || !o ? (
                    <Skeleton key={i} className="flex-1 h-4 bg-white/15" />
                  ) : (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-sm bg-white/45"
                      initial={{ height: 2 }}
                      animate={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.4 + i * 0.03, ease: 'easeOut' }}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          {/* IQ + recent column */}
          <div className="sm:col-span-2 flex flex-col gap-3">
            <div className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <Brain className="size-3.5 text-primary" /> {c.prevScore}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                {isLoading ? <Skeleton className="h-8 w-14" /> : (
                  <span className="font-display font-bold text-3xl leading-none text-gradient-money">{iq && !iq.empty ? iq.score : '—'}</span>
                )}
                <span className="font-num text-[10px] text-muted-foreground">/ 100</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-indigo-400 to-fuchsia-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${iq && !iq.empty ? iq.score : 0}%` }}
                  transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-3.5 flex-1 min-h-0">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2">{c.prevRecent}</p>
              <div className="space-y-1.5">
                {isLoading || !o
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-xl" />)
                  : o.recent.slice(0, 3).map((tx) => (
                      <div key={tx.id} className="flex items-center gap-2">
                        <span
                          className="size-6.5 rounded-lg flex items-center justify-center shrink-0 text-[11px]"
                          style={{ background: `${tx.category.color}1a`, color: tx.category.color }}
                          aria-hidden
                        >
                          {tx.category.name?.[0] ?? '•'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium truncate">{tx.note || tx.category.name}</span>
                        </span>
                        <span className="font-num font-semibold text-[11px]" dir="ltr">{formatMAD(tx.amount, lang)}</span>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>

        <figcaption className="border-t bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
          {c.demoNote}
        </figcaption>
      </figure>

      {/* floating edge chip — desktop only, subtle */}
      <div className={cn('absolute -bottom-3 hidden md:flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[10px] font-semibold card-shadow', dir === 'rtl' ? 'start-6' : 'end-6')} aria-hidden>
        <ArrowRight className="size-3 text-primary rtl:-scale-x-100" />
        <span className="font-num">{o ? o.txTotal : '—'}</span>
        <span className="text-muted-foreground">{c.statTx}</span>
      </div>
    </motion.div>
  )
}
