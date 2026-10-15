'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/components/app-context'
import { useAdmin } from './admin-context'

/** Admin sign-in card (Task 31). On success the admin bar appears on every
 *  page; enabling edit mode turns any translatable text into a click-to-edit. */
export function AdminLoginForm() {
  const { isAdmin, login } = useAdmin()
  const { t } = useApp()
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (isAdmin) router.replace('/')
  }, [isAdmin, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await login(email, password)
    setBusy(false)
    if (res.ok) return // useEffect redirect takes over
    setError(
      res.status === 401
        ? t('admin.wrongCreds')
        : res.status === 403
          ? t('admin.disabled')
          : res.status === 429
            ? t('auth.errRate')
            : res.status === 0
              ? t('auth.errBusy')
              : t('admin.saveFailed'),
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">{t('admin.loginTitle')}</h1>
            <p className="text-xs text-muted-foreground">{t('admin.loginSub')}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">{t('admin.email')}</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">{t('admin.password')}</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t('admin.signIn')}
        </Button>
      </form>
    </div>
  )
}
