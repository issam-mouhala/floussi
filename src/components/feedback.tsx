'use client'

import * as React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * QueryErrorState — professional recovery state for failed data loads.
 * Never shows raw technical errors; always offers a retry action.
 */
export function QueryErrorState({
  title,
  desc,
  retry,
  onRetry,
  className,
}: {
  title: string
  desc: string
  retry: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-3xl border border-amber-500/25 bg-amber-500/[0.06] px-6 py-10 text-center',
        className
      )}
    >
      <span className="size-11 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <AlertTriangle className="size-5" />
      </span>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{desc}</p>
      </div>
      <Button variant="outline" size="sm" className="rounded-xl mt-1" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> {retry}
      </Button>
    </div>
  )
}
