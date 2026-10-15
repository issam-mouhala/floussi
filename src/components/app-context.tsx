'use client'

import * as React from 'react'
import { useAuthMe, useSettings } from './api'
import { LANGS, tr, type Key, type Lang } from '@/lib/i18n'
import { GUEST_LANG_EVENT, getGuestLang } from '@/lib/guest-lang'
import { useAdminSafe } from './admin/admin-context'
import { AdminBar } from './admin/admin-bar'
import { AdminTextEditor } from './admin/admin-text-editor'

interface AppContextValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  t: (key: Key, params?: Record<string, string | number>) => string
  name: string
  settings?: {
    displayName: string
    language: Lang
    theme: 'light' | 'dark' | 'system'
    monthlyBudget: number
    dailyBudget: number
    weekendBudget: number
    savingsTarget: number
    currency: string
  }
}

const AppContext = React.createContext<AppContextValue>({
  lang: 'en',
  dir: 'ltr',
  t: (key) => key,
  name: '',
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  // settings are per-account: only fetch them once a session exists.
  // Signed-out visitors keep their language in localStorage (guest lang).
  const { data: auth } = useAuthMe()
  const signedIn = !!auth?.user
  const { data: settings } = useSettings({ enabled: signedIn })
  const [guestLang, setGuestLangState] = React.useState<Lang | null>(null)
  // Task 31 — admin text overrides (site-copy corrections) shared app-wide
  const admin = useAdminSafe()
  React.useEffect(() => {
    setGuestLangState(getGuestLang())
    const onGuest = (e: Event) => {
      const l = (e as CustomEvent<Lang>).detail
      if (l === 'en' || l === 'fr' || l === 'ary') setGuestLangState(l)
    }
    window.addEventListener(GUEST_LANG_EVENT, onGuest)
    return () => window.removeEventListener(GUEST_LANG_EVENT, onGuest)
  }, [])
  const lang: Lang = (signedIn && settings?.language) || guestLang || 'en'
  const dir = React.useMemo(() => LANGS.find((l) => l.code === lang)?.dir ?? 'ltr', [lang])

  React.useEffect(() => {
    document.documentElement.lang = lang === 'ary' ? 'ar' : lang
    document.documentElement.dir = dir
  }, [lang, dir])

  // t() = shipped dictionary, with the admin's site-text corrections applied
  // on top (Task 31). An override wins whenever it exists and is non-empty.
  const t = React.useCallback(
    (key: Key, params?: Record<string, string | number>) => {
      const ov = admin.overrides?.[lang]?.[key]
      if (typeof ov === 'string' && ov.length > 0 && !params) return ov
      return tr(lang, key, params)
    },
    [lang, admin.overrides]
  )

  const value = React.useMemo<AppContextValue>(
    () => ({
      lang,
      dir,
      t,
      name: settings?.displayName ?? '',
      settings: settings
        ? {
            displayName: settings.displayName,
            language: settings.language,
            theme: settings.theme,
            monthlyBudget: settings.monthlyBudget,
            dailyBudget: settings.dailyBudget,
            weekendBudget: settings.weekendBudget,
            savingsTarget: settings.savingsTarget,
            currency: settings.currency,
          }
        : undefined,
    }),
    [lang, dir, t, settings]
  )

  return (
    <AppContext.Provider value={value}>
      {children}
      {/* Task 31 — site-owner inline text editor (inert unless admin + edit mode) */}
      <AdminTextEditor />
      <AdminBar />
    </AppContext.Provider>
  )
}

export function useApp() {
  return React.useContext(AppContext)
}
