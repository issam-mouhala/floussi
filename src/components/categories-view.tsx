'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2, Sparkles } from 'lucide-react'
import { useApp } from './app-context'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from './api'
import type { CategoryDTO } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CatIcon, ICON_NAMES } from './cat-icon'
import { suggestDarijaName } from '@/lib/darija'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const COLORS = ['#10b981', '#0d9488', '#f59e0b', '#84cc16', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#f43f5e', '#d946ef', '#8b5cf6', '#64748b']

export function CategoriesView() {
  const { t, lang } = useApp()
  const { data: cats, isLoading } = useCategories(lang)
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const del = useDeleteCategory()

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CategoryDTO | null>(null)
  const [nameEn, setNameEn] = React.useState('')
  const [nameFr, setNameFr] = React.useState('')
  const [nameAr, setNameAr] = React.useState('')
  const [nameAry, setNameAry] = React.useState('')
  const [icon, setIcon] = React.useState('Wallet')
  const [color, setColor] = React.useState(COLORS[0])
  const [essential, setEssential] = React.useState(false)

  // live smart suggestion: Darija name proposed as the user types En/Ar names
  const smartSuggestion = React.useMemo(() => {
    if (editing) return null // editing an existing cat: field is authoritative
    return suggestDarijaName(nameEn.trim(), nameAr.trim())
  }, [nameEn, nameAr, editing])

  const openCreate = () => {
    setEditing(null)
    setNameEn(''); setNameFr(''); setNameAr(''); setNameAry('')
    setIcon('Wallet'); setColor(COLORS[0]); setEssential(false)
    setOpen(true)
  }

  const openEdit = (c: CategoryDTO) => {
    setEditing(c)
    setNameEn(c.nameEn); setNameFr(c.nameFr); setNameAr(c.nameAr); setNameAry(c.nameAry ?? '')
    setIcon(c.icon); setColor(c.color); setEssential(c.essential)
    setOpen(true)
  }

  const submit = () => {
    if (!nameEn.trim()) {
      toast.error(t('cat.nameRequired'))
      return
    }
    const payload = { nameEn: nameEn.trim(), nameFr: nameFr.trim(), nameAr: nameAr.trim(), nameAry: nameAry.trim() || null, icon, color, essential }
    if (editing) {
      update.mutate(
        { id: editing.id, ...payload },
        { onSuccess: () => { toast.success(t('cat.updated')); setOpen(false) }, onError: (e) => toast.error(e.message) }
      )
    } else {
      create.mutate(
        payload,
        { onSuccess: () => { toast.success(t('cat.created')); setOpen(false) } }
      )
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('cat.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('cat.subtitle')}</p>
        </div>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus className="size-4" /> {t('cat.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cats?.map((c) => (
            <Card key={c.id} className="card-shadow group relative overflow-hidden">
              <CardContent className="p-4">
                <div
                  className="size-11 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${c.color}1a`, color: c.color }}
                >
                  <CatIcon name={c.icon} className="size-5" />
                </div>
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t('cat.txCount', { n: c.txCount ?? 0 })}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide',
                      c.essential ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {c.essential ? t('common.essential') : t('common.avoidable')}
                  </span>
                </div>
                {/* edit — always visible on touch devices, hover-reveal on desktop */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 start-2 size-7 rounded-lg text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-primary"
                  onClick={() => openEdit(c)}
                  aria-label={t('common.edit')}
                >
                  <Pencil className="size-3.5" />
                </Button>
                {(c.txCount ?? 0) === 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 end-2 size-7 rounded-lg text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-destructive"
                    onClick={() => del.mutate(c.id, { onSuccess: () => toast.success(t('cat.deleted')), onError: (e) => toast.error(e.message) })}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `${t('common.edit')} — ${editing.name}` : t('cat.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t('cat.nameEn')} *</Label>
                <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1.5 h-11 rounded-xl" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('cat.nameFr')}</Label>
                  <Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} className="mt-1.5 h-11 rounded-xl" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('cat.nameAr')}</Label>
                  <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="mt-1.5 h-11 rounded-xl" dir="rtl" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('cat.nameAry')}</Label>
                <Input value={nameAry} onChange={(e) => setNameAry(e.target.value)} placeholder={smartSuggestion ?? t('cat.nameAryAuto')} className="mt-1.5 h-11 rounded-xl" dir="rtl" />
                {smartSuggestion && smartSuggestion !== nameAry.trim() && (
                  <button
                    type="button"
                    onClick={() => setNameAry(smartSuggestion)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                  >
                    <Sparkles className="size-3" />
                    {t('cat.smartSuggest', { s: smartSuggestion })}
                  </button>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t('cat.nameAryHint')}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('cat.icon')}</Label>
              <div className="grid grid-cols-8 gap-1.5 mt-1.5 max-h-28 overflow-y-auto pe-1">
                {ICON_NAMES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setIcon(n)}
                    aria-label={n}
                    className={cn(
                      'size-9 rounded-xl flex items-center justify-center transition-all',
                      icon === n ? 'ring-2 ring-primary/60 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <CatIcon name={n} className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('cat.color')}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className={cn('size-8 rounded-xl transition-all', color === c && 'ring-2 ring-offset-2 ring-ring ring-offset-background')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3.5">
              <div>
                <div className="text-sm font-medium">{t('cat.essential')}</div>
                <div className="text-[11px] text-muted-foreground">{essential ? t('cat.essentialDesc') : t('cat.avoidableDesc')}</div>
              </div>
              <Switch checked={essential} onCheckedChange={setEssential} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button className="rounded-xl" onClick={submit} disabled={create.isPending || update.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
