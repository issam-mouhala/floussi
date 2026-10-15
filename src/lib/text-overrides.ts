import { mainDb } from '@/lib/db'
import type { Lang } from '@/lib/i18n'

/**
 * Server-side access to the admin text overrides (Task 31).
 *
 *  - ALWAYS reads mainDb: site copy is shared content, never demo data, so
 *    the demo ambient routing must not touch these tables.
 *  - Tiny in-memory cache (10s) keeps public rendering cheap on Vercel while
 *    admin edits stay near-instant; writes bust the cache in-process (other
 *    instances go stale for at most one TTL window — acceptable for copy).
 */
export type OverrideMap = Partial<Record<Lang, Record<string, string>>>

const CACHE_TTL_MS = 10_000
const cacheStore = globalThis as unknown as { __floussiOvCache?: { at: number; data: OverrideMap } }

export function bustOverrideCache(): void {
  cacheStore.__floussiOvCache = undefined
}

/** All overrides grouped per locale. Best-effort: if the table is missing
 *  (deploy before migration) we answer empty so the app keeps rendering the
 *  shipped dictionaries. */
export async function getAllOverrides(): Promise<OverrideMap> {
  const cached = cacheStore.__floussiOvCache
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data
  let data: OverrideMap = {}
  try {
    const rows = await mainDb.textOverride.findMany({
      select: { locale: true, key: true, value: true },
      orderBy: { updatedAt: 'desc' },
    })
    for (const r of rows) {
      if (r.locale !== 'en' && r.locale !== 'fr' && r.locale !== 'ary') continue
      const m = (data[r.locale] ??= {})
      m[r.key] = r.value
    }
  } catch {
    data = {}
  }
  cacheStore.__floussiOvCache = { at: Date.now(), data }
  return data
}
