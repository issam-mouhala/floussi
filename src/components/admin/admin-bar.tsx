'use client'

import * as React from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useApp } from '@/components/app-context'
import { useAdmin } from './admin-context'

/**
 * Floating admin bar (Task 31) — rendered only for a signed-in admin.
 * Toggle = inline edit mode ON/OFF (edit mode intercepts clicks on texts,
 * so it must be easy to switch off and just use the site normally).
 */
export function AdminBar() {
  const { isAdmin, active, setActive, logout } = useAdmin()
  const { t } = useApp()
  const [busy, setBusy] = React.useState(false)

  if (!isAdmin) return null

  return (
    <div
      data-fls-admin
      className="fixed bottom-3 right-3 z-[9998] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border bg-popover/95 py-1.5 pl-3 pr-1.5 text-popover-foreground shadow-xl backdrop-blur"
    >
      <ShieldCheck className="size-4 shrink-0 text-emerald-500" aria-hidden />
      <span className="shrink-0 text-[10px] font-bold tracking-widest text-muted-foreground">ADMIN</span>
      <Switch
        checked={active}
        onCheckedChange={(v) => setActive(v === true)}
        aria-label={t('admin.editTexts')}
        className="shrink-0"
      />
      <span className="hidden shrink-0 text-xs font-medium sm:inline">{t('admin.editTexts')}</span>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-full"
        disabled={busy}
        aria-label={t('admin.signOut')}
        onClick={() => {
          setBusy(true)
          void logout()
        }}
      >
        <LogOut className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}
