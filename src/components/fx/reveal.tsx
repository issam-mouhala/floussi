'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { easeOutExpo } from '@/lib/motion'

/**
 * Reveal — scroll-triggered entrance (fires once when the element enters
 * the viewport). Keeps below-the-fold sections feeling alive without
 * animating everything on mount (which wastes main-thread time).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px 0px' }}
      transition={{ duration: 0.5, ease: easeOutExpo, delay }}
    >
      {children}
    </motion.div>
  )
}
