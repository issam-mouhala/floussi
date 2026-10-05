'use client'

import { create } from 'zustand'

export type View =
  | 'dashboard'
  | 'intel'
  | 'transactions'
  | 'analytics'
  | 'stats'
  | 'daily'
  | 'coach'
  | 'budgets'
  | 'goals'
  | 'categories'
  | 'notifications'
  | 'settings'
  | 'game'

export interface EditingTx {
  id: string
  amount: number
  note: string | null
  categoryId: string
  date: string
  necessary: boolean
  icon?: string | null
  isRecurring: boolean
  paymentMethod: string
}

interface AppState {
  view: View
  setView: (v: View) => void
  addOpen: boolean
  openAdd: () => void
  closeAdd: () => void
  editing: EditingTx | null
  setEditing: (tx: EditingTx | null) => void
  moreOpen: boolean
  setMoreOpen: (v: boolean) => void
  /** landing gate — false until the visitor enters the product */
  entered: boolean
  enterApp: () => void
  /** auth screen (login / signup) shown over the landing — Task 21 */
  showAuth: boolean
  setShowAuth: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  setView: (v) => set({ view: v, moreOpen: false }),
  addOpen: false,
  openAdd: () => set({ addOpen: true, editing: null }),
  closeAdd: () => set({ addOpen: false, editing: null }),
  editing: null,
  setEditing: (tx) => set({ editing: tx, addOpen: tx !== null }),
  moreOpen: false,
  setMoreOpen: (v) => set({ moreOpen: v }),
  entered: false,
  enterApp: () => {
    try {
      sessionStorage.setItem('floussi-entered', '1')
    } catch {}
    set({ entered: true, showAuth: false })
  },
  showAuth: false,
  setShowAuth: (v) => set({ showAuth: v }),
}))
