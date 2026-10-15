import type { Metadata } from 'next'
import { AdminPageClient } from '@/components/admin/admin-page-client'

export const metadata: Metadata = {
  title: 'Floussi — Admin',
  robots: { index: false, follow: false },
}

/** /admin — hidden sign-in for the site owner. Not linked anywhere in the UI. */
export default function AdminPage() {
  return <AdminPageClient />
}
