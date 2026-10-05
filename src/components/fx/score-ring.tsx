'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * SegmentedScoreRing — 10 segments filled proportionally to a 0–100 score.
 * Proprietary visualization for Floussi IQ (product card + landing showcase).
 * Gradient sweep emerald → indigo → fuchsia, count-up numeral, reduced-motion safe.
 */
export function SegmentedScoreRing({
  score,
  size = 150,
  strokeWidth = 9,
  label = '/ 100',
  className,
}: {
  score: number
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
}) {
  const reduce = useReducedMotion()
  const [shown, setShown] = React.useState(reduce ? score : 0)

  React.useEffect(() => {
    if (reduce) {
      setShown(score)
      return
    }
    const start = performance.now()
    const dur = 950
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      setShown(Math.round(score * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score, reduce])

  const SEG = 10
  const GAP = 5 // degrees
  const segSpan = 360 / SEG - GAP
  const R = (size - strokeWidth * 2) / 2
  const C = 2 * Math.PI * R

  const segDash = (segSpan / 360) * C
  const gapDash = (GAP / 360) * C
  const filled = Math.round((shown / 100) * SEG)

  return (
    <div
      className={`relative shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Floussi IQ ${score} / 100`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="fIQ" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        {/* track segments */}
        {Array.from({ length: SEG }).map((_, i) => {
          const a = (360 / SEG) * i
          return (
            <circle
              key={`t${i}`}
              cx={size / 2}
              cy={size / 2}
              r={R}
              fill="none"
              stroke="white"
              strokeOpacity={0.16}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segDash} ${C - segDash}`}
              strokeDashoffset={-((gapDash / 2 + (360 / SEG) * i / 360 * C) % C)}
              transform={`rotate(${a} ${size / 2} ${size / 2})`}
            />
          )
        })}
        {/* filled segments — animated sweep */}
        {Array.from({ length: SEG }).map((_, i) => {
          const a = (360 / SEG) * i
          const on = i < filled
          return (
            <motion.circle
              key={`f${i}`}
              cx={size / 2}
              cy={size / 2}
              r={R}
              fill="none"
              stroke="url(#fIQ)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segDash} ${C - segDash}`}
              strokeDashoffset={-((gapDash / 2 + (360 / SEG) * i / 360 * C) % C)}
              transform={`rotate(${a} ${size / 2} ${size / 2})`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: on ? 1 : 0 }}
              transition={{ duration: 0.25, delay: reduce ? 0 : 0.35 + i * 0.055 }}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold leading-none" style={{ fontSize: size * 0.29 }}>
          {shown}
        </span>
        <span className="font-num text-muted-foreground/70 mt-1" style={{ fontSize: Math.max(10, size * 0.072) }}>
          {label}
        </span>
      </div>
    </div>
  )
}
