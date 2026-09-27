'use client'

import * as React from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useApp } from './app-context'
import { useBudgets, useSaveBudget, useDeleteBudget, useUpdateSettings, type BudgetRow } from './api'
import { formatMAD } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CatIcon } from './cat-icon'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ProgressRing } from './charts'

function StatusBadge({ status, pct, left }: { status: BudgetRow['status']; pct: number; left: number }) {
  const { t } = useApp()
  const map = {
    ok: { label: t('bu.statusOk'), cls: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
    warn: { label: t('bu.statusWarn'), cls: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
    over: { label: t('bu.statusOver'), cls: 'text-rose-600 bg-rose-500/10 dark:text-rose-400' },
  } as const
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', map[status].cls)}>
      {pct >= 100 ? t('bu.over', { amount: formatMAD(Math.abs(left), 'en') }) : map[status].label}
    </span>
  )
}

export function BudgetsView() {
  const { t, lang } = useApp()
  const { data, isLoading } = useBudgets(lang)
  const saveBudget = useSaveBudget()
  const delBudget = useDeleteBudget()
  const updateSettings = useUpdateSettings()

  const [overallOpen, setOverallOpen] = React.useState(false)
  const [overallVal, setOverallVal] = React.useState('')
  const [dlgOpen, setDlgOpen] = React.useState(false)
  const [editRow, setEditRow] = React.useState<BudgetRow | null>(null)
  const [dlgCat, setDlgCat] = React.useState('')
  const [dlgAmount, setDlgAmount] = React.useState('')

  const openDlg = (row?: BudgetRow) => {
    setEditRow(row ?? null)
    setDlgCat(row?.categoryId ?? '')
    setDlgAmount(row ? String(row.amount) : '')
    setDlgOpen(true)
  }

  const submitBudget = () => {
    const amount = Number(dlgAmount)
    if (!dlgCat || !amount || amount <= 0) return
    saveBudget.mutate(
      { categoryId: dlgCat, amount },
      { onSuccess: () => { toast.success(t('bu.savedToast')); setDlgOpen(false) } }
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-muted rounded-xl animate-pulse" />
        <div className="h-36 rounded-3xl bg-muted animate-pulse" />
        <div className="h-64 rounded-3xl bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('bu.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('bu.subtitle')}</p>
        </div>
        <Button onClick={() => openDlg()} className="rounded-xl">
          <Plus className="size-4" /> {t('bu.addBudget')}
        </Button>
      </div>

      {/* overall */}
      <Card className="card-shadow overflow-hidden">
        <CardContent className="p-5 sm:p-6 flex items-center gap-5 flex-wrap sm:flex-nowrap">
          <ProgressRing pct={data.overallPct} size={96} stroke={9} color={data.overallPct >= 100 ? '#f43f5e' : '#10b981'}>
            <span className="font-num font-bold text-sm">{data.overallPct}%</span>
          </ProgressRing>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{t('bu.overall')}</div>
                <div className="text-xs text-muted-foreground">{t('bu.overallDesc')}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => { setOverallVal(String(data.monthlyBudget)); setOverallOpen(true) }}
              >
                <Pencil className="size-3.5" /> {t('common.edit')}
              </Button>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
              <span className="font-num font-bold text-2xl">{formatMAD(data.monthSpent, lang)}</span>
              <span className="text-sm text-muted-foreground font-num">
                {t('common.of').toLowerCase()} {formatMAD(data.monthlyBudget, lang)}
              </span>
              <span className={cn('text-sm font-num font-semibold ms-auto', data.monthlyBudget - data.monthSpent < 0 ? 'text-rose-500' : 'text-emerald-500')}>
                {formatMAD(data.monthlyBudget - data.monthSpent, lang)} {t('common.left')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* category budgets */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('bu.categoryBudgets')}</h3>
        {data.budgets.length === 0 ? (
          <div className="rounded-3xl border border-dashed py-12 text-center">
            <p className="font-semibold">{t('bu.none')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('bu.noneDesc')}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.budgets.map((b) => (
              <Card key={b.id} className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${b.categoryColor}1a`, color: b.categoryColor }}
                    >
                      <CatIcon name={b.categoryIcon} className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{b.categoryName}</div>
                      <div className="text-[11px] text-muted-foreground font-num">
                        {formatMAD(b.spent, lang)} / {formatMAD(b.amount, lang)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openDlg(b)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg text-destructive"
                        onClick={() => delBudget.mutate(b.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <Progress value={Math.min(100, b.pct)} className="h-2 flex-1 me-3"
                        // indicator color by status
                      />
                      <StatusBadge status={b.status} pct={b.pct} left={b.remaining} />
                    </div>
                    <div className="text-[11px] text-muted-foreground font-num">
                      {b.remaining >= 0 ? `${t('bu.left', { amount: formatMAD(b.remaining, lang) })}` : ''} · {t('bu.used', { pct: b.pct })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* overall dialog */}
      <Dialog open={overallOpen} onOpenChange={setOverallOpen}>
        <DialogContent className="rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('bu.overall')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">{t('add.amountLabel')}</Label>
            <div className="relative mt-1.5">
              <Input value={overallVal} onChange={(e) => setOverallVal(e.target.value.replace(/[^\d]/g, ''))} className="h-12 rounded-xl pe-12 font-num text-lg" />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">DH</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOverallOpen(false)}>{t('common.cancel')}</Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                const v = Number(overallVal)
                if (v > 0) updateSettings.mutate({ monthlyBudget: v }, { onSuccess: () => { toast.success(t('se.savedToast')); setOverallOpen(false) } })
              }}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* add/edit budget dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editRow ? t('bu.editBudget') : t('bu.addBudget')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t('bu.selectCat')}</Label>
              <Select value={dlgCat || undefined} onValueChange={setDlgCat} disabled={!!editRow}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder={t('bu.selectCat')} />
                </SelectTrigger>
                <SelectContent>
                  {(editRow
                    ? [{ id: editRow.categoryId ?? '', name: editRow.categoryName ?? '', icon: editRow.categoryIcon, color: editRow.categoryColor }]
                    : data.availableCategories
                  ).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('add.amountLabel')}</Label>
              <div className="relative mt-1.5">
                <Input value={dlgAmount} onChange={(e) => setDlgAmount(e.target.value.replace(/[^\d]/g, ''))} className="h-12 rounded-xl pe-12 font-num text-lg" />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">DH</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDlgOpen(false)}>{t('common.cancel')}</Button>
            <Button className="rounded-xl" onClick={submitBudget} disabled={saveBudget.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
