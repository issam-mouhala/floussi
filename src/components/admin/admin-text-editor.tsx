'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/components/app-context'
import { useAdmin } from './admin-context'
import { dict, type Lang } from '@/lib/i18n'
import { landingCopy, type LandingLang } from '@/components/landing/copy'

/**
 * Inline site-text editor (Task 31) — the "click any text to fix it" engine.
 *
 * HOW IT WORKS (no DOM mutation inside React's tree — 100 % safe):
 *   1. Build the EFFECTIVE value map for the current language: shipped i18n
 *      dictionary + landing copy, with admin overrides applied.
 *   2. Invert it into a lookup: normalized on-screen string → candidate keys.
 *   3. On mousemove (rAF-throttled) find the text node under the cursor via
 *      caretPositionFromPoint/caretRangeFromPoint; if its text matches a key,
 *      draw a dashed highlight box over it (pointer-events: none).
 *   4. On click (capture phase) open a small editor card near the text:
 *      edit → Save (PUT override) / Reset (DELETE override) / Cancel.
 *      Saving updates the overrides state → t()/landing copy re-render the
 *      corrected text IMMEDIATELY, for this admin; persisted in the cloud DB
 *      so every visitor sees it after their next overrides fetch.
 *
 * Texts that are NOT translatable strings (user data, numbers, dates,
 * parametrized sentences) simply never match a key and are left alone.
 */

interface Editing {
  keys: string[]
  selected: string
  lang: Lang
  rect: DOMRect
}

const FSI_PDI = /[\u2068\u2069]/g

function norm(s: string): string {
  return s.replace(FSI_PDI, '').replace(/\s+/g, ' ').trim()
}

/** Flattened { key → shipped default } for one language (dict + landing copy). */
function defaultsFor(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {}
  const d = dict(lang) as unknown as Record<string, string>
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'string' && !v.includes('{')) out[k] = v
  }
  const lc = landingCopy[lang as LandingLang] as Record<string, string> | undefined
  if (lc) {
    for (const [k, v] of Object.entries(lc)) {
      if (typeof v === 'string' && !v.includes('{')) out[`landing.${k}`] = v
    }
  }
  return out
}

function textNodeAtPoint(x: number, y: number): Text | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    return p && p.offsetNode?.nodeType === Node.TEXT_NODE ? (p.offsetNode as Text) : null
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y)
    return r && r.startContainer?.nodeType === Node.TEXT_NODE ? (r.startContainer as Text) : null
  }
  return null
}

function rectOfNode(node: Text): DOMRect | null {
  const range = document.createRange()
  range.selectNodeContents(node)
  const rect = range.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  return rect
}

export function AdminTextEditor() {
  const { isAdmin, active, overrides, saveOverride, resetOverride } = useAdmin()
  const { lang, t } = useApp()
  const [editing, setEditing] = React.useState<Editing | null>(null)
  const [draft, setDraft] = React.useState('')
  const [hover, setHover] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const enabled = isAdmin && active

  // ---- lookup tables for the current language + overrides -------------------
  const candidatesRef = React.useRef<Map<string, string[]>>(new Map())
  const defaultsRef = React.useRef<Record<string, string>>({})

  React.useEffect(() => {
    if (!enabled) {
      setHover(null)
      setEditing(null)
      return
    }
    const defaults = defaultsFor(lang)
    const ov = overrides?.[lang] ?? {}
    // effective value: override wins over the shipped dictionary
    const eff: Record<string, string> = { ...defaults }
    for (const [k, v] of Object.entries(ov)) if (k in defaults) eff[k] = v
    defaultsRef.current = defaults
    const byValue = new Map<string, string[]>()
    for (const [k, v] of Object.entries(eff)) {
      const n = norm(v)
      if (!n) continue
      const list = byValue.get(n)
      if (list) list.push(k)
      else byValue.set(n, [k])
    }
    candidatesRef.current = byValue
  }, [enabled, lang, overrides])

  // ---- hover detection + click-to-edit listeners ----------------------------
  React.useEffect(() => {
    if (!enabled) return

    let raf = 0
    let lastX = 0
    let lastY = 0

    const detect = () => {
      raf = 0
      const el = document.elementFromPoint(lastX, lastY)
      if (el?.closest('[data-fls-admin]') || el?.closest('input, textarea, select, [contenteditable="true"]')) {
        setHover(null)
        return
      }
      const node = textNodeAtPoint(lastX, lastY)
      const keys = node ? candidatesRef.current.get(norm(node.textContent ?? '')) : undefined
      if (node && keys?.length) {
        const rect = rectOfNode(node)
        if (rect) {
          setHover({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
          return
        }
      }
      setHover(null)
    }

    const onMove = (e: MouseEvent) => {
      lastX = e.clientX
      lastY = e.clientY
      if (!raf) raf = requestAnimationFrame(detect)
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target?.closest('[data-fls-admin]')) return
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const node = textNodeAtPoint(e.clientX, e.clientY)
      const keys = node ? candidatesRef.current.get(norm(node.textContent ?? '')) : undefined
      if (!keys?.length) {
        if (editing) setEditing(null) // click outside closes; nothing else editable here
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const rect = node ? rectOfNode(node) : null
      if (!rect) return
      const selected = keys[0]
      const eff = overrides?.[lang]?.[selected] ?? defaultsRef.current[selected] ?? node?.textContent ?? ''
      setHover(null)
      setDraft(eff)
      setEditing({ keys, selected, lang, rect })
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null)
    }
    const onScroll = () => {
      setEditing(null)
      setHover(null)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [enabled, lang, overrides, editing])

  if (!isAdmin || !active) return null

  const dir = lang === 'ary' ? 'rtl' : 'ltr'

  const switchKey = (k: string) => {
    if (!editing) return
    setEditing({ ...editing, selected: k })
    setDraft(overrides?.[lang]?.[k] ?? defaultsRef.current[k] ?? '')
  }

  const doSave = async () => {
    if (!editing) return
    const v = draft.trim()
    if (!v) {
      toast.error(t('admin.emptyValue'))
      return
    }
    const isDefault = norm(defaultsRef.current[editing.selected] ?? '') === norm(v)
    const ok = isDefault
      ? await resetOverride(editing.lang, editing.selected)
      : await saveOverride(editing.lang, editing.selected, v)
    if (ok) {
      toast.success(isDefault ? t('admin.resetDone') : t('admin.saved'))
      setEditing(null)
    } else {
      toast.error(t('admin.saveFailed'))
    }
  }

  const doReset = async () => {
    if (!editing) return
    const ok = await resetOverride(editing.lang, editing.selected)
    if (ok) {
      toast.success(t('admin.resetDone'))
      setEditing(null)
    } else {
      toast.error(t('admin.saveFailed'))
    }
  }

  // editor card position — below the text, clamped inside the viewport
  const VW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const VH = typeof window !== 'undefined' ? window.innerHeight : 800
  const CARD_W = Math.min(420, VW - 24)
  const EST_H = 230
  const left = Math.min(Math.max(8, editing ? editing.rect.left : 0), VW - CARD_W - 8)
  const below = editing ? editing.rect.bottom + 8 : 0
  const top = below + EST_H > VH ? Math.max(8, (editing ? editing.rect.top : 0) - EST_H - 8) : below

  return createPortal(
    <>
      {hover && !editing && (
        <div
          data-fls-admin
          aria-hidden
          className="pointer-events-none fixed z-[9997] rounded border-2 border-dashed border-amber-500 bg-amber-500/10"
          style={{ left: hover.x - 3, top: hover.y - 2, width: hover.w + 6, height: hover.h + 4 }}
        />
      )}
      {editing && (
        <div
          data-fls-admin
          dir={dir}
          role="dialog"
          aria-label={t('admin.editTexts')}
          className="fixed z-[9999] max-h-[46vh] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-2xl"
          style={{ left, top, width: CARD_W }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-muted-foreground" title={editing.selected}>
              {editing.selected}
            </span>
            <Button variant="ghost" size="icon" className="size-6 shrink-0 rounded-full" aria-label={t('common.close')} onClick={() => setEditing(null)}>
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>

          {editing.keys.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {editing.keys.map((k) => (
                <button
                  key={k}
                  onClick={() => switchKey(k)}
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition-colors ${
                    k === editing.selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={3}
            className="min-h-[72px] w-full resize-y rounded-md border bg-background p-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => void doReset()}>
              <RotateCcw className="size-3.5" aria-hidden />
              {t('admin.reset')}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" className="h-8" onClick={() => void doSave()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
