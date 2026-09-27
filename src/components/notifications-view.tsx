'use client'

import * as React from 'react'
import { AlertTriangle, TrendingUp, Lightbulb, PartyPopper, Info, CheckCheck, Trash2 } from 'lucide-react'
import { useApp } from './app-context'
import { useNotifications, useMarkAllRead, useClearNotifications } from './api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const LEVEL_ICON: Record<string, React.ElementType> = {
  danger: AlertTriangle,
  warning: TrendingUp,
  success: PartyPopper,
  info: Lightbulb,
}

const LEVEL_STYLE: Record<string, string> = {
  danger: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  success: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  info: 'text-primary bg-primary/10 border-primary/20',
}

function timeAgo(iso: string, t: (k: 'no.now' | 'no.m' | 'no.h' | 'no.d', p?: Record<string, string | number>) => string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('no.now')
  if (m < 60) return t('no.m', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('no.h', { n: h })
  return t('no.d', { n: Math.floor(h / 24) })
}

export function NotificationsView() {
  const { t, lang } = useApp()
  const { data, isLoading } = useNotifications(lang)
  const markAll = useMarkAllRead()
  const clearAll = useClearNotifications()

  const list = data?.notifications ?? []
  const unread = data?.unread ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            {t('no.title')}
            {unread > 0 && (
              <span className="rounded-full bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5">{t('no.unread', { n: unread })}</span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{t('no.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => markAll.mutate()} disabled={markAll.isPending || unread === 0}>
            <CheckCheck className="size-4" /> {t('no.markAll')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-destructive hover:text-destructive"
            onClick={() => clearAll.mutate()}
            disabled={clearAll.isPending || list.length === 0}
          >
            <Trash2 className="size-4" /> {t('no.clear')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-dashed py-14 text-center">
          <p className="font-semibold">{t('no.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('no.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((n) => {
            const Icon = LEVEL_ICON[n.level] ?? Info
            return (
              <div
                key={n.id}
                className={cn('flex items-start gap-3.5 rounded-2xl border px-4 py-3.5 card-shadow bg-card', !n.read && 'border-s-4')}
                style={!n.read ? { borderInlineStartColor: n.level === 'danger' ? '#f43f5e' : n.level === 'success' ? '#10b981' : n.level === 'warning' ? '#f59e0b' : '#10b981' } : undefined}
              >
                <span className={cn('size-9 rounded-xl flex items-center justify-center shrink-0 border', LEVEL_STYLE[n.level])}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed" dir="auto">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.createdAt, t)}</p>
                </div>
                {!n.read && <span className="size-2 rounded-full bg-primary mt-2 shrink-0" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
