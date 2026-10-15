'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { AppProvider } from '@/components/app-context'
import { AdminLoginForm } from './admin-login-form'

/** Client shell for /admin — same provider stack as the main page
 *  (AppProvider mounts the admin bar + inline editor on top of it). */
export function AdminPageClient() {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppProvider>
          <AdminLoginForm />
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
