'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useApp } from './app-context'
import { useAppStore } from '@/lib/store'
import { useCategories, useSaveTransaction } from './api'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CatIcon } from './cat-icon'
import { detectExpense } from '@/lib/detect'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Key } from '@/lib/i18n'

function todayLocalISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function AddExpenseSheet() {
  const { t, lang } = useApp()
  const { addOpen, closeAdd, editing } = useAppStore()
  const { data: cats } = useCategories(lang)
  const save = useSaveTransaction()

  const [amount, setAmount] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [date, setDate] = React.useState(todayLocalISO())
  const [necessary, setNecessary] = React.useState(false)
  const [recurring, setRecurring] = React.useState(false)
  const [method, setMethod] = React.useState('cash')
  // smart detection state
  const [manualCat, setManualCat] = React.useState(false) // user overrode the category
  const [iconOverride, setIconOverride] = React.useState<string | null>(null) // precise detected icon

  React.useEffect(() => {
    if (addOpen) {
      if (editing) {
        setAmount(String(editing.amount))
        setCategoryId(editing.categoryId)
        setNote(editing.note ?? '')
        setDate(editing.date.slice(0, 10))
        setNecessary(editing.necessary)
        setRecurring(editing.isRecurring)
        setMethod(editing.paymentMethod)
        setIconOverride(editing.icon ?? null)
        setManualCat(true) // never silently switch an existing transaction
      } else {
        setAmount('')
        setNote('')
        setDate(todayLocalISO())
        setRecurring(false)
        setMethod('cash')
        setIconOverride(null)
        setManualCat(false)
        // preselect: keep current selection if valid, else first category
        setCategoryId((prev) => (cats?.some((c) => c.id === prev) ? prev : cats?.[0]?.id ?? ''))
      }
    }
  }, [addOpen, editing, cats])

  // ---- smart detection (offline, instant, trilingual) ----------------------
  const detection = React.useMemo(
    () => (note.trim().length >= 2 && cats ? detectExpense(note, cats) : null),
    [note, cats]
  )
  const detectedCat = detection ? cats?.find((c) => c.id === detection.categoryId) : undefined

  // auto-apply the detected category + precise icon until the user overrides manually
  React.useEffect(() => {
    if (!addOpen || editing || manualCat || !detection) return
    setCategoryId(detection.categoryId)
    setIconOverride(detection.icon)
  }, [detection, manualCat, editing, addOpen])

  // detection gone (note cleared) → drop the icon override too
  React.useEffect(() => {
    if (!detection && !manualCat && !editing) setIconOverride(null)
  }, [detection, manualCat, editing])

  const selectedCat = cats?.find((c) => c.id === categoryId)

  React.useEffect(() => {
    if (selectedCat && !editing) setNecessary(selectedCat.essential)
  }, [selectedCat, editing])

  const submit = () => {
    const value = Number(amount.replace(',', '.'))
    if (!value || value <= 0 || Number.isNaN(value)) {
      toast.error(t('add.amountError'))
      return
    }
    if (!categoryId) return
    save.mutate(
      {
        id: editing?.id,
        amount: value,
        note: note.trim() || undefined,
        categoryId,
        date: new Date(date + 'T12:00:00').toISOString(),
        necessary,
        isRecurring: recurring,
        paymentMethod: method,
        icon: iconOverride ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(editing ? t('add.updatedToast') : t('add.savedToast'))
          closeAdd()
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <Sheet open={addOpen} onOpenChange={(v) => (!v ? closeAdd() : null)}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl px-5 pb-8 pt-4 max-h-[92dvh] overflow-y-auto sm:max-w-md sm:mx-auto sm:inset-x-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:h-auto sm:max-h-[90dvh]"
      >
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="text-start">{editing ? t('add.editTitle') : t('add.title')}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* amount */}
          <div>
            <Label htmlFor="tx-amount" className="text-xs text-muted-foreground">{t('add.amountLabel')}</Label>
            <div className="relative mt-1.5">
              <Input
                id="tx-amount"
                inputMode="decimal"
                autoFocus
                placeholder={t('add.amountPh')}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="h-16 text-3xl font-bold font-num rounded-2xl pe-14 bg-muted/50 border-border"
              />
              <span className="absolute end-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-lg">DH</span>
            </div>
          </div>

          {/* categories */}
          <div>
            <Label className="text-xs text-muted-foreground">{t('add.categoryLabel')}</Label>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {cats?.map((c) => {
                const isDetected = detection && !manualCat && detection.categoryId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategoryId(c.id)
                      setManualCat(true) // manual pick wins over detection
                      setIconOverride(null) // fall back to the category icon
                    }}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 rounded-2xl border py-2.5 px-1 transition-all',
                      categoryId === c.id
                        ? 'border-transparent ring-2 scale-[1.03]'
                        : 'border-border hover:bg-accent'
                    )}
                    style={categoryId === c.id ? { boxShadow: `0 0 0 2px ${c.color}`, background: `${c.color}14` } : undefined}
                  >
                    {isDetected && (
                      <span
                        className="absolute -top-1.5 -end-1.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                        title={t('add.smart')}
                      >
                        <Sparkles className="size-2.5" />
                      </span>
                    )}
                    <span
                      className="size-8 rounded-xl flex items-center justify-center"
                      style={{ background: `${c.color}1f`, color: c.color }}
                    >
                      <CatIcon name={c.icon} className="size-4" />
                    </span>
                    <span className="text-[9.5px] leading-tight text-center line-clamp-2 text-muted-foreground">{c.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* note + date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="tx-note" className="text-xs text-muted-foreground">{t('add.noteLabel')}</Label>
              <Input
                id="tx-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  setManualCat(false) // typing re-arms the smart detection
                }}
                placeholder={t('add.notePh')}
                className="mt-1.5 h-11 rounded-xl"
              />
              {/* smart detection chip */}
              <AnimatePresence>
                {detection && detectedCat && (
                  <motion.div
                    key={detection.categoryId + detection.icon}
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="mt-2 flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                    style={{
                      borderColor: `${detectedCat.color}55`,
                      background: `${detectedCat.color}12`,
                    }}
                  >
                    <span
                      className="size-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${detectedCat.color}22`, color: detectedCat.color }}
                    >
                      <CatIcon name={manualCat ? detectedCat.icon : detection.icon} className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: detectedCat.color }}>
                        <Sparkles className="inline size-3 -mt-0.5 me-1" />
                        {t('add.smart')}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {t('add.detected', { word: detection.matched, cat: detectedCat.name })}
                      </span>
                    </div>
                    {manualCat && detection && detection.categoryId !== categoryId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] rounded-lg shrink-0"
                        onClick={() => {
                          setCategoryId(detection.categoryId)
                          setIconOverride(detection.icon)
                          setManualCat(false)
                        }}
                      >
                        {t('add.useIt')}
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div>
              <Label htmlFor="tx-date" className="text-xs text-muted-foreground">{t('add.dateLabel')}</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('add.method')}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('add.cash')}</SelectItem>
                  <SelectItem value="card">{t('add.card')}</SelectItem>
                  <SelectItem value="transfer">{t('add.transfer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* switches */}
          <div className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t('add.essentialQ')}</div>
                <div className="text-[11px] text-muted-foreground">
                  {necessary ? t('add.essentialYes') : t('add.essentialNo')}
                </div>
              </div>
              <Switch checked={necessary} onCheckedChange={setNecessary} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{t('add.recurringQ')}</div>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={save.isPending || !categoryId}
            className="w-full h-12 rounded-2xl text-base font-semibold"
            size="lg"
          >
            {save.isPending ? t('common.loading') : editing ? t('common.save') : t('add.title')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
