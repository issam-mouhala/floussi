import { bad } from '@/lib/api-helpers'

/**
 * Demo-data generator — PERMANENTLY DISABLED since the auth upgrade.
 *
 * This endpoint replaced live data with 412 generated transactions and was the
 * single most dangerous route in the app (the "my data turned into demo data"
 * incidents). The zero-demo-data rule is now absolute: real user data can only
 * leave the database through /api/reset (explicit, user-scoped, snapshotted)
 * and can always be re-imported from a backup file.
 */
export async function POST() {
  return bad('Demo seeding is disabled — your real data is protected.', 403)
}

export async function GET() {
  return bad('Demo seeding is disabled — your real data is protected.', 403)
}
