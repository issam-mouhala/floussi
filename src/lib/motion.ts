import type { Transition, Variants } from 'framer-motion'

/**
 * Shared motion design system (Task 17 — 3D/interactive layer).
 * One place for springs, easings and variants so every screen moves
 * with the same physics. All animations are transform/opacity only
 * (GPU-composited — the key rule that keeps the app "pas lent").
 */

/** Smooth, premium spring for entrances and layout morphs. */
export const springSoft: Transition = { type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }

/** Snappy spring for micro-interactions (tabs, pills, buttons). */
export const springSnappy: Transition = { type: 'spring', stiffness: 550, damping: 38, mass: 0.7 }

/** Signature ease used across the app (expo-out feel). */
export const easeOutExpo = [0.22, 1, 0.36, 1] as const

/** Staggered entrance for lists/grids. Wrap children in <Reveal>. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export const fadeUpChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: easeOutExpo } },
}

/** 3D view transition — fast exit, springy enter, subtle perspective. */
export const viewVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.995, rotateX: 2.2 },
  show: {
    opacity: 1, y: 0, scale: 1, rotateX: 0,
    transition: springSoft,
  },
  exit: {
    opacity: 0, y: -8, scale: 0.998, rotateX: -1.4,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
}

/** Interactive tap/hover micro-feedback for cards & buttons (desktop+mobile). */
export const tapPress = { scale: 0.97 }
export const hoverLift = { y: -3 }

/** Pointer position → CSS vars for glare/tilt helpers. */
export const pointerVars = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  return {
    '--gx': `${((e.clientX - r.left) / r.width) * 100}%`,
    '--gy': `${((e.clientY - r.top) / r.height) * 100}%`,
  } as React.CSSProperties
}
