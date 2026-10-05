'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from './app-context'
import { readMirror, refreshMirrorFromServer } from '@/lib/mirror'
import { useAuthMe } from './api'
import { toast } from 'sonner'

/**
 * DataGuard — runs silently in the background:
 *
 *  1. MIRROR  : whenever the app's data changes (any React Query cache update
 *               for overview/transactions/budgets/goals/settings/categories),
 *               a fresh /api/export snapshot is written to this device's
 *               localStorage a moment later. Phone + PC each keep a copy.
 *
 *  2. GUARD   : on load, on window focus and every 90s, if the SERVER is
 *               empty but this device holds a mirror with data, the mirror
 *               is automatically re-uploaded to /api/import. This is what
 *               brings the user's data back after a server-side wipe.
 *
 * ORDER MATTERS: on mount the guard check runs FIRST and mirror refreshes are
 * held until it finishes — otherwise an empty-server refetch would wipe the
 * mirror before it could be restored (real bug seen in testing).
 *
 * Intentional wipes stay respected: useWipe clears the device mirror, and the
 * server wipe purges the auto-backups — nothing is resurrected.
 */
export function DataGuard() {
  const { t } = useApp()
  const qc = useQueryClient()
  const { data: auth } = useAuthMe()
  const userId = auth?.user?.id ?? null
  const busy = React.useRef(false)
  const ready = React.useRef(false) // becomes true once the first guard check has decided

  const restoreIfServerEmpty = React.useCallback(async (): Promise<boolean> => {
    if (busy.current) return false
    if (!userId) return false // signed out — never touch the mirror
    try {
      const res = await fetch('/api/data-state', { cache: 'no-store' })
      if (!res.ok) return false
      const state = (await res.json()) as { transactions: number; budgets: number; goals: number }
      const serverEmpty = state.transactions === 0 && state.budgets === 0 && state.goals === 0
      if (!serverEmpty) return true // decided: server has data
      const mirror = readMirror()
      if (!mirror) return true // decided: nothing to restore
      // ACCOUNT GUARD: a mirror saved by ANOTHER account on this device must
      // never be pushed into this account (this exact guard is what makes
      // registration on a shared device safe).
      if (mirror.userId && mirror.userId !== userId) return true
      busy.current = true
      const up = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mirror),
      })
      if (up.ok) {
        await qc.invalidateQueries()
        toast.success(t('dg.restored'), { description: t('dg.restoredDesc'), duration: 6000 })
      }
      return true
    } catch {
      return false // undecided — do not let refreshes wipe the mirror
    } finally {
      busy.current = false
    }
  }, [qc, t, userId])

  // guard first on mount; only then unlock mirror refreshes
  React.useEffect(() => {
    if (!userId) return // signed out — the guard stays parked
    void restoreIfServerEmpty()
      .catch(() => false)
      .then((decided) => {
        ready.current = decided
        if (decided) void refreshMirrorFromServer(userId)
      })
  }, [userId])

  // mirror: any data cache update → debounced snapshot to localStorage
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    const DATA_PREFIXES = ['overview', 'transactions', 'budgets', 'goals', 'settings', 'categories', 'analytics']
    const unsub = qc.getQueryCache().subscribe((ev) => {
      const key = ev.query?.queryKey?.[0]
      if (typeof key !== 'string' || !DATA_PREFIXES.includes(key)) return
      if (ev.type !== 'updated' || ev.action?.type !== 'success') return
      if (!ready.current) {
        // first guard check hasn't decided yet (e.g. server was restarting) —
        // retry it soon; real data arriving means the server is back
        if (retry) clearTimeout(retry)
        retry = setTimeout(() => {
          void restoreIfServerEmpty().then((decided) => {
            ready.current = decided
            if (decided) void refreshMirrorFromServer(userId ?? undefined)
          })
        }, 2500)
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void refreshMirrorFromServer(userId ?? undefined)
      }, 1200)
    })
    return () => {
      if (timer) clearTimeout(timer)
      if (retry) clearTimeout(retry)
      unsub()
    }
  }, [qc, restoreIfServerEmpty])

  // guard: on focus + on interval
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!userId) return
      void restoreIfServerEmpty().then((decided) => {
        ready.current = decided
        if (decided) void refreshMirrorFromServer(userId)
      })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = setInterval(() => {
      if (!userId) return
      void restoreIfServerEmpty().then((decided) => {
        ready.current = decided
        if (decided) void refreshMirrorFromServer(userId)
      })
    }, 90_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      clearInterval(iv)
    }
  }, [restoreIfServerEmpty])

  return null
}
