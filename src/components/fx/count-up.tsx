'use client'

import * as React from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * CountUp — rAF-eased number entrance. Respects prefers-reduced-motion
 * (jumps straight to the value). Round output keeps MAD formatting stable.
 */
export function CountUp({
  value,
  format,
  duration = 750,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = React.useState(0)

  React.useEffect(() => {
    if (reduce) {
      setDisplay(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (value - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduce])

  return <span className={cn('font-num', className)}>{format(Math.round(display))}</span>
}
