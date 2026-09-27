'use client'

// ---------------------------------------------------------------------------
// SpendingWheel — "Expense dynamics" card: month total + trend badge, a radar
// of category shares in the middle and category icon bubbles around it.
// Inspired by premium fintech dashboards; fully trilingual + RTL aware.
// ---------------------------------------------------------------------------

import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, PieChart } from 'lucide-react'
import { useApp } from './app-context'
import { useAppStore } from '@/lib/store'
import { useOverview } from './api'
import { formatMAD } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CatIcon } from './cat-icon'
import { LANGS } from '@/lib/i18n'
import type { Key } from '@/lib/i18n'

interface WheelCat {
  name: string
  slug: string
  color: string
  icon: string
  amount: number
  pct: number
}

function TrendBadge({ pct }: { pct: number }) {
  const { t } = useApp()
  const down = pct <= 0
  return (
    <span
      className={cnBadge(down)}
      title={t('wheel.vsLastMonth')}
    >
      {down ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
      <span className="font-num font-semibold" dir="ltr">{Math.abs(pct)}%</span>
      <span className="hidden sm:inline font-normal opacity-80">{t('wheel.vsLastMonth')}</span>
    </span>
  )
}

function cnBadge(down: boolean) {
  return down
    ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-300/20 px-2.5 py-1 text-[11px]'
    : 'inline-flex items-center gap-1 rounded-full bg-rose-400/15 text-rose-200 border border-rose-300/20 px-2.5 py-1 text-[11px]'
}

/**
 * Axis angle for category i of n — starts at 12 o'clock, mirrored horizontally
 * in RTL. SINGLE source of truth: used by the radar SVG AND the icon bubbles,
 * so the polygon vertices and the bubbles can never drift apart.
 */
function angleOf(i: number, n: number, rtl: boolean) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 3)
  return rtl ? -a - Math.PI : a
}

/** Radar polygon inside the wheel. points = normalized 0..1 values. */
function Radar({ values, size, rtl }: { values: number[]; size: number; rtl: boolean }) {
  const n = values.length
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.36
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angleOf(i, n, rtl)),
    y: cy + r * Math.sin(angleOf(i, n, rtl)),
  })

  // grid: 3 concentric polygons
  const rings = [1 / 3, 2 / 3, 1].map((f) =>
    Array.from({ length: Math.max(n, 3) }, (_, i) => pt(i, R * f))
  )
  const spokes = Array.from({ length: Math.max(n, 3) }, (_, i) => ({ a: pt(i, R * 0.06), b: pt(i, R) }))

  const poly = values.length
    ? values.map((v, i) => pt(i, R * (0.18 + 0.82 * v)))
    : []
  const polyStr = poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="wheel-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {rings.map((ring, ri) => (
        <polygon
          key={ri}
          points={ring.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
        />
      ))}
      {spokes.map((s, i) => (
        <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
      ))}
      {poly.length >= 3 && (
        <motion.polygon
          points={polyStr}
          fill="url(#wheel-fill)"
          stroke="#a7f3d0"
          strokeWidth="1.6"
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}
      {poly.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#ecfdf5" stroke="rgba(6,78,59,0.4)" strokeWidth="1" />
      ))}
    </svg>
  )
}

export function SpendingWheel() {
  const { t, lang } = useApp()
  const { data, isLoading } = useOverview(lang)
  const rtl = LANGS.find((l) => l.code === lang)?.dir === 'rtl'
  const setView = useAppStore((s) => s.setView)

  // measure available width so the wheel never overflows (mobile → desktop)
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const [boxW, setBoxW] = React.useState(340)
  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 340
      setBoxW(Math.max(240, Math.min(360, w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (isLoading || !data) {
    return <Skeleton className="h-[420px] rounded-3xl" />
  }

  const wheel = data.overview.wheel
  const cats: WheelCat[] = wheel.cats

  // ---- layout geometry -----------------------------------------------------
  const maxPct = Math.max(...cats.map((c) => c.pct), 1)
  const radarValues = cats.map((c) => c.pct / maxPct)

  return (
    <Card className="card-shadow border-border/60 overflow-hidden p-0">
      <div className="relative rounded-3xl bg-[radial-gradient(120%_120%_at_80%_0%,#0f766e_0%,#065f46_42%,#064e3b_100%)] text-white">
        {/* decorative glows + dots texture */}
        <div className="absolute inset-0 hero-dots opacity-40 [mask-image:radial-gradient(60%_70%_at_50%_40%,black,transparent)] pointer-events-none" aria-hidden />
        <div className="absolute -top-20 -end-16 size-56 rounded-full bg-teal-300/15 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -bottom-24 -start-14 size-52 rounded-full bg-emerald-300/10 blur-3xl pointer-events-none" aria-hidden />

        <CardContent className="relative p-5 sm:p-6">
          {/* header: total + trend */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">{t('wheel.thisMonth')}</p>
              <div className="mt-0.5 text-3xl sm:text-4xl font-extrabold tracking-tight font-num">
                {formatMAD(wheel.total, lang)}
              </div>
            </div>
            {wheel.changePct !== null && <TrendBadge pct={wheel.changePct} />}
          </div>

          {/* wheel */}
          {cats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="size-14 rounded-2xl bg-white/10 flex items-center justify-center">
                <PieChart className="size-7 text-emerald-200" />
              </span>
              <p className="text-sm text-white/80 font-medium">{t('wheel.empty')}</p>
              <p className="text-xs text-white/50 max-w-xs">{t('wheel.emptyHint')}</p>
            </div>
          ) : (
            <div ref={boxRef} className="relative mx-auto mt-1 w-full" style={{ height: boxW * 1.16 }}>
              {/*
                Square "stage" horizontally centered in the card. The radar AND
                every icon bubble are positioned from THIS stage's center, so
                they stay perfectly concentric at any card width (the old bug:
                bubbles used the clamped measured width while the radar used the
                real card center → décalage on desktop / RTL).
              */}
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: boxW * 0.08, width: boxW, height: boxW }}
              >
                {/* radar sits exactly at the stage center */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Radar values={radarValues} size={boxW * 0.72} rtl={rtl} />
                </div>

                {/* icon bubbles on a ring around the SAME center */}
                {cats.map((c, i) => {
                  const ang = angleOf(i, cats.length, rtl)
                  const ringR = boxW * 0.42
                  const x = boxW / 2 + ringR * Math.cos(ang)
                  const y = boxW / 2 + ringR * Math.sin(ang)
                  const labelMax = boxW < 330 ? 64 : 76
                  return (
                    <motion.div
                      key={c.slug}
                      className="absolute flex flex-col items-center gap-1"
                      style={{
                        left: x,
                        top: y,
                        width: labelMax,
                      }}
                      // framer-motion owns `transform` once it animates scale,
                      // so centering must live INSIDE the animation (x/y %),
                      // not in style.transform — otherwise every bubble is
                      // silently anchored by its top-left corner (décalage).
                      initial={{ opacity: 0, scale: 0.5, x: '-50%', y: '-50%' }}
                      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: 'easeOut' }}
                    >
                      <span
                        className="size-10 sm:size-11 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-lg"
                        style={{ boxShadow: `0 0 18px ${c.color}33` }}
                      >
                        <CatIcon name={c.icon} className="size-4.5 sm:size-5" />
                      </span>
                      <span className="font-num text-xs font-bold leading-none" style={{ color: c.color }}>
                        <span dir="ltr">{c.pct}%</span>
                      </span>
                      <span className="text-[10px] leading-tight text-white/75 text-center w-full truncate px-0.5">
                        {c.name}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {/* footer: title + details link */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold tracking-tight">{t('wheel.title')}</h3>
              <p className="text-[11px] text-white/55">{t('wheel.desc')}</p>
            </div>
            <button
              onClick={() => setView('analytics')}
              className="group inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-semibold transition-colors"
            >
              {t('wheel.seeDetails')}
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100" />
            </button>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}
