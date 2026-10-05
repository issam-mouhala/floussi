import type { Lang } from './i18n'

/**
 * Guest language (Task 21) — before signing in there is no per-account
 * settings row, so the visitor's language lives in localStorage and is
 * broadcast through a tiny window event. AppProvider listens for it and
 * re-renders every consumer (landing, auth screen) — same UX as the
 * in-app switcher, zero backend round-trip.
 */

export const GUEST_LANG_KEY = 'floussi-auth-lang'
export const GUEST_LANG_EVENT = 'floussi:guest-lang'

export function getGuestLang(): Lang | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(GUEST_LANG_KEY)
    return v === 'fr' || v === 'ary' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export function setGuestLang(lang: Lang): void {
  try {
    localStorage.setItem(GUEST_LANG_KEY, lang)
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(GUEST_LANG_EVENT, { detail: lang }))
  } catch {}
}
