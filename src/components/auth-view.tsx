'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Sparkles, User, Wallet } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { LANGS, tr, type Key, type Lang } from '@/lib/i18n'
import { getGuestLang, setGuestLang } from '@/lib/guest-lang'
import { useLogin, useRegister } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * AuthView (Task 21) — login + signup, shown between the landing page and the
 * product for signed-out visitors. Own language switcher (persisted locally)
 * because per-account settings are only reachable once signed in. Fully
 * RTL-native: the whole panel mirrors via the `dir` attribute + logical CSS.
 */

type Mode = 'login' | 'signup'

const ERR_KEY_BY_MSG: Array<[RegExp, Key]> = [
  [/wrong email or password/i, 'auth.errCreds'],
  [/already exists/i, 'auth.errExists'],
  [/at least 6 characters/i, 'auth.errWeak'],
  [/valid email/i, 'auth.errEmail'],
  [/your name/i, 'auth.errName'],
]

export function AuthView() {
  const enterApp = useAppStore((s) => s.enterApp)
  const setShowAuth = useAppStore((s) => s.setShowAuth)

  const [lang, setLang] = React.useState<Lang>('en')
  React.useEffect(() => {
    const saved = getGuestLang()
    if (saved) setLang(saved)
  }, [])
  const switchLang = (l: Lang) => {
    setLang(l)
    setGuestLang(l)
  }
  const dir = LANGS.find((l) => l.code === lang)?.dir ?? 'ltr'
  const t = React.useCallback((key: Key) => tr(lang, key), [lang])

  const [mode, setMode] = React.useState<Mode>('login')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPw, setShowPw] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const login = useLogin()
  const register = useRegister()
  const pending = login.isPending || register.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'login') {
        await login.mutateAsync({ email, password })
      } else {
        await register.mutateAsync({ name, email, password })
      }
      enterApp() // session cookie is set — walk straight into the product
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const hit = ERR_KEY_BY_MSG.find(([rx]) => rx.test(msg))
      setError(hit ? t(hit[1]) : t('auth.errGeneric'))
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft
  const GoIcon = dir === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div dir={dir} className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* ── brand panel (desktop only) ─────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden hero-gradient">
        <div className="relative z-10 text-white">
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
            <div className="font-display font-bold text-lg">Floussi</div>
          </div>
          <h1 className="font-display font-bold text-4xl leading-tight mt-16 max-w-md">
            {lang === 'fr'
              ? 'Votre argent, enfin limpide.'
              : lang === 'ary'
                ? 'الفلوس ديالك، واضحين فالأخير.'
                : 'Your money, finally clear.'}
          </h1>
          <p className="mt-4 max-w-sm text-white/80 text-[15px] leading-relaxed">
            {lang === 'fr'
              ? "Floussi IQ analyse chaque dépense, l'IA vous conseille, et vos statistiques annuelles se construisent toutes seules."
              : lang === 'ary'
                ? 'فلوسي كيحلل كل مصروف، الذكاء الاصطناعي كينصحك، و الإحصائيات ديالك كيتبناو بوحدهم.'
                : 'Floussi IQ analyzes every expense, the AI coach advises you, and your yearly statistics build themselves.'}
          </p>
          <ul className="mt-10 space-y-4 text-sm">
            {(
              [
                ['sparkles', lang === 'fr' ? 'Floussi IQ — votre score financier personnel' : lang === 'ary' ? 'فلوسي IQ — النقطة ديال الذكاء المالي ديالك' : 'Floussi IQ — your personal financial score'],
                ['shield', lang === 'fr' ? 'Vos données restent les vôtres — jamais de démo' : lang === 'ary' ? 'المعطيات ديالك كتبقى ديالك — حتى شي ديمو' : 'Your data stays yours — never demo'],
                ['globe', lang === 'fr' ? 'Français · English · الدارجة' : lang === 'ary' ? 'Français · English · الدارجة' : 'English · Français · الدارجة'],
              ] as const
            ).map(([icon, line], i) => (
              <li key={i} className="flex items-center gap-3 text-white/90">
                <span className="size-8 rounded-xl bg-white/12 flex items-center justify-center shrink-0">
                  {icon === 'sparkles' ? <Sparkles className="size-4" /> : icon === 'shield' ? <Lock className="size-4" /> : <Wallet className="size-4" />}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        {/* subtle depth — static, no animation noise */}
        <div aria-hidden className="absolute -bottom-32 -end-24 size-96 rounded-full bg-white/8 blur-3xl" />
        <div aria-hidden className="absolute -top-24 -start-16 size-72 rounded-full bg-white/6 blur-3xl" />
      </div>

      {/* ── form panel ─────────────────────────────────────────────── */}
      <div className="relative flex flex-col min-h-dvh lg:min-h-0">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <button
            onClick={() => setShowAuth(false)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BackIcon className="size-4" />
            {t('auth.back')}
          </button>
          <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => switchLang(l.code)}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-semibold transition-all',
                  l.code === lang ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={l.native}
              >
                {l.code === 'en' ? 'EN' : l.code === 'fr' ? 'FR' : 'دار'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 grid place-items-center px-4 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="w-full max-w-md"
          >
            <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
              <div className="size-11 rounded-2xl hero-gradient glow-primary flex items-center justify-center">
                <Wallet className="size-5 text-white" />
              </div>
              <div className="font-display font-bold text-xl">Floussi</div>
            </div>

            {/* tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 mb-7" role="tablist">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'rounded-xl h-10 text-sm font-semibold transition-all',
                    mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'login' ? t('auth.tabLogin') : t('auth.tabSignup')}
                </button>
              ))}
            </div>

            <h2 className="font-display text-2xl font-bold tracking-tight">
              {mode === 'login' ? t('auth.welcome') : t('auth.welcomeNew')}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === 'login' ? t('auth.subtitle') : t('auth.subtitleNew')}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label htmlFor="auth-name" className="text-[13px] font-medium text-foreground/90">
                    {t('auth.name')}
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="auth-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('auth.namePh')}
                      autoComplete="name"
                      className="ps-10"
                      maxLength={40}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="auth-email" className="text-[13px] font-medium text-foreground/90">
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="auth-email"
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPh')}
                    autoComplete="email"
                    className="ps-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="auth-password" className="text-[13px] font-medium text-foreground/90">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="auth-password"
                    type={showPw ? 'text' : 'password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="ps-10 pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-[13px] font-medium text-destructive bg-destructive/10 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={pending} className="w-full h-11 rounded-xl text-[15px] font-semibold hero-gradient glow-primary text-white border-0">
                {pending ? (
                  <Loader2 className="size-4.5 animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? t('auth.loginBtn') : t('auth.signupBtn')}
                    <GoIcon className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
              <button
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="font-semibold text-primary hover:underline underline-offset-4"
              >
                {mode === 'login' ? t('auth.tabSignup') : t('auth.tabLogin')}
              </button>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
