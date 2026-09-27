'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, BadgeDollarSign, Trash2, Database, Download, Upload, FileSpreadsheet, ShieldCheck } from 'lucide-react'
import { useApp } from './app-context'
import { useUpdateSettings, useWipe, useImportBackup, useBackupStatus, downloadBackup } from './api'
import { LANGS, type Lang } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function MoneyInput({ label, value, onSave }: { label: string; value?: number; onSave: (v: number) => void }) {
  const [val, setVal] = React.useState<string | null>(null)
  const shown = val ?? (value !== undefined ? String(Math.round(value)) : '')
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative mt-1.5">
        <Input
          value={shown}
          onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            const n = Number(shown)
            if (val !== null && n > 0 && n !== value) onSave(n)
            setVal(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="h-11 rounded-xl pe-12 font-num"
          inputMode="numeric"
        />
        <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">DH</span>
      </div>
    </div>
  )
}

export function SettingsView() {
  const { t, lang } = useApp()
  const { settings } = useApp()
  const { theme, setTheme } = useTheme()
  const update = useUpdateSettings()
  const wipe = useWipe()
  const importBackup = useImportBackup()
  const { data: backupStatus } = useBackupStatus()
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [name, setName] = React.useState<string | null>(null)

  const saveLang = (code: Lang) => update.mutate({ language: code }, { onSuccess: () => toast.success(t('se.savedToast')) })

  const themes = [
    { value: 'light', icon: Sun, label: t('se.light') },
    { value: 'dark', icon: Moon, label: t('se.dark') },
    { value: 'system', icon: Monitor, label: t('se.system') },
  ] as const

  return (
    <div className="space-y-4 sm:space-y-5 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{t('se.title')}</h2>
      </div>

      {/* profile */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('se.profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-muted-foreground">{t('se.name')}</Label>
          <div className="flex gap-2 mt-1.5 max-w-sm">
            <Input
              value={name ?? settings?.displayName ?? ''}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name !== null && name.trim() && name.trim() !== settings?.displayName) {
                  update.mutate({ displayName: name.trim() }, { onSuccess: () => toast.success(t('se.savedToast')) })
                }
                setName(null)
              }}
              className="h-11 rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      {/* language */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('se.language')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('se.langNote')}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => saveLang(l.code)}
              className={cn(
                'rounded-2xl border p-4 text-center transition-all hover:border-primary/40',
                lang === l.code ? 'border-primary bg-primary/8 ring-1 ring-primary/40' : ''
              )}
            >
              <div className="text-2xl mb-1">{l.flag}</div>
              <div className="text-sm font-semibold">{l.native}</div>
              <div className="text-[11px] text-muted-foreground">{l.label}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* appearance */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('se.appearance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="inline-flex rounded-2xl bg-muted p-1 gap-1">
            {themes.map((th) => (
              <button
                key={th.value}
                onClick={() => setTheme(th.value)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
                  theme === th.value ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <th.icon className="size-4" /> {th.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* budget & targets */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('se.budgets')}</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <MoneyInput label={t('se.monthly')} value={settings?.monthlyBudget} onSave={(v) => update.mutate({ monthlyBudget: v }, { onSuccess: () => toast.success(t('se.savedToast')) })} />
          <MoneyInput label={t('se.daily')} value={settings?.dailyBudget} onSave={(v) => update.mutate({ dailyBudget: v }, { onSuccess: () => toast.success(t('se.savedToast')) })} />
          <MoneyInput label={t('se.weekend')} value={settings?.weekendBudget} onSave={(v) => update.mutate({ weekendBudget: v }, { onSuccess: () => toast.success(t('se.savedToast')) })} />
          <MoneyInput label={t('se.savings')} value={settings?.savingsTarget} onSave={(v) => update.mutate({ savingsTarget: v }, { onSuccess: () => toast.success(t('se.savedToast')) })} />
        </CardContent>
      </Card>

      {/* currency */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BadgeDollarSign className="size-4 text-primary" /> {t('se.currency')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="size-12 rounded-2xl hero-gradient flex items-center justify-center text-white font-bold">DH</div>
          <div>
            <div className="font-semibold">Moroccan Dirham — MAD · DH · د.م.</div>
            <p className="text-xs text-muted-foreground mt-0.5">{t('se.currencyNote')}</p>
          </div>
        </CardContent>
      </Card>

      {/* data — sync, backup, danger zone */}
      <Card className="card-shadow border-destructive/25">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t('se.data')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* cloud storage info */}
          <div className="flex items-start gap-3 rounded-2xl border bg-muted/40 p-3 mb-4">
            <span className="size-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="size-4.5 text-primary" />
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('se.sync')}</p>
          </div>

          {/* auto-protection status */}
          <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3 mb-4">
            <span className="size-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="size-4.5 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">{t('se.autoTitle')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground mt-0.5">{t('se.autoDesc')}</p>
              {backupStatus?.last && (
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  {t('se.autoLast')}:{' '}
                  {new Date(backupStatus.last).toLocaleString(
                    lang === 'fr' ? 'fr-FR' : lang === 'ary' ? 'ar-MA' : 'en-US',
                    { dateStyle: 'medium', timeStyle: 'short' },
                  )}
                </p>
              )}
              {backupStatus?.mode && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  {t('se.storage')}:{' '}
                  <span className={backupStatus.mode === 'turso' ? 'text-primary font-semibold' : ''}>
                    {backupStatus.mode === 'turso' ? t('se.storageCloud') : t('se.storageLocal')}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* backup & restore */}
          <p className="text-sm font-medium mb-1">{t('se.backup')}</p>
          <p className="text-sm text-muted-foreground mb-3">{t('se.backupDesc')}</p>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button variant="outline" className="rounded-xl" onClick={() => downloadBackup('json')}>
              <Download className="size-4" />
              {t('se.exportJson')}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => downloadBackup('csv')}>
              <FileSpreadsheet className="size-4" />
              {t('se.exportCsv')}
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={importBackup.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className={cn('size-4', importBackup.isPending && 'animate-spin')} />
              {importBackup.isPending ? t('se.importing') : t('se.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                importBackup.mutate(f, {
                  onSuccess: (r) =>
                    toast.success(`${t('se.imported')} (${r.transactions})`),
                  onError: (err) =>
                    toast.error(err.message === 'bad-file' || err.message === 'Invalid backup file' ? t('se.importBad') : err.message),
                })
              }}
            />
          </div>

          {/* danger zone */}
          <p className="text-sm text-muted-foreground mb-3">{t('se.wipeDesc')}</p>
          <div className="flex flex-wrap gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="rounded-xl" disabled={wipe.isPending}>
                  <Trash2 className={cn('size-4', wipe.isPending && 'animate-spin')} />
                  {wipe.isPending ? t('se.wiping') : t('se.wipe')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('se.wipe')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('se.wipeDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      wipe.mutate(undefined, {
                        onSuccess: () => toast.success(t('se.wiped')),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    {t('se.wipe')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
