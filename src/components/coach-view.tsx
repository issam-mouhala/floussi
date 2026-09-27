'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, RotateCcw } from 'lucide-react'
import { useApp } from './app-context'
import { useOverview } from './api'
import { formatMAD } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Key } from '@/lib/i18n'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTION_KEYS: Key[] = ['coach.s1', 'coach.s2', 'coach.s3', 'coach.s4', 'coach.s5']

export function CoachView() {
  const { t, lang, name } = useApp()
  const { data } = useOverview(lang)
  const o = data?.overview

  const [messages, setMessages] = React.useState<Msg[]>([])
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // seed greeting once (and re-seed when language changes)
  React.useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: t('coach.greeting', { name: name || '' }) }])
    }
  }, [lang])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12), lang }),
      })
      const body = (await res.json()) as { message?: string; error?: string }
      if (!res.ok || !body.message) throw new Error(body.error || t('coach.error'))
      setMessages([...next, { role: 'assistant', content: body.message }])
    } catch {
      setMessages([...next, { role: 'assistant', content: t('coach.error') }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-9.5rem)] min-h-[420px]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 pb-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="size-8 rounded-xl hero-gradient glow-primary flex items-center justify-center">
              <Sparkles className="size-4 text-white" />
            </span>
            {t('coach.title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('coach.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {o && (
            <span className="hidden sm:inline-flex rounded-full border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              {t('coach.contextTag', { tx: o.txTotal, month: formatMAD(o.monthTotal, lang) })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            onClick={() => setMessages([{ role: 'assistant', content: t('coach.greeting', { name: name || '' }) }])}
          >
            <RotateCcw className="size-3.5" /> {t('coach.clear')}
          </Button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-3xl border bg-card/60 card-shadow p-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-ee-md'
                    : 'bg-muted/70 border rounded-es-md'
                )}
                dir="auto"
              >
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-muted/70 border rounded-2xl rounded-es-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground me-1">{t('coach.typing')}</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* suggestions */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-3">
        {SUGGESTION_KEYS.map((k) => (
          <button
            key={k}
            disabled={sending}
            onClick={() => send(t(k))}
            className="shrink-0 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t(k)}
          </button>
        ))}
      </div>

      {/* input */}
      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={t('coach.placeholder')}
          rows={1}
          className="min-h-11 max-h-32 resize-none rounded-2xl bg-card"
          dir="auto"
        />
        <Button size="icon" onClick={() => send()} disabled={sending || !input.trim()} className="size-11 rounded-2xl shrink-0" aria-label="send">
          <Send className="size-4.5 rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  )
}
