'use client'

import * as React from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * TiltCard — pointer-tracked 3D tilt (perspective rotateX/rotateY) with a
 * soft glare that follows the cursor. Springs give it that premium "glass
 * card in space" feel. Strictly GPU-composited (transform/opacity) and:
 *  - OFF on touch/coarse pointers (scroll performance on phones),
 *  - OFF for prefers-reduced-motion users (accessibility).
 * Everyone else gets a static card — zero cost, same look.
 */
export function TiltCard({
  children,
  className,
  max = 6,
  glare = true,
  scale = 1.004,
}: {
  children: React.ReactNode
  className?: string
  /** max tilt in degrees */
  max?: number
  /** cursor-following light highlight */
  glare?: boolean
  scale?: number
}) {
  const reduce = useReducedMotion()
  const [finePointer, setFinePointer] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFinePointer(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 240, damping: 22 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 240, damping: 22 })

  // glare position follows the pointer as percentages
  const gx = useTransform(px, (v) => `${Math.round(v * 100)}%`)
  const gy = useTransform(py, (v) => `${Math.round(v * 100)}%`)
  const glareBg = useMotionTemplate`radial-gradient(460px circle at ${gx} ${gy}, rgba(255,255,255,0.16), transparent 58%)`

  const active = finePointer && !reduce

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active) return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  function onLeave() {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <div className="[perspective:1100px]" onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div
        className={cn('relative [transform-style:preserve-3d] rounded-3xl', className)}
        style={active ? { rotateX, rotateY } : undefined}
        whileHover={active ? { scale } : undefined}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {children}
        {active && glare && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: glareBg }}
          />
        )}
      </motion.div>
    </div>
  )
}
