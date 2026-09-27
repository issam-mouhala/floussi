'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard, ArrowLeftRight, ChartPie, MessageCircleHeart, PiggyBank, Target,
  Shapes, Bell, Settings, Plus, Sun, Moon, Languages, Wallet, CalendarDays, Sparkles, Gamepad2,
} from 'lucide-react'
import { useAppStore, type View } from '@/lib/store'
import { useApp } from './app-context'
import { useNotifications } from './api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { springSnappy, viewVariants } from '@/lib/motion'
import { DashboardView } from './dashboard'
import { DailyView } from './daily-view'

/* Heavy views load on demand (smaller first paint) and are warmed up during
 * idle time below — so a click never waits on the network. */
const AnalyticsView = dynamic(() => import('./analytics-view').then((m) => m.AnalyticsView))
const CoachView = dynamic(() => import('./coach-view').then((m) => m.CoachView))
const IntelView = dynamic(() => import('./intel-view').then((m) => m.IntelView))
const TransactionsView = dynamic(() => import('./transactions-view').then((m) => m.TransactionsView))
const BudgetsView = dynamic(() => import('./budgets-view').then((m) => m.BudgetsView))
const GoalsView = dynamic(() => import('./goals-view').then((m) => m.GoalsView))
const CategoriesView = dynamic(() => import('./categories-view').then((m) => m.CategoriesView))
const NotificationsView = dynamic(() => import('./notifications-view').then((m) => m.NotificationsView))
const SettingsView = dynamic(() => import('./settings-view').then((m) => m.SettingsView))
const GameView = dynamic(() => import('./game-view').then((m) => m.GameView))
const AddExpenseSheet = dynamic(() => import('./add-expense-sheet').then((m) => m.AddExpenseSheet))
import { LANGS } from '@/lib/i18n'
import { useSettings, useUpdateSettings } from './api'

const NAV: { view: View; icon: React.ElementType; key: Parameters<ReturnType<typeof useApp>['t']>[0] }[] = [
  { view: 'dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { view: 'analytics', icon: ChartPie, key: 'nav.analytics' },
  { view: 'daily', icon: CalendarDays, key: 'nav.daily' },
  { view: 'coach', icon: MessageCircleHeart, key: 'nav.coach' },
  { view: 'intel', icon: Sparkles, key: 'nav.intel' },
  { view: 'transactions', icon: ArrowLeftRight, key: 'nav.transactions' },
  { view: 'budgets', icon: PiggyBank, key: 'nav.budgets' },
  { view: 'goals', icon: Target, key: 'nav.goals' },
  { view: 'categories', icon: Shapes, key: 'nav.categories' },
  { view: 'notifications', icon: Bell, key: 'nav.notifications' },
  { view: 'game', icon: Gamepad2, key: 'nav.game' },
  { view: 'settings', icon: Settings, key: 'nav.settings' },
]

const NAV_MENU = NAV.slice(0, 6)
const NAV_MANAGE = NAV.slice(6)

const MOBILE_MAIN: View[] = ['dashboard', 'analytics', 'coach']

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useApp()
  return (
    <div className="flex items-center gap-2.5">
      <div className="size-9 rounded-2xl hero-gradient glow-primary flex items-center justify-center shrink-0">
        <Wallet className="size-4.5 text-white" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display font-bold text-[15.5px]">{t('app.name')}</div>
          <div className="text-[11px] text-muted-foreground">{t('app.tagline')}</div>
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useApp()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-xl size-9"
      aria-label={t('se.theme')}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  )
}

function LangQuick() {
  const { lang } = useApp()
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          disabled={update.isPending}
          onClick={() => update.mutate({ language: l.code })}
          className={cn(
            'rounded-lg px-2 py-1 text-xs font-semibold transition-all',
            l.code === lang ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={l.native}
        >
          {l.code === 'en' ? 'EN' : l.code === 'fr' ? 'FR' : 'دار'}
        </button>
      ))}
      {settings === undefined && <span className="sr-only">language</span>}
    </div>
  )
}

function BellButton() {
  const { t } = useApp()
  const setView = useAppStore((s) => s.setView)
  const { data } = useNotifications(useApp().lang)
  const unread = data?.unread ?? 0
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative rounded-xl size-9"
      aria-label={t('nav.notifications')}
      onClick={() => setView('notifications')}
    >
      <Bell className="size-4.5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -end-0.5 size-4 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Button>
  )
}

function NavButton({ item, active, onClick, showLabel = true }: {
  item: (typeof NAV)[number]
  active: boolean
  onClick: () => void
  showLabel?: boolean
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all w-full',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/[0.15] to-primary/[0.03] border border-primary/25 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12)]"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span
        className={cn(
          'relative size-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
          active ? 'bg-primary/15 text-primary' : 'bg-transparent group-hover:bg-accent',
        )}
      >
        <Icon className="size-4" />
      </span>
      {showLabel && <span className="relative">{item.key}</span>}
    </button>
  )
}

function Sidebar() {
  const { t } = useApp()
  const { view, setView, openAdd } = useAppStore()
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-e bg-sidebar/70 backdrop-blur-2xl h-screen sticky top-0 p-4 gap-1">
      <div className="px-2 pb-4 pt-1">
        <Brand />
      </div>
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar" aria-label="Main">
        <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{t('nav.groupMenu')}</div>
        {NAV_MENU.map((item) => (
          <NavButton
            key={item.view}
            item={{ ...item, key: t(item.key) } as typeof item}
            active={view === item.view}
            onClick={() => setView(item.view)}
          />
        ))}
        <div className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{t('nav.groupManage')}</div>
        {NAV_MANAGE.map((item) => (
          <NavButton
            key={item.view}
            item={{ ...item, key: t(item.key) } as typeof item}
            active={view === item.view}
            onClick={() => setView(item.view)}
          />
        ))}
      </nav>
      <Button
        onClick={openAdd}
        className="rounded-2xl h-11 mb-3 text-white border-0 hero-gradient glow-primary hover:opacity-95 font-semibold"
      >
        <Plus className="size-4.5" /> {t('nav.addExpense')}
      </Button>
      <div className="pt-3 border-t flex items-center justify-between gap-2">
        <LangQuick />
        <ThemeToggle />
      </div>
    </aside>
  )
}

function MobileMoreSheet({ trigger }: { trigger?: boolean }) {
  const { t } = useApp()
  const { moreOpen, setMoreOpen, view, setView } = useAppStore()
  const more = NAV.filter((n) => !MOBILE_MAIN.includes(n.view))
  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      {trigger && (
        <SheetTrigger asChild>
          <button
            className={cn(
              'flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
              moreOpen || !MOBILE_MAIN.includes(view) ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Shapes className="size-5.5" />
            <span>{t('nav.more')}</span>
          </button>
        </SheetTrigger>
      )}
      <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8">
        <SheetHeader className="p-0 pb-2">
          <SheetTitle className="text-start">{t('nav.more')}</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3">
          {more.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border p-4 text-xs font-medium transition-colors',
                  view === item.view ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="size-5" />
                {t(item.key)}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl border p-3">
          <LangQuick />
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MobileNav() {
  const { t } = useApp()
  const { view, setView, openAdd } = useAppStore()
  const main = NAV.filter((n) => MOBILE_MAIN.includes(n.view))
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/50 bg-background/80 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_34px_-18px_oklch(0.3_0.05_170/0.35)]"
      aria-label="Main"
    >
      <div className="grid grid-cols-5 items-end h-16 px-2">
        {main.slice(0, 2).map((item) => (
          <MobileNavItem key={item.view} item={item} active={view === item.view} onClick={() => setView(item.view)} label={t(item.key)} />
        ))}
        <div className="flex justify-center">
          <motion.button
            onClick={openAdd}
            aria-label={t('nav.addExpense')}
            whileTap={{ scale: 0.88, rotateX: 18 }}
            transition={springSnappy}
            className="size-13 -mt-6 rounded-2xl hero-gradient glow-primary flex items-center justify-center text-white shadow-lg"
            style={{ transformPerspective: 600 }}
          >
            <Plus className="size-6" />
          </motion.button>
        </div>
        {main.slice(2).map((item) => (
          <MobileNavItem key={item.view} item={item} active={view === item.view} onClick={() => setView(item.view)} label={t(item.key)} />
        ))}
        <MobileMoreSheet trigger />
      </div>
    </nav>
  )
}

function MobileNavItem({ item, active, onClick, label }: { item: (typeof NAV)[number]; active: boolean; onClick: () => void; label: string }) {
  const Icon = item.icon
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 py-2 text-[10px] font-medium">
      {/* morphing pill — one shared element glides between tabs */}
      {active && (
        <motion.span
          layoutId="mobile-nav-pill"
          className="absolute inset-x-2 top-1 bottom-1 rounded-2xl bg-primary/[0.12] border border-primary/20 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.1)]"
          transition={springSnappy}
        />
      )}
      <motion.span
        className="relative flex items-center justify-center px-3 py-0.5"
        animate={active ? { y: -1, scale: 1.06 } : { y: 0, scale: 1 }}
        transition={springSnappy}
      >
        <Icon className={cn('size-5.5', active ? 'text-primary' : 'text-muted-foreground')} />
      </motion.span>
      <span className={cn('relative', active ? 'text-primary font-semibold' : 'text-muted-foreground')}>{label}</span>
    </button>
  )
}

const VIEW_COMPONENTS: Record<View, React.ComponentType> = {
  dashboard: DashboardView,
  intel: IntelView,
  transactions: TransactionsView,
  analytics: AnalyticsView,
  daily: DailyView,
  coach: CoachView,
  budgets: BudgetsView,
  goals: GoalsView,
  categories: CategoriesView,
  notifications: NotificationsView,
  settings: SettingsView,
  game: GameView,
}

function TopBar() {
  const { t, name, lang, dir } = useApp()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const hour = mounted ? new Date().getHours() : 9
  const gKey = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening'
  const dateStr = mounted
    ? new Intl.DateTimeFormat(LANGS.find((l) => l.code === lang)?.locale ?? 'en-US', {
        weekday: 'long', day: 'numeric', month: 'long',
      }).format(new Date())
    : ''
  return (
    <header className="sticky top-0 z-30 bg-background/65 backdrop-blur-2xl border-b border-border/30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-lg sm:text-[1.35rem] font-bold truncate" dir={dir}>
            {mounted ? t(gKey, { name: name || t('common.you') }) : t('greeting.morning', { name: name || '' })}
          </h1>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-1 card-shadow">
          <div className="hidden sm:block lg:hidden">
            <LangQuick />
          </div>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
          <BellButton />
        </div>
      </div>
    </header>
  )
}

export function AppShell() {
  const { view } = useAppStore()
  const Current = VIEW_COMPONENTS[view]

  // warm up the lazy chunks while the browser is idle — first clicks stay instant
  React.useEffect(() => {
    const warm = () => {
      void import('./transactions-view')
      void import('./analytics-view')
      void import('./coach-view')
      void import('./intel-view')
      void import('./add-expense-sheet')
      void import('./game-view')
    }
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (ric) ric(warm, { timeout: 2500 })
    else setTimeout(warm, 1200)
  }, [])

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 pb-24 lg:pb-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              variants={viewVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              style={{ transformPerspective: 1200 }}
              className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-0 sm:pt-2"
            >
              <TopBar />
              <Current />
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileNav />
      </div>
      <AddExpenseSheet />
    </div>
  )
}
