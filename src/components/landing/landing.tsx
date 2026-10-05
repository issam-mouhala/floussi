'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Wallet, Sun, Moon, ArrowDown, Sparkles, ChevronDown } from 'lucide-react'
import { useApp } from '../app-context'
import { useAuthMe, useOverview } from '../api'
import { useAppStore } from '@/lib/store'
import { useSettings, useUpdateSettings } from '../api'
import { LANGS } from '@/lib/i18n'
import { setGuestLang } from '@/lib/guest-lang'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { landingCopy, type LandingCopy, type LandingLang } from './copy'
import { ProductPreview } from './preview'
import { FeaturesSection, IqSection, CoachSection, TrilingualSection, PrivacySection, CtaSection } from './sections'

/* ---------------- shared: enter the app, or open the auth screen ------------ */

/** CTA behaviour (Task 21): signed in → straight into the product;
 *  signed out → the login/signup screen takes over. */
function useEnterOrAuth() {
  const enterApp = useAppStore((s) => s.enterApp)
  const setShowAuth = useAppStore((s) => s.setShowAuth)
  const { data: auth } = useAuthMe()
  const signedIn = !!auth?.user
  return React.useCallback(
    () => (signedIn ? enterApp() : setShowAuth(true)),
    [signedIn, enterApp, setShowAuth],
  )
}

/* ---------------- navbar ---------------- */

function Navbar({ c }: { c: LandingCopy }) {
  const { lang } = useApp()
  const enter = useEnterOrAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const { data: auth } = useAuthMe()
  const signedIn = !!auth?.user
  const { data: settings } = useSettings({ enabled: signedIn })
  const update = useUpdateSettings()

  const links = [
    { href: '#product', label: c.navProduct },
    { href: '#iq', label: c.navIq },
    { href: '#coach', label: c.navCoach },
    { href: '#privacy', label: c.navPrivacy },
  ]

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Floussi">
          <span className="size-9 rounded-2xl hero-gradient glow-primary flex items-center justify-center">
            <Wallet className="size-4.5 text-white" />
          </span>
          <span className="font-display text-[17px] font-bold tracking-tight">Floussi</span>
        </a>

        <nav className="hidden md:flex items-center gap-1" aria-label="Landing">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          {/* language switch — account setting when signed in, guest lang otherwise */}
          <div className="hidden sm:flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => (signedIn ? update.mutate({ language: l.code }) : setGuestLang(l.code))}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-semibold transition-all min-w-8',
                  l.code === lang ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={l.native}
                aria-pressed={l.code === lang}
              >
                {l.code === 'en' ? 'EN' : l.code === 'fr' ? 'FR' : 'دار'}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl size-9"
            aria-label="Toggle theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </Button>

          <Button onClick={enter} size="sm" className="rounded-xl h-9 font-semibold">
            {c.openApp}
          </Button>
        </div>
      </div>
    </motion.header>
  )
}

/* ---------------- hero ---------------- */

function Hero({ c }: { c: LandingCopy }) {
  const enter = useEnterOrAuth()
  return (
    <section id="top" className="relative pt-12 sm:pt-16 pb-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground card-shadow"
        >
          <Sparkles className="size-3.5 text-primary" />
          {c.badge}
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06 }}
          className="mx-auto mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.08] sm:text-6xl font-bold tracking-tight"
        >
          {c.h1a}
          <br />
          <span className="text-gradient-money">{c.h1b}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mx-auto mt-5 max-w-2xl text-[15px] sm:text-base leading-relaxed text-muted-foreground"
        >
          {c.sub}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-3"
        >
          <Button onClick={enter} size="lg" className="rounded-xl h-11 px-7 font-semibold shadow-lg shadow-primary/25">
            {c.ctaPrimary}
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-xl h-11 px-6 font-semibold">
            <a href="#product">
              {c.ctaSecondary} <ArrowDown className="size-4" />
            </a>
          </Button>
        </motion.div>
      </div>

      <div className="mt-10 sm:mt-12 px-4 sm:px-6">
        <ProductPreview c={c} />
      </div>
    </section>
  )
}

/* ---------------- real stats strip ---------------- */

function StatsStrip({ c }: { c: LandingCopy }) {
  const { lang } = useApp()
  const { data } = useOverview(lang)
  const o = data?.overview
  const stats = [
    { value: o ? o.txTotal : null, label: c.statTx },
    { value: '3', label: c.statLang },
    { value: 'MAD', label: c.statMAD },
  ]
  return (
    <section className="py-10">
      <motion.dl
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto grid max-w-4xl grid-cols-3 gap-3"
      >
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card/60 px-4 py-5 text-center card-shadow">
            <dt className="order-2 mt-1 block text-[11px] sm:text-xs text-muted-foreground leading-snug">{s.label}</dt>
            <dd className="order-1 font-display text-2xl sm:text-3xl font-bold tracking-tight">
              {s.value === null ? <Skeleton className="mx-auto h-8 w-14" /> : <span dir="ltr">{s.value}</span>}
            </dd>
          </div>
        ))}
      </motion.dl>
    </section>
  )
}

/* ---------------- footer ---------------- */

function Footer({ c }: { c: LandingCopy }) {
  const enter = useEnterOrAuth()
  return (
    <footer className="mt-auto border-t bg-sidebar/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="size-9 rounded-2xl hero-gradient glow-primary flex items-center justify-center">
              <Wallet className="size-4.5 text-white" />
            </span>
            <div>
              <p className="font-display font-bold text-sm">Floussi</p>
              <p className="text-xs text-muted-foreground">{c.footerTag}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" aria-label={c.footerTech}>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 me-1">{c.footerTech}</span>
            {['Next.js 16', 'TypeScript', 'Prisma', 'Turso', 'Tailwind v4', 'framer-motion'].map((tech) => (
              <span key={tech} className="rounded-full border bg-card px-2.5 py-1 font-num text-[10px] font-medium text-muted-foreground">
                {tech}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t pt-5">
          <p className="text-[11px] text-muted-foreground">© 2026 Floussi · Made in Morocco 🇲🇦</p>
          <button onClick={enter} className="text-[11px] font-semibold text-primary hover:underline underline-offset-4">
            {c.openApp} <ChevronDown className="inline size-3 -rotate-90 rtl:rotate-90" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  )
}

/* ---------------- composition ---------------- */

export function Landing() {
  const { lang, dir } = useApp()
  const copy: LandingCopy = landingCopy[(lang as LandingLang) in landingCopy ? (lang as LandingLang) : 'en']

  return (
    <div dir={dir} className="flex min-h-dvh flex-col">
      <Navbar c={copy} />
      <main className="flex-1">
        <Hero c={copy} />
        <StatsStrip c={copy} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FeaturesSection c={copy} />
          <IqSection c={copy} />
          <CoachSection c={copy} />
          <TrilingualSection c={copy} />
          <PrivacySection c={copy} />
          <CtaSection c={copy} />
        </div>
      </main>
      <Footer c={copy} />
    </div>
  )
}
