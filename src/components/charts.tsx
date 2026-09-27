'use client'

import * as React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, type TooltipProps,
} from 'recharts'
import { formatMAD, formatCompact } from '@/lib/money'
import type { Lang } from '@/lib/i18n'

// ---------- shared tooltip ----------

function MoneyTooltip({ active, payload, label, lang }: TooltipProps<number, string> & { lang: Lang }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur px-3 py-2 text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-num font-semibold">{formatMAD(Number(p.value ?? 0), lang)}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const

// localized series names for tooltips/legends
const SERIES_NAMES = {
  en: { necessary: 'Necessary', unnecessary: 'Avoidable', spent: 'Spent' },
  fr: { necessary: 'Nécessaire', unnecessary: 'Évitable', spent: 'Dépensé' },
  ary: { necessary: 'ضروري', unnecessary: 'يمكن تجنبو', spent: 'الصرف' },
} as const

// ---------- 14-day trend (necessary vs unnecessary, each drawn from 0) ----------
// NOT stacked on purpose: each line sits at its real value, so a 138 DH
// necessary line is always ABOVE a 15 DH avoidable line — no visual lying.

export function DailyTrendArea({
  data, lang, height = 220,
}: {
  data: { label: string; necessary?: number; unnecessary?: number; amount: number }[]
  lang: Lang
  height?: number
}) {
  const n = SERIES_NAMES[lang]
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="gNec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="gUnnec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.38} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" opacity={0.12} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...AXIS} width={46} tickFormatter={(v) => formatCompact(Number(v))} />
          <Tooltip content={<MoneyTooltip lang={lang} />} />
          <Area
            dataKey="necessary" name={n.necessary} type="monotone"
            stroke="#10b981" strokeWidth={2.2} fill="url(#gNec)" dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            animationDuration={550}
          />
          <Area
            dataKey="unnecessary" name={n.unnecessary} type="monotone"
            stroke="#f59e0b" strokeWidth={2.2} fill="url(#gUnnec)" dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            animationDuration={550}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- donut: necessary vs unnecessary ----------

export function NecessaryDonut({
  necessary, unnecessary, lang, size = 190,
}: {
  necessary: number
  unnecessary: number
  lang: Lang
  size?: number
}) {
  const n = SERIES_NAMES[lang]
  const data = [
    { name: n.necessary, value: Math.max(necessary, 0), color: '#10b981' },
    { name: n.unnecessary, value: Math.max(unnecessary, 0), color: '#f59e0b' },
  ]
  const total = necessary + unnecessary
  return (
    <div className="relative" style={{ width: size, height: size }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="68%"
            outerRadius="94%"
            paddingAngle={total > 0 ? 3 : 0}
            strokeWidth={0}
            cornerRadius={6}
            startAngle={90}
            endAngle={-270}
            animationDuration={550}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<MoneyTooltip lang={lang} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[11px] text-muted-foreground">{lang === 'en' ? 'Total' : lang === 'fr' ? 'Total' : 'المجموع'}</span>
        <span className="font-num font-bold text-lg">{formatMAD(total, lang)}</span>
      </div>
    </div>
  )
}

// ---------- category horizontal bars ----------

export function CategoryBars({
  data, lang, height = 260,
}: {
  data: { name: string; amount: number; color: string }[]
  lang: Lang
  height?: number
}) {
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 6" stroke="currentColor" opacity={0.12} />
          <XAxis type="number" {...AXIS} tickFormatter={(v) => formatCompact(Number(v))} />
          <YAxis type="category" dataKey="name" {...AXIS} width={92} />
          <Tooltip content={<MoneyTooltip lang={lang} />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Bar dataKey="amount" name={SERIES_NAMES[lang].spent} radius={[0, 8, 8, 0]} maxBarSize={22} animationDuration={550}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- generic day/week/month bars ----------

export function SimpleBars({
  data, lang, height = 240, highlightLast = false, color = '#10b981', stacked = false,
}: {
  data: { label: string; amount: number; necessary?: number; unnecessary?: number }[]
  lang: Lang
  height?: number
  highlightLast?: boolean
  color?: string
  stacked?: boolean
}) {
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" opacity={0.12} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={26} />
          <YAxis {...AXIS} width={46} tickFormatter={(v) => formatCompact(Number(v))} />
          <Tooltip content={<MoneyTooltip lang={lang} />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          {stacked && (
            <Bar dataKey="necessary" name={SERIES_NAMES[lang].necessary} stackId="s" fill="#10b981" radius={[0, 0, 4, 4]} maxBarSize={34} animationDuration={550} />
          )}
          {stacked && (
            <Bar dataKey="unnecessary" name={SERIES_NAMES[lang].unnecessary} stackId="s" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={34} animationDuration={550} />
          )}
          {!stacked && (
            <Bar dataKey="amount" name={SERIES_NAMES[lang].spent} radius={[6, 6, 3, 3]} maxBarSize={34} animationDuration={550}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={color}
                  fillOpacity={highlightLast && i === data.length - 1 ? 1 : 0.82}
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- goal progress ring (SVG) ----------

export function ProgressRing({ pct, size = 64, stroke = 7, color = '#10b981', children }: {
  pct: number
  size?: number
  stroke?: number
  color?: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
