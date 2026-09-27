'use client'

import * as React from 'react'
import { CalendarDays, CreditCard, StickyNote, BarChart3, Pencil, Trash2, Repeat, TrendingUp, PieChart, Trophy, Sun, History, Loader2, Sparkles, Copy, RefreshCw, Tag, Shapes } from 'lucide-react'
import { useApp } from './app-context'
import { useAppStore } from '@/lib/store'
import { useDeleteTransaction, useTxStats, type TxStatsDTO, type SimilarHitDTO } from './api'
import { formatMAD } from '@/lib/money'
import { intlLocale, type Key } from '@/lib/i18n'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CatIcon } from './cat-icon'
import { cn } from '@/lib/utils'

function StatTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[10px] font-medium truncate">{label}</span>
      </div>
      <p className="text-base font-bold font-num mt-1 leading-none">{children}</p>
    </div>
  )
}

const SIMILAR_META: Record<SimilarHitDTO['kind'], { key: Key; icon: React.ElementType; cls: string }> = {
  duplicate: { key: 'txd.similarDup', icon: Copy, cls: 'bg-rose-500/12 text-rose-600 dark:text-rose-400' },
  recurring: { key: 'txd.similarRec', icon: RefreshCw, cls: 'bg-violet-500/12 text-violet-600 dark:text-violet-400' },
  merchant: { key: 'txd.similarMerch', icon: Tag, cls: 'bg-sky-500/12 text-sky-600 dark:text-sky-400' },
  pattern: { key: 'txd.similarPattern', icon: Shapes, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
}

function SimilarRow({ hit, cadenceDays }: { hit: SimilarHitDTO; cadenceDays: number | null }) {
  const { t, lang } = useApp()
  const meta = SIMILAR_META[hit.kind]
  const Icon = meta.icon
  const dayFmt = new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' })
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{hit.note || t('tx.noNote')}</p>
        <p className="text-[10px] text-muted-foreground font-num">{t('txd.similarDays', { d: hit.daysAgo })} · {dayFmt.format(new Date(hit.date))}</p>
      </div>
      <span className={cn('rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-wide shrink-0', meta.cls)}>
        {hit.kind === 'recurring' ? t(meta.key, { d: cadenceDays ?? 30 }) : t(meta.key)}
      </span>
      <span className="font-num text-xs font-semibold shrink-0">{formatMAD(hit.amount, lang)}</span>
    </div>
  )
}

export function TxDetailSheet({
  txId,
  onClose,
  onAskDelete,
}: {
  txId: string | null
  onClose: () => void
  onAskDelete: (id: string) => void
}) {
  const { t, lang } = useApp()
  const setEditing = useAppStore((s) => s.setEditing)
  const del = useDeleteTransaction()
  const { data, isLoading, isError } = useTxStats(txId)
  const payload = data as TxStatsDTO | undefined

  const catName = React.useCallback(
    (p: TxStatsDTO) =>
      lang === 'fr'
        ? p.tx.category.nameFr
        : lang === 'ary'
          ? (p.tx.category.nameAry?.trim() || p.tx.category.nameAr)
          : p.tx.category.nameEn,
    [lang],
  )

  const monthLabel = React.useMemo(() => {
    if (!payload?.stats.monthKey) return ''
    const [y, m] = payload.stats.monthKey.split('-').map(Number)
    return new Intl.DateTimeFormat(intlLocale(lang), { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 15)))
  }, [payload, lang])

  const dayLabel = React.useMemo(() => {
    if (!payload) return ''
    const d = new Date(new Date(payload.tx.date).getTime() + 3_600_000)
    return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d)
  }, [payload, lang])

  const payLabel = payload
    ? payload.tx.paymentMethod === 'card'
      ? t('add.card')
      : payload.tx.paymentMethod === 'transfer'
        ? t('add.transfer')
        : t('add.cash')
    : ''

  return (
    <Sheet open={txId !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[88vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        {isLoading || !payload ? (
          <div className="py-14 flex items-center justify-center gap-2 text-muted-foreground">
            {isError ? (
              <span className="text-sm">{t('txd.notFound')}</span>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </>
            )}
          </div>
        ) : (
          <>
            <SheetHeader className="text-start pb-0">
              <SheetTitle className="sr-only">{t('txd.title')}</SheetTitle>
            </SheetHeader>

            {/* hero */}
            <div className="flex items-center gap-3.5 px-1">
              <span
                className="size-13 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${payload.tx.category.color}1a`, color: payload.tx.category.color }}
              >
                <CatIcon name={payload.tx.icon ?? payload.tx.category.icon} className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold font-num leading-tight">{formatMAD(payload.tx.amount, lang)}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: payload.tx.category.color }}>
                  {catName(payload)}
                </p>
              </div>
              {payload.tx.isRecurring && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                  <Repeat className="size-3" /> {t('common.recurring')}
                </span>
              )}
            </div>

            {/* meta */}
            <div className="grid gap-2.5 rounded-2xl border bg-muted/40 p-3.5 mt-4 text-sm">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                <span className="capitalize">{dayLabel}</span>
                {payload.stats.isWeekend && (
                  <span className="rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-400 px-2 py-px text-[10px] font-bold uppercase">
                    {t('txd.weekend')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <CreditCard className="size-4 text-muted-foreground shrink-0" />
                <span>{payLabel}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
                    payload.tx.necessary
                      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                  )}
                >
                  {payload.tx.necessary ? t('common.essential') : t('common.avoidable')}
                </span>
              </div>
              {payload.tx.note && (
                <div className="flex items-start gap-2.5">
                  <StickyNote className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="min-w-0">{payload.tx.note}</span>
                </div>
              )}
            </div>

            {/* statistics — simplified at-a-glance tiles */}
            <p className="text-sm font-semibold mt-5 mb-1 flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> {t('txd.stats')}
            </p>
            <div className="rounded-2xl border bg-card p-3">
              <div className="grid grid-cols-2 gap-2">
                <StatTile icon={PieChart} label={t('txd.monthShare', { m: monthLabel })}>
                  <span dir="ltr" className="inline-block">{payload.stats.monthShare}%</span>
                </StatTile>
                {payload.stats.categoryRank ? (
                  <StatTile icon={Trophy} label={t('txd.rank', { c: catName(payload) })}>
                    <span dir="ltr" className="inline-block">#{payload.stats.categoryRank}</span>
                  </StatTile>
                ) : null}
                {payload.stats.multipleOfAvg ? (
                  <StatTile icon={TrendingUp} label={t('txd.vsAvg', { a: formatMAD(payload.stats.avgTx, lang) })}>
                    <span dir="ltr" className="inline-block">{payload.stats.multipleOfAvg}×</span>
                  </StatTile>
                ) : null}
                <StatTile icon={Sun} label={t('txd.day', { n: payload.stats.dayCount })}>
                  {formatMAD(payload.stats.dayTotal, lang)}
                </StatTile>
              </div>
              <div className="flex items-start gap-2 pt-2.5 mt-2.5 border-t">
                <History className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t('txd.allTime', {
                    a: formatMAD(payload.stats.allTimeTotal, lang),
                    c: catName(payload),
                    n: payload.stats.allTimeCount,
                  })}
                </p>
              </div>
            </div>

            {/* intelligent similar-transaction detection */}
            <p className="text-sm font-semibold mt-5 mb-1 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> {t('txd.similar')}
            </p>
            {payload.similar.count > 0 ? (
              <div className="rounded-2xl border p-3.5">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-xs text-muted-foreground">
                    {t('txd.similarSum', { n: payload.similar.count, a: formatMAD(payload.similar.total, lang) })}
                  </span>
                  {payload.similar.items[0] && (
                    <span className="font-num text-[10px] font-bold text-primary shrink-0">
                      {t('txd.similarScore', { s: payload.similar.items[0].score })}
                    </span>
                  )}
                </div>
                <div className="divide-y">
                  {payload.similar.items.map((hit) => (
                    <SimilarRow key={hit.id} hit={hit} cadenceDays={payload.similar.cadenceDays} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed px-3.5 py-4 text-xs text-muted-foreground">
                {t('txd.similarEmpty')}
              </p>
            )}

            {/* actions */}
            <div className="flex gap-2 mt-5 mb-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => {
                  const p = payload
                  onClose()
                  setEditing({
                    id: p.tx.id,
                    amount: p.tx.amount,
                    note: p.tx.note,
                    categoryId: p.tx.categoryId,
                    date: p.tx.date,
                    necessary: p.tx.necessary,
                    isRecurring: p.tx.isRecurring,
                    paymentMethod: p.tx.paymentMethod,
                  })
                }}
              >
                <Pencil className="size-4" /> {t('common.edit')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={() => {
                  const id = payload.tx.id
                  onClose()
                  onAskDelete(id)
                }}
              >
                <Trash2 className="size-4" /> {t('common.delete')}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
