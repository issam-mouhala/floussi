'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { AppProvider } from '@/components/app-context'
import { AppShell } from '@/components/app-shell'
import { DataGuard } from '@/components/data-guard'
import { Landing } from '@/components/landing/landing'
import { AuthView } from '@/components/auth-view'
import { useAuthMe } from '@/components/api'
import { useAppStore } from '@/lib/store'

function Gate() {
  const entered = useAppStore((s) => s.entered)
  const showAuth = useAppStore((s) => s.showAuth)
  const { data: auth, isPending } = useAuthMe()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    // restore the session gate before first paint of real content
    try {
      if (sessionStorage.getItem('floussi-entered') === '1') useAppStore.setState({ entered: true })
    } catch {}
    setMounted(true)
  }, [])

  if (!mounted || isPending) {
    // minimal brand splash — avoids SSR/hydration mismatch on the gate
    return (
      <div className="min-h-dvh grid place-items-center" aria-hidden>
        <div className="size-11 rounded-2xl hero-gradient glow-primary animate-pulse" />
      </div>
    )
  }
  const signedIn = !!auth?.user
  if (signedIn) {
    return entered ? <AppShell /> : <Landing />
  }
  // signed out: the auth screen sits between the landing and the product
  return showAuth ? <AuthView /> : <Landing />
}

export default function Page() {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            // fresh data renders instantly from cache on view switches;
            // server TTL cache (lib/cache.ts) keeps responses cheap anyway
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppProvider>
          <Gate />
          <DataGuard />
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
