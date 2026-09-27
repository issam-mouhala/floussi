/**
 * Micro TTL cache for expensive read endpoints (Task 17 — speed layer).
 *
 * Why: Turso is a REMOTE database — every query pays a network round-trip,
 * so aggregation-heavy endpoints (overview ≈ 12+ queries) took 2–3.5s when
 * several views mounted at once. This cache sits in front of read-only
 * engines, dedupes concurrent identical requests and expires quickly.
 *
 * Guarantees:
 *  - Read-only layer: never mutates user data.
 *  - Every write route calls bustCache() (full clear) right after its DB
 *    mutation succeeds → a write is always reflected immediately.
 *  - Short TTLs (5–60s) keep stale risk negligible; a server restart
 *    resets everything (module state).
 *  - In-flight dedupe: N concurrent identical GETs → 1 computation.
 */

type Entry = { value: unknown; expires: number }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

const MAX_ENTRIES = 120

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T)

  const running = inflight.get(key)
  if (running) return running as Promise<T>

  const p = fn()
    .then((value) => {
      // simple FIFO eviction to keep memory bounded
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value
        if (oldest !== undefined) store.delete(oldest)
      }
      store.set(key, { value, expires: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, p)
  return p
}

/** Invalidate cached reads. No prefix = clear everything (used by writes). */
export function bustCache(prefix?: string) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

/** Wrap a mutation handler so a successful write always busts the cache. */
export function bustOnSuccess() {
  bustCache()
}
