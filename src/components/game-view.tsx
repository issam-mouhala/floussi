'use client'

import * as React from 'react'
import { Bomb, Coins, Flame, Heart, MoveHorizontal, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react'
import { useApp } from './app-context'
import { formatMAD } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'playing' | 'paused' | 'over'

interface Item {
  x: number; y: number; r: number
  kind: 'coin' | 'bomb'
  v: number // coin value in DH
  vy: number // fall speed multiplier
  spin: number; spinV: number; ph: number
}
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: string }
interface Pop { x: number; y: number; life: number; txt: string }
interface Star { x: number; y: number; r: number; tw: number }

// DH coin tiers — value, spawn weight, radius
const TIERS = [
  { v: 1, w: 58, r: 14 },
  { v: 2, w: 24, r: 15.5 },
  { v: 5, w: 13, r: 17.5 },
  { v: 10, w: 5, r: 20 },
]

const BEST_KEY = 'floussi-game-best'
const MUTE_KEY = 'floussi-game-muted'

interface Engine {
  W: number; H: number
  items: Item[]; parts: Part[]; pops: Pop[]; stars: Star[]
  bx: number; bw: number // basket x (normalized) + width (px)
  score: number; lives: number; streak: number
  nextFeverAt: number; feverUntil: number
  elapsed: number; spawnAcc: number; idleAcc: number; shake: number
}

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function GameView() {
  const { t, lang } = useApp()
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [score, setScore] = React.useState(0)
  const [lives, setLives] = React.useState(3)
  const [streak, setStreak] = React.useState(0)
  const [fever, setFever] = React.useState(false)
  const [best, setBest] = React.useState(0)
  const [newBest, setNewBest] = React.useState(false)
  const [muted, setMuted] = React.useState(false)

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const engRef = React.useRef<Engine | null>(null)
  const phaseRef = React.useRef<Phase>('idle')
  React.useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const mutedRef = React.useRef(false)
  const keysRef = React.useRef<Set<string>>(new Set())
  const audioRef = React.useRef<AudioContext | null>(null)

  // ---- tiny WebAudio synth — no assets, pure ambiance ----
  const blip = React.useCallback((freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, slide?: number) => {
    if (mutedRef.current || !audioRef.current) return
    const ctx = audioRef.current
    if (ctx.state === 'suspended') void ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, ctx.currentTime)
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur)
    g.gain.setValueAtTime(vol, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur + 0.02)
  }, [])

  const ensureAudio = React.useCallback(() => {
    if (audioRef.current) return
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AC) audioRef.current = new AC()
    } catch { /* audio optional */ }
  }, [])

  // ---- persistence ----
  React.useEffect(() => {
    try {
      setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0)
      setMuted(localStorage.getItem(MUTE_KEY) === '1')
    } catch { /* private mode */ }
  }, [])
  React.useEffect(() => {
    mutedRef.current = muted
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
  }, [muted])

  // ---- game controls ----
  const start = React.useCallback(() => {
    const eng = engRef.current
    if (eng) {
      eng.items = []; eng.parts = []; eng.pops = []
      eng.score = 0; eng.lives = 3; eng.streak = 0
      eng.nextFeverAt = 8; eng.feverUntil = 0
      eng.elapsed = 0; eng.spawnAcc = 0.7; eng.shake = 0; eng.bx = 0.5
    }
    ensureAudio()
    setScore(0); setLives(3); setStreak(0); setFever(false); setNewBest(false)
    setPhase('playing')
  }, [ensureAudio])

  // ---- main engine effect (mount once) ----
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const eng: Engine = {
      W: 0, H: 0,
      items: [], parts: [], pops: [], stars: [],
      bx: 0.5, bw: 80,
      score: 0, lives: 3, streak: 0,
      nextFeverAt: 8, feverUntil: 0,
      elapsed: 0, spawnAcc: 0, idleAcc: 0, shake: 0,
    }
    engRef.current = eng

    // sizing — DPR aware, responsive
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      eng.W = rect.width
      eng.H = rect.height
      eng.bw = Math.min(96, Math.max(64, rect.width * 0.22))
      eng.stars = Array.from({ length: 26 }, () => ({
        x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.1, tw: Math.random() * 6,
      }))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const pickTier = () => {
      const total = TIERS.reduce((s, x) => s + x.w, 0)
      let roll = Math.random() * total
      for (const tr of TIERS) { roll -= tr.w; if (roll <= 0) return tr }
      return TIERS[0]
    }

    const spawn = (bombP: number) => {
      if (Math.random() < bombP) {
        eng.items.push({ x: (0.07 + Math.random() * 0.86) * eng.W, y: -22, r: 15, kind: 'bomb', v: 0, vy: 1, spin: 0, spinV: 0, ph: Math.random() * 6 })
      } else {
        const tr = pickTier()
        eng.items.push({
          x: (0.07 + Math.random() * 0.86) * eng.W, y: -22, r: tr.r, kind: 'coin', v: tr.v,
          vy: (0.85 + Math.random() * 0.35) * (tr.v === 10 ? 1.12 : 1),
          spin: Math.random() * 6, spinV: 2.2 + Math.random() * 2.4, ph: Math.random() * 6,
        })
      }
    }

    const burst = (x: number, y: number, c: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const s = 40 + Math.random() * 130
        eng.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.3, max: 0.8, r: 1.5 + Math.random() * 2.5, c })
      }
    }

    const sCoin = (v: number) => { blip(620 + v * 62, 0.09, 'triangle', 0.2); if (v >= 10) blip(1320, 0.12, 'sine', 0.12) }
    const sBomb = () => blip(150, 0.28, 'sawtooth', 0.25, 55)
    const sFever = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.08, 'square', 0.07), i * 70))
    const sOver = () => [392, 311, 262].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'triangle', 0.14), i * 160))

    const gameOver = () => {
      sOver()
      try {
        const prev = Number(localStorage.getItem(BEST_KEY) ?? '0') || 0
        if (eng.score > prev) {
          localStorage.setItem(BEST_KEY, String(eng.score))
          setBest(eng.score)
          setNewBest(eng.score > 0)
        }
      } catch { /* private mode */ }
      setPhase('over')
    }

    const catchIt = (it: Item, now: number) => {
      if (it.kind === 'bomb') {
        eng.lives -= 1
        setLives(Math.max(eng.lives, 0))
        eng.streak = 0; setStreak(0)
        eng.feverUntil = 0; setFever(false)
        eng.shake = 14
        burst(it.x, it.y, '#ef4444', 16)
        sBomb()
        if (eng.lives <= 0) gameOver()
        return
      }
      const fev = now < eng.feverUntil
      const gained = it.v * (fev ? 2 : 1)
      eng.score += gained
      setScore(eng.score)
      eng.streak += 1
      setStreak(eng.streak)
      eng.pops.push({ x: it.x, y: it.y, life: 0.9, txt: `+${gained}` })
      burst(it.x, it.y, '#fbbf24', 10)
      sCoin(it.v)
      if (!fev && eng.streak >= eng.nextFeverAt) {
        eng.feverUntil = now + 6000
        eng.nextFeverAt = eng.streak + 10
        setFever(true)
        sFever()
      }
    }

    const update = (dt: number, now: number) => {
      eng.elapsed += dt
      // keyboard steering
      const k = keysRef.current
      const step = dt * 1.35
      if (k.has('ArrowLeft') || k.has('a')) eng.bx -= step
      if (k.has('ArrowRight') || k.has('d')) eng.bx += step
      eng.bx = Math.min(0.94, Math.max(0.06, eng.bx))
      // spawning — ramps with time, calmer during fever
      eng.spawnAcc -= dt
      if (eng.spawnAcc <= 0) {
        const fev = now < eng.feverUntil
        const bombP = Math.min(0.15 + eng.elapsed * 0.004, 0.3) * (fev ? 0.55 : 1)
        const iv = Math.max(0.95 - eng.elapsed * 0.012, 0.42) * (fev ? 0.72 : 1)
        eng.spawnAcc = iv * (0.85 + Math.random() * 0.3)
        spawn(bombP)
      }
      // fall + catch
      const base = Math.min(eng.H * (0.26 + eng.elapsed * 0.01), eng.H * 0.7)
      const bxPx = eng.bx * eng.W
      const basketY = eng.H - 52
      for (let i = eng.items.length - 1; i >= 0; i--) {
        const it = eng.items[i]
        it.y += it.vy * base * dt
        it.spin += it.spinV * dt
        it.x += Math.sin(now / 400 + it.ph) * 6 * dt
        if (
          it.y + it.r >= basketY && it.y - it.r <= basketY + 26 &&
          Math.abs(it.x - bxPx) <= eng.bw / 2 + it.r * 0.4
        ) {
          eng.items.splice(i, 1)
          catchIt(it, now)
          if (phaseRef.current !== 'playing') return // game over mid-frame
          continue
        }
        if (it.y - it.r > eng.H) {
          eng.items.splice(i, 1)
          if (it.kind === 'coin' && eng.streak !== 0) { eng.streak = 0; setStreak(0) }
        }
      }
      // fever expiry
      if (eng.feverUntil && now >= eng.feverUntil) { eng.feverUntil = 0; setFever(false) }
    }

    const idleUpdate = (dt: number, now: number) => {
      eng.idleAcc -= dt
      if (eng.idleAcc <= 0) {
        eng.idleAcc = 0.7 + Math.random() * 0.7
        const tr = pickTier()
        eng.items.push({
          x: (0.08 + Math.random() * 0.84) * eng.W, y: -22, r: tr.r, kind: 'coin', v: tr.v,
          vy: 0.32 + Math.random() * 0.16, spin: Math.random() * 6, spinV: 1.4 + Math.random(), ph: Math.random() * 6,
        })
      }
      eng.bx = 0.5 + Math.sin(now / 1400) * 0.16 // gentle sway
      for (let i = eng.items.length - 1; i >= 0; i--) {
        const it = eng.items[i]
        it.y += it.vy * eng.H * dt
        it.spin += it.spinV * dt
        if (it.y - it.r > eng.H) eng.items.splice(i, 1)
      }
    }

    const stepFx = (dt: number) => {
      for (let i = eng.parts.length - 1; i >= 0; i--) {
        const p = eng.parts[i]
        p.life -= dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 260 * dt
        if (p.life <= 0) eng.parts.splice(i, 1)
      }
      for (let i = eng.pops.length - 1; i >= 0; i--) {
        const p = eng.pops[i]
        p.life -= dt
        p.y -= 42 * dt
        if (p.life <= 0) eng.pops.splice(i, 1)
      }
      eng.shake = Math.max(0, eng.shake - dt * 34)
    }

    const drawCoin = (it: Item, now: number) => {
      const sx = Math.abs(Math.cos(it.spin)) * 0.75 + 0.25 // 3D spin illusion
      ctx.save()
      ctx.translate(it.x, it.y + Math.sin(now / 300 + it.ph) * 1.5)
      ctx.scale(sx, 1)
      const g = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.35, it.r * 0.2, 0, 0, it.r)
      g.addColorStop(0, '#fde68a')
      g.addColorStop(0.55, '#fbbf24')
      g.addColorStop(1, '#b45309')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, it.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,53,15,0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, it.r * 0.62, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#7c2d12'
      ctx.font = `bold ${Math.max(10, Math.round(it.r * 0.8))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(it.v), 0, 0.5)
      ctx.restore()
    }

    const drawBomb = (it: Item, now: number) => {
      ctx.save()
      ctx.translate(it.x, it.y)
      const g = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.35, it.r * 0.2, 0, 0, it.r)
      g.addColorStop(0, '#f87171')
      g.addColorStop(0.6, '#dc2626')
      g.addColorStop(1, '#7f1d1d')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, it.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(69,10,10,0.8)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // fuse
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -it.r)
      ctx.quadraticCurveTo(it.r * 0.5, -it.r - 6, it.r * 0.25, -it.r - 11)
      ctx.stroke()
      ctx.fillStyle = Math.sin(now / 80) > 0 ? '#fbbf24' : '#f97316'
      ctx.beginPath()
      ctx.arc(it.r * 0.25, -it.r - 11, 2.4, 0, Math.PI * 2)
      ctx.fill()
      // ✕ mark
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2.4
      const m = it.r * 0.42
      ctx.beginPath()
      ctx.moveTo(-m, -m); ctx.lineTo(m, m)
      ctx.moveTo(m, -m); ctx.lineTo(-m, m)
      ctx.stroke()
      ctx.restore()
    }

    const drawBasket = (now: number) => {
      const bx = eng.bx * eng.W
      const y = eng.H - 52
      const w = eng.bw
      const h = 26
      const fev = now < eng.feverUntil
      ctx.save()
      ctx.translate(bx, y)
      if (fev) { ctx.shadowColor = 'rgba(251,191,36,0.9)'; ctx.shadowBlur = 22 }
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#34d399')
      g.addColorStop(1, '#059669')
      ctx.fillStyle = g
      rr(ctx, -w / 2, 0, w, h, 9)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(6,78,59,0.85)'
      ctx.lineWidth = 2
      ctx.stroke()
      // coin slot
      ctx.fillStyle = 'rgba(6,78,59,0.6)'
      rr(ctx, -w / 2 + 7, 3, w - 14, 6, 3)
      ctx.fill()
      ctx.restore()
    }

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // night-sky backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, eng.H)
      bg.addColorStop(0, '#0a1022')
      bg.addColorStop(1, '#0e1c33')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, eng.W, eng.H)
      for (const s of eng.stars) {
        ctx.globalAlpha = 0.22 + 0.36 * Math.abs(Math.sin(now / 900 + s.tw))
        ctx.fillStyle = '#dbeafe'
        ctx.beginPath()
        ctx.arc(s.x * eng.W, s.y * eng.H, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // bottom glow
      const gl = ctx.createLinearGradient(0, eng.H - 60, 0, eng.H)
      gl.addColorStop(0, 'rgba(16,185,129,0)')
      gl.addColorStop(1, 'rgba(16,185,129,0.10)')
      ctx.fillStyle = gl
      ctx.fillRect(0, eng.H - 60, eng.W, 60)

      ctx.save()
      if (eng.shake > 0) ctx.translate((Math.random() - 0.5) * eng.shake, (Math.random() - 0.5) * eng.shake)
      for (const it of eng.items) (it.kind === 'coin' ? drawCoin : drawBomb)(it, now)
      drawBasket(now)
      for (const p of eng.parts) {
        ctx.globalAlpha = Math.max(p.life / p.max, 0)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = 'bold 15px system-ui, sans-serif'
      for (const p of eng.pops) {
        ctx.globalAlpha = Math.max(p.life / 0.9, 0)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(120,53,15,0.65)'
        ctx.strokeText(p.txt, p.x, p.y)
        ctx.fillStyle = '#fde68a'
        ctx.fillText(p.txt, p.x, p.y)
      }
      ctx.globalAlpha = 1
      ctx.restore()
      if (now < eng.feverUntil) {
        ctx.fillStyle = 'rgba(251,191,36,0.05)'
        ctx.fillRect(0, 0, eng.W, eng.H)
      }
    }

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const ph = phaseRef.current
      if (!eng.W || !eng.H) return
      if (ph === 'playing') { update(dt, now); stepFx(dt) }
      else if (ph === 'idle') { idleUpdate(dt, now); stepFx(dt) }
      draw(now)
    }
    raf = requestAnimationFrame(loop)

    // pointer steering — drag anywhere on the canvas
    const onPointer = (e: PointerEvent) => {
      if (phaseRef.current !== 'playing') return
      const rect = canvas.getBoundingClientRect()
      eng.bx = Math.min(0.94, Math.max(0.06, (e.clientX - rect.left) / rect.width))
    }
    canvas.addEventListener('pointerdown', onPointer)
    canvas.addEventListener('pointermove', onPointer)

    // keyboard — arrows / A,D steer, Space & Esc pause
    const kd = (e: KeyboardEvent) => {
      const ph = phaseRef.current
      if (ph === 'playing' && ['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
      if (e.key === ' ' && ph === 'playing') { setPhase('paused'); return }
      if (e.key === ' ' && ph === 'paused') { setPhase('playing'); return }
      if (e.key === 'Escape' && ph === 'playing') { setPhase('paused'); return }
      keysRef.current.add(e.key)
    }
    const ku = (e: KeyboardEvent) => { keysRef.current.delete(e.key) }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    // auto-pause when the tab hides
    const vis = () => {
      if (document.hidden && phaseRef.current === 'playing') setPhase('paused')
    }
    document.addEventListener('visibilitychange', vis)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
      canvas.removeEventListener('pointermove', onPointer)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [blip])

  const hows = [
    { icon: MoveHorizontal, txt: t('game.how1') },
    { icon: Coins, txt: t('game.how2') },
    { icon: Bomb, txt: t('game.how3') },
  ]

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('game.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('game.tagline')}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold">
          <Trophy className="size-3.5 text-amber-500" />
          {t('game.best')}
          <span className="font-num text-primary">{best}</span>
          <span className="text-muted-foreground font-num">DH</span>
        </div>
      </div>

      {/* playfield */}
      <div className="relative mx-auto w-full max-w-[420px] h-[min(66svh,540px)] rounded-[28px] overflow-hidden border border-black/20 bg-[#0a1022] shadow-xl select-none">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* HUD — DOM text stays bidi-safe; canvas holds only digits */}
        {(phase === 'playing' || phase === 'paused') && (
          <div className="absolute top-2.5 inset-x-3 flex items-start justify-between pointer-events-none">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/45">{t('game.score')}</p>
              <p className="text-xl leading-none font-bold font-num text-white mt-0.5">
                {score}<span className="text-[10px] text-amber-300 font-semibold ms-1">DH</span>
              </p>
              {fever ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 text-amber-950 px-2 py-0.5 text-[10px] font-bold mt-1.5">
                  <Flame className="size-3" /> {t('game.fever')}
                </span>
              ) : streak >= 3 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/12 text-white/85 px-2 py-0.5 text-[10px] font-bold mt-1.5">
                  <Flame className="size-3 text-amber-400" /> {t('game.streak')} <span className="font-num">{streak}</span>
                </span>
              ) : null}
            </div>
            <div className="text-end space-y-1.5">
              <div className="flex items-center justify-end gap-1 text-white/70">
                <Trophy className="size-3 text-amber-400" />
                <span className="text-[11px] font-num font-bold">{best}</span>
              </div>
              <div className="flex gap-0.5 justify-end">
                {[0, 1, 2].map((i) => (
                  <Heart key={i} className={cn('size-3.5', i < lives ? 'fill-rose-500 text-rose-500' : 'fill-white/10 text-white/15')} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* idle — start screen over ambient coins */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-[300px] rounded-3xl bg-black/55 backdrop-blur-md border border-white/10 p-5 text-center text-white card-shadow">
              <div className="size-12 mx-auto rounded-2xl hero-gradient flex items-center justify-center mb-3">
                <Coins className="size-6 text-white" />
              </div>
              <p className="text-lg font-bold tracking-tight">{t('game.title')}</p>
              <p className="text-xs text-white/65 mt-1">{t('game.tagline')}</p>
              <div className="mt-3 space-y-1.5 text-start">
                {hows.map(({ icon: Icon, txt }, i) => (
                  <p key={i} className="flex items-start gap-2 text-[11px] text-white/75 leading-snug">
                    <Icon className="size-3.5 mt-px shrink-0 text-amber-300" />
                    <span>{txt}</span>
                  </p>
                ))}
              </div>
              <Button onClick={start} className="h-11 w-full rounded-xl hero-gradient text-white font-bold border-0 mt-4 hover:opacity-95">
                <Play className="size-4 fill-white" /> {t('game.play')}
              </Button>
            </div>
          </div>
        )}

        {/* paused */}
        {phase === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
            <div className="rounded-3xl bg-black/60 border border-white/10 p-5 text-center text-white">
              <p className="font-bold">{t('game.paused')}</p>
              <Button onClick={() => setPhase('playing')} className="h-10 rounded-xl hero-gradient text-white font-bold border-0 mt-3 hover:opacity-95">
                <Play className="size-4 fill-white" /> {t('game.resume')}
              </Button>
            </div>
          </div>
        )}

        {/* game over */}
        {phase === 'over' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-[300px] rounded-3xl bg-black/60 backdrop-blur-md border border-white/10 p-5 text-center text-white">
              <p className="text-lg font-bold">{t('game.over')}</p>
              <p className="text-3xl font-bold font-num text-amber-300 mt-2 leading-none">{score}<span className="text-xs text-amber-200/80 font-semibold ms-1">DH</span></p>
              <p className="text-xs text-white/70 mt-2">{t('game.overMsg', { a: formatMAD(score, lang) })}</p>
              {newBest && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 text-amber-950 px-2.5 py-1 text-[10px] font-bold mt-2.5">
                  <Trophy className="size-3" /> {t('game.newBest')}
                </span>
              )}
              <div className="flex items-center justify-center gap-1.5 text-xs text-white/65 mt-2.5">
                <Trophy className="size-3.5 text-amber-400" />
                {t('game.best')}: <span className="font-num font-bold text-white">{best}</span>
              </div>
              <Button onClick={start} className="h-11 w-full rounded-xl hero-gradient text-white font-bold border-0 mt-4 hover:opacity-95">
                <RotateCcw className="size-4" /> {t('game.playAgain')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* controls under the playfield */}
      <div className="mx-auto w-full max-w-[420px] flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setMuted((m) => !m)} aria-label={t('game.sound')}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          {t('game.sound')}
        </Button>
        {phase === 'playing' && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPhase('paused')}>
            <Pause className="size-4" /> {t('game.pause')}
          </Button>
        )}
        {phase === 'paused' && (
          <Button size="sm" className="rounded-xl hero-gradient text-white border-0" onClick={() => setPhase('playing')}>
            <Play className="size-4 fill-white" /> {t('game.resume')}
          </Button>
        )}
      </div>
    </div>
  )
}
