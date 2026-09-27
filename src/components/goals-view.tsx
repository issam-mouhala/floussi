'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useApp } from './app-context'
import { useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal, type GoalDTO } from './api'
import { formatMAD } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CatIcon } from './cat-icon'
import { ProgressRing } from './charts'
import { toast } from 'sonner'

const EMOJIS = ['🎯', '🛟', '📱', '🏖️', '🚗', '🏠', '💻', '🎓', '💍', '🎁', '🕋', '🚲']

export function GoalsView() {
  const { t, lang } = useApp()
  const { data: goals, isLoading } = useGoals()
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const del = useDeleteGoal()

  const [addOpen, setAddOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [emoji, setEmoji] = React.useState('🎯')
  const [target, setTarget] = React.useState('')
  const [current, setCurrent] = React.useState('')
  const [deadline, setDeadline] = React.useState('')

  const [contribGoal, setContribGoal] = React.useState<GoalDTO | null>(null)
  const [contribAmount, setContribAmount] = React.useState('')

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-44 rounded-3xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('go.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('go.subtitle')}</p>
        </div>
        <Button className="rounded-xl" onClick={() => { setTitle(''); setEmoji('🎯'); setTarget(''); setCurrent(''); setDeadline(''); setAddOpen(true) }}>
          <Plus className="size-4" /> {t('go.add')}
        </Button>
      </div>

      {goals?.length === 0 ? (
        <div className="rounded-3xl border border-dashed py-14 text-center">
          <p className="font-semibold">{t('go.none')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('go.noneDesc')}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {goals?.map((g) => (
            <Card key={g.id} className="card-shadow">
              <CardContent className="p-5 flex items-center gap-4">
                <ProgressRing pct={g.pct} size={72} stroke={8} color={g.completed ? '#10b981' : '#0d9488'}>
                  <span className="text-xl" role="img" aria-label={g.title}>{g.emoji}</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{g.title}</span>
                    {g.completed && <span className="text-[10px] font-bold rounded-full bg-emerald-500/12 text-emerald-600 px-2 py-0.5">{t('go.completed')}</span>}
                  </div>
                  <div className="font-num text-sm text-muted-foreground mt-0.5">
                    {formatMAD(g.currentAmount, lang)} / {formatMAD(g.targetAmount, lang)} · {t('go.pctSaved', { pct: `${g.pct}%` })}
                  </div>
                  {g.deadline && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : 'ar-MA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(g.deadline))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2.5">
                    <Button size="sm" className="rounded-lg h-8 text-xs" onClick={() => { setContribGoal(g); setContribAmount('') }}>
                      <Plus className="size-3.5" /> {t('go.contribute')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => del.mutate(g.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('go.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t('go.name')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('go.namePh')} className="mt-1.5 h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Emoji</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`size-9 rounded-xl text-lg flex items-center justify-center transition-all ${emoji === e ? 'bg-primary/15 ring-2 ring-primary/50' : 'bg-muted hover:bg-accent'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t('go.target')}</Label>
                <Input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))} className="mt-1.5 h-11 rounded-xl font-num" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('go.current')}</Label>
                <Input value={current} onChange={(e) => setCurrent(e.target.value.replace(/[^\d]/g, ''))} className="mt-1.5 h-11 rounded-xl font-num" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('go.deadline')}</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                const targetV = Number(target)
                if (!title.trim() || !targetV || targetV <= 0) return
                create.mutate(
                  { title: title.trim(), emoji, targetAmount: targetV, currentAmount: Number(current) || 0, deadline: deadline || null },
                  { onSuccess: () => { toast.success(t('go.savedToast')); setAddOpen(false) } }
                )
              }}
              disabled={create.isPending}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* contribute dialog */}
      <Dialog open={contribGoal !== null} onOpenChange={(v) => !v && setContribGoal(null)}>
        <DialogContent className="rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('go.contributeTitle', { goal: contribGoal?.title ?? '' })}</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">{t('go.amountToAdd')}</Label>
            <div className="relative mt-1.5">
              <Input
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value.replace(/[^\d]/g, ''))}
                className="h-12 rounded-xl pe-12 font-num text-lg"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && contribGoal && Number(contribAmount) > 0) {
                    update.mutate({ id: contribGoal.id, addAmount: Number(contribAmount) }, { onSuccess: () => setContribGoal(null) })
                  }
                }}
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">DH</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[50, 100, 200, 500].map((v) => (
                <button key={v} onClick={() => setContribAmount(String(v))} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-num hover:bg-accent">
                  +{v}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setContribGoal(null)}>{t('common.cancel')}</Button>
            <Button
              className="rounded-xl"
              disabled={!contribGoal || !(Number(contribAmount) > 0) || update.isPending}
              onClick={() => {
                if (contribGoal && Number(contribAmount) > 0) {
                  update.mutate(
                    { id: contribGoal.id, addAmount: Number(contribAmount) },
                    { onSuccess: () => { toast.success(t('go.savedToast')); setContribGoal(null) } }
                  )
                }
              }}
            >
              {t('go.contribute')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
