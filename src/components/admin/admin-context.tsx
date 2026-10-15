'use client'

import * as React from 'react'
import type { Lang } from '@/lib/i18n'

/**
 * Admin session + site-text overrides (Task 31).
 *
 * Mounted ONCE in the root layout, above AppProvider — AppProvider reads
 * `overrides` from here to serve corrected texts through t(), and the admin
 * UI (bar + inline editor + login form) drives sign-in and edits through it.
 * Safe default context => everything is inert when no provider is present.
 */

export type OverrideMap = Partial<Record<Lang, Record<string, string>>>

export interface AdminContextValue {
  isAdmin: boolean
  /** Whether ADMIN_EMAIL/ADMIN_PASSWORD are configured server-side. */
  enabled: boolean
  /** Inline edit mode ON — texts become hoverable/clickable. */
  active: boolean
  setActive: (v: boolean) => void
  overrides: OverrideMap | null
  login: (email: string, password: string) => Promise<{ ok: boolean; status: number }>
  logout: () => Promise<void>
  saveOverride: (locale: Lang, key: string, value: string) => Promise<boolean>
  resetOverride: (locale: Lang, key: string) => Promise<boolean>
}

const noop = async () => ({ ok: false, status: 0 }) as { ok: boolean; status: number }

const AdminContext = React.createContext<AdminContextValue>({
  isAdmin: false,
  enabled: false,
  active: false,
  setActive: () => {},
  overrides: null,
  login: noop,
  logout: async () => {},
  saveOverride: async () => false,
  resetOverride: async () => false,
})

const EDIT_KEY = 'floussi-admin-edit'

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [enabled, setEnabled] = React.useState(false)
  const [overrides, setOverrides] = React.useState<OverrideMap | null>(null)
  const [active, setActiveState] = React.useState(false)

  const refreshMe = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/me', { cache: 'no-store' })
      const body = (await res.json()) as { admin?: boolean; enabled?: boolean }
      setIsAdmin(!!body.admin)
      setEnabled(!!body.enabled)
      return !!body.admin
    } catch {
      return false
    }
  }, [])

  const refreshOverrides = React.useCallback(async () => {
    try {
      const res = await fetch('/api/i18n/overrides', { cache: 'no-store' })
      const body = (await res.json()) as { overrides?: OverrideMap }
      setOverrides(body.overrides ?? {})
    } catch {
      setOverrides({})
    }
  }, [])

  React.useEffect(() => {
    void refreshMe().then((admin) => {
      if (admin) {
        try {
          if (sessionStorage.getItem(EDIT_KEY) === '1') setActiveState(true)
        } catch {
          /* storage unavailable — edit mode simply stays off */
        }
      }
    })
    void refreshOverrides()
  }, [refreshMe, refreshOverrides])

  const setActive = React.useCallback((v: boolean) => {
    setActiveState(v)
    try {
      if (v) sessionStorage.setItem(EDIT_KEY, '1')
      else sessionStorage.removeItem(EDIT_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const login = React.useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (res.ok) {
          await refreshMe()
          setActive(true)
          return { ok: true, status: 200 }
        }
        return { ok: false, status: res.status }
      } catch {
        return { ok: false, status: 0 }
      }
    },
    [refreshMe, setActive],
  )

  const logout = React.useCallback(async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch {
      /* cookie will simply expire */
    }
    setIsAdmin(false)
    setActive(false)
  }, [setActive])

  const saveOverride = React.useCallback(async (locale: Lang, key: string, value: string) => {
    try {
      const res = await fetch('/api/admin/i18n', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, key, value }),
      })
      if (!res.ok) return false
      setOverrides((prev) => {
        const next: OverrideMap = { ...(prev ?? {}) }
        next[locale] = { ...(next[locale] ?? {}), [key]: value }
        return next
      })
      return true
    } catch {
      return false
    }
  }, [])

  const resetOverride = React.useCallback(async (locale: Lang, key: string) => {
    try {
      const res = await fetch(
        `/api/admin/i18n?locale=${encodeURIComponent(locale)}&key=${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) return false
      setOverrides((prev) => {
        const next: OverrideMap = { ...(prev ?? {}) }
        const m = { ...(next[locale] ?? {}) }
        delete m[key]
        next[locale] = m
        return next
      })
      return true
    } catch {
      return false
    }
  }, [])

  const value = React.useMemo<AdminContextValue>(
    () => ({ isAdmin, enabled, active, setActive, overrides, login, logout, saveOverride, resetOverride }),
    [isAdmin, enabled, active, setActive, overrides, login, logout, saveOverride, resetOverride],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

/** Same accessor — semantic alias used by consumers that tolerate absence. */
export function useAdminSafe() {
  return React.useContext(AdminContext)
}

export function useAdmin() {
  return React.useContext(AdminContext)
}
