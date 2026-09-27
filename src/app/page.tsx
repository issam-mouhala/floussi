'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { AppProvider } from '@/components/app-context'
import { AppShell } from '@/components/app-shell'
import { DataGuard } from '@/components/data-guard'

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
          <AppShell />
          <DataGuard />
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
