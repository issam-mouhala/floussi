'use client'

import * as React from 'react'
import { useAuthMe, useSettings } from './api'
import { LANGS, tr, type Key, type Lang } from '@/lib/i18n'
import { GUEST_LANG_EVENT, getGuestLang } from '@/lib/guest-lang'

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

  const t = React.useCallback(
    (key: Key, params?: Record<string, string | number>) => tr(lang, key, params),
    [lang]
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

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  return React.useContext(AppContext)
}
