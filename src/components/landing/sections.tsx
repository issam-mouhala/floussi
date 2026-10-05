'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight, ChartPie, PiggyBank, Bell, Brain, Smartphone,
  ShieldCheck, Database, Download, Sparkles, BadgeCheck, Languages,
} from 'lucide-react'
import { useApp } from '../app-context'
import { useOverview, useIntelligence } from '../api'
import { useAppStore } from '@/lib/store'
import { formatMAD } from '@/lib/money'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SegmentedScoreRing } from '../fx/score-ring'
import { cn } from '@/lib/utils'
import type { LandingCopy } from './copy'

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <motion.div {...fadeUp} className="max-w-2xl">
      <h2 className="font-display text-2xl sm:text-[2rem] font-bold leading-tight tracking-tight">{title}</h2>
      <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

/* ---------------- features grid ---------------- */

export function FeaturesSection({ c }: { c: LandingCopy }) {
  const feats = [
    { icon: ArrowLeftRight, t: c.feat1t, d: c.feat1d, accent: 'text-primary bg-primary/10' },
    { icon: ChartPie, t: c.feat2t, d: c.feat2d, accent: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
    { icon: PiggyBank, t: c.feat3t, d: c.feat3d, accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
    { icon: Bell, t: c.feat4t, d: c.feat4d, accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
    { icon: Brain, t: c.feat5t, d: c.feat5d, accent: 'text-violet-600 dark:text-violet-400 bg-violet-500/10' },
    { icon: Smartphone, t: c.feat6t, d: c.feat6d, accent: 'text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10' },
  ]
  return (
    <section id="product" className="scroll-mt-24 py-14 sm:py-20">
      <SectionHead title={c.featTitle} sub={c.featSub} />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {feats.map((f, i) => (
          <motion.article
            key={f.t}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card p-5 card-shadow card-hover"
          >
            <span className={cn('size-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105', f.accent)}>
              <f.icon className="size-4.5" />
            </span>
            <h3 className="mt-3.5 font-semibold text-[15px] tracking-tight">{f.t}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.d}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

/* ---------------- Floussi IQ showcase ---------------- */

function useStoreView() {
  return useAppStore((s) => s.setView)
}

export function IqSection({ c }: { c: LandingCopy }) {
  const { lang } = useApp()
  const setView = useStoreView()
  const { data, isLoading } = useIntelligence(lang)
  const { data: ov } = useOverview(lang)
  const o = ov?.overview

  const factors = [
    { label: c.feat2t, value: o ? `${Math.round(o.monthTotal > 0 ? (o.monthNecessary / o.monthTotal) * 100 : 0)}%` : null, ok: true },
    { label: c.prevWeek, value: o ? formatMAD(o.weekTotal, lang) : null, ok: true },
    { label: c.feat3t, value: o ? `${o.savingProgressPct}%` : null, ok: true },
  ]

  return (
    <section id="iq" className="scroll-mt-24 py-14 sm:py-20">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <SectionHead title={c.iqTitle} sub={c.iqSub} />
          <motion.div {...fadeUp} className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{c.iqWhy}</p>
            <ul className="mt-3 space-y-2">
              {factors.map((f) => (
                <li key={f.label} className="flex items-center gap-2.5 text-sm">
                  <BadgeCheck className="size-4 shrink-0 text-emerald-500" />
                  <span className="font-medium">{f.label}</span>
                  <span className="ms-auto font-num font-semibold text-muted-foreground" dir="ltr">{f.value ?? '—'}</span>
                </li>
              ))}
            </ul>
            <Button onClick={() => setView('intel')} className="mt-6 rounded-xl">
              {c.iqCta} <Sparkles className="size-4" />
            </Button>
          </motion.div>
        </div>

        <motion.div {...fadeUp} className="mx-auto w-full max-w-sm">
          <div className="relative overflow-hidden rounded-3xl border bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_35%,#4c1d95_70%,#701a75_100%)] p-6 text-white card-shadow">
            <div className="absolute -top-16 -end-12 size-44 rounded-full bg-fuchsia-400/15 blur-3xl pointer-events-none" aria-hidden />
            <div className="absolute -bottom-20 -start-10 size-40 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" aria-hidden />
            <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              {isLoading ? (
                <Skeleton className="size-[150px] rounded-full bg-white/10" />
              ) : (
                <SegmentedScoreRing score={data && !data.empty ? data.score : 0} size={150} className="text-white" />
              )}
              <div className="text-center sm:text-start">
                <p className="flex items-center justify-center gap-1.5 text-sm font-bold sm:justify-start">
                  <Brain className="size-4" /> Floussi IQ
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/65">{c.iqSub}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}


/* ---------------- AI coach showcase (real data mock) ---------------- */

export function CoachSection({ c }: { c: LandingCopy }) {
  const { lang } = useApp()
  const setView = useStoreView()
  const { data, isLoading } = useOverview(lang)
  const o = data?.overview
  const top = o?.topCategory
  const save = o ? Math.round(o.monthUnnecessary * 0.3) : 0

  return (
    <section id="coach" className="scroll-mt-24 py-14 sm:py-20">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <motion.div {...fadeUp} className="order-2 lg:order-1">
          <div className="rounded-3xl border bg-card/70 card-shadow p-4 sm:p-5 space-y-3" dir="auto">
            {isLoading ? (
              <>
                <Skeleton className="h-12 w-3/4 ms-auto rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </>
            ) : (
              <>
                {/* user bubble */}
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {c.coachQ}
                  </p>
                </div>
                {/* AI bubble — computed from real data */}
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl rounded-es-md border bg-muted/60 px-4 py-3 text-sm leading-relaxed">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5">
                      <Sparkles className="size-3 text-primary" /> FLOUSSI
                    </p>
                    <p>
                      {c.coachA1}{' '}
                      <span className="font-semibold">{top ? top.name : '—'}</span>
                      {top ? (
                        <> — <span className="font-num font-semibold" dir="ltr">{formatMAD(top.amount, lang)}</span>, {c.coachA2.replace('{pct}', String(top.pct))}{' '}
                        <span className="font-num font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">{formatMAD(save, lang)}</span>{' '}
                        <span className="font-num text-muted-foreground" dir="ltr">{c.coachPerMonth}</span>{' '}{c.coachA3}</>
                      ) : '.'}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {[c.feat2t, c.feat3t, c.feat5t].map((chip) => (
                        <span key={chip} className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>

        <div className="order-1 lg:order-2">
          <SectionHead title={c.coachTitle} sub={c.coachSub} />
          <motion.div {...fadeUp}>
            <Button variant="outline" onClick={() => setView('coach')} className="mt-6 rounded-xl">
              {c.navCoach}
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- trilingual / RTL ---------------- */

export function TrilingualSection({ c }: { c: LandingCopy }) {
  const { t } = useApp()
  const cards = [
    { name: c.triEn, dir: 'ltr' as const, phrase: t('app.tagline'), flag: 'EN' },
    { name: c.triFr, dir: 'ltr' as const, phrase: t('app.tagline'), flag: 'FR' },
    { name: c.triAry, dir: 'rtl' as const, phrase: t('app.tagline'), flag: 'دار' },
  ]
  return (
    <section className="py-14 sm:py-20">
      <SectionHead title={c.triTitle} sub={c.triSub} />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.name}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: i * 0.06 }}
            className="rounded-2xl border bg-card p-5 card-shadow"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-bold">{card.flag}</span>
              <Languages className="size-4 text-muted-foreground/50" />
            </div>
            <p className="mt-3.5 font-display text-lg font-bold" dir={card.dir}>{card.phrase}</p>
            <p className="mt-1 text-xs text-muted-foreground" dir={card.dir}>{card.name}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/* ---------------- privacy / trust ---------------- */

export function PrivacySection({ c }: { c: LandingCopy }) {
  const items = [
    { icon: Database, t: c.priv1t, d: c.priv1d },
    { icon: ShieldCheck, t: c.priv2t, d: c.priv2d },
    { icon: Download, t: c.priv3t, d: c.priv3d },
  ]
  return (
    <section id="privacy" className="scroll-mt-24 py-14 sm:py-20">
      <SectionHead title={c.privTitle} sub={c.privSub} />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <motion.div
            key={it.t}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: i * 0.06 }}
            className="rounded-2xl border bg-card p-5 card-shadow"
          >
            <span className="size-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <it.icon className="size-4.5" />
            </span>
            <h3 className="mt-3.5 font-semibold text-[15px] tracking-tight">{it.t}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{it.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/* ---------------- final CTA ---------------- */

export function CtaSection({ c }: { c: LandingCopy }) {
  const enter = useAppStore((s) => s.enterApp)
  return (
    <section className="py-14 sm:py-20">
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-3xl hero-gradient px-6 py-12 sm:px-12 text-center text-white card-shadow"
      >
        <div className="absolute inset-0 hero-dots opacity-50 [mask-image:radial-gradient(60%_80%_at_50%_0%,black,transparent)] pointer-events-none" aria-hidden />
        <div className="relative">
          <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">{c.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/75">{c.ctaSub}</p>
          <Button
            onClick={enter}
            size="lg"
            className="mt-7 rounded-xl bg-white text-[oklch(0.35_0.09_168)] hover:bg-white/90 shadow-xl shadow-black/20 font-semibold px-8"
          >
            {c.ctaButton}
          </Button>
        </div>
      </motion.div>
    </section>
  )
}
