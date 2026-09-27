/**
 * Intelligent similar-transaction detection (deterministic, on-device).
 *
 * Signals combined into a 0-100 score:
 *   - label similarity  (char-bigram Dice coefficient ∪ token Jaccard, on a
 *     normalized label: NFC, lowercase, diacritics/punctuation stripped) —
 *     robust to typos, extra words ("bimo" ↔ "bimo shop", "9ezbore" ↔
 *     "9ezbore et li9ama") and mixed latin/darija notes
 *   - amount proximity  (1 - |a-b|/max) — catches repeated purchases
 *   - same category bonus
 *
 * Relation kinds (priority order):
 *   duplicate — same normalized label AND ~same amount (⚠ possible double entry)
 *   recurring — same label repeating on a ~weekly/~monthly cadence (≥3 dots)
 *   merchant  — clearly same note/label, different context
 *   pattern   — same category + near-identical amount, label differs
 */

export interface SimilarInputTx {
  id: string
  amount: number
  note: string | null
  categoryId: string
  date: string // ISO
  necessary?: boolean | null
}

export interface SimilarHit {
  id: string
  amount: number
  note: string | null
  date: string
  categoryId: string
  score: number // 0-100
  kind: 'duplicate' | 'recurring' | 'merchant' | 'pattern'
  daysAgo: number // relative to the target transaction
}

export interface SimilarGroup {
  count: number
  total: number
  items: SimilarHit[]
  cadenceDays: number | null // detected repeat interval for `recurring`
}

const AR_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g // harakat + dagger alif + tatweel
const PUNCT = /[^\p{L}\p{N}\s]+/gu

export function normLabel(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(AR_DIACRITICS, '')
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  const t = s.replace(/\s/g, '')
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return (2 * inter) / (a.size + b.size)
}

function jaccardTokens(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean))
  const B = new Set(b.split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

export function noteSimilarity(a: string, b: string): number {
  const na = normLabel(a)
  const nb = normLabel(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  return Math.max(dice(bigrams(na), bigrams(nb)), jaccardTokens(na, nb))
}

function amountProximity(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b), 0.01)
  return Math.max(0, 1 - Math.abs(a - b) / max)
}

function dayDiff(isoA: string, isoB: string): number {
  return Math.round((Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime())) / 86_400_000)
}

/** Best repeating cadence (in days) among gaps, tolerating ±35% jitter. */
export function detectCadence(days: number[]): number | null {
  if (days.length < 2) return null
  const candidates = [7, 14, 30, 31]
  for (const c of candidates) {
    const ok = days.every((d) => Math.abs(d - c) <= Math.max(2, c * 0.35))
    if (ok) return c
  }
  return null
}

/**
 * Find transactions similar to `target` among `all` (which should include the
 * target itself — it is excluded from results).
 */
export function findSimilar(
  target: SimilarInputTx,
  all: SimilarInputTx[],
  opts?: { limit?: number },
): SimilarGroup {
  const limit = opts?.limit ?? 6
  const tNote = target.note ?? ''
  const tLabel = normLabel(tNote)

  type Scored = SimilarHit & { noteSim: number; amountSim: number; sameCat: boolean }
  const scored: Scored[] = []

  for (const tx of all) {
    if (tx.id === target.id) continue
    const noteSim = tNote && tx.note ? noteSimilarity(tNote, tx.note) : 0
    const amountSim = amountProximity(target.amount, tx.amount)
    const sameCat = tx.categoryId === target.categoryId
    const score = Math.round(noteSim * 70 + amountSim * 20 + (sameCat ? 10 : 0))

    // acceptance: clearly similar label, OR same category with near-identical amount
    const accepted =
      (noteSim >= 0.5 && score >= 50) ||
      (sameCat && amountSim >= 0.8 && (noteSim >= 0.25 || tLabel === ''))
    if (!accepted) continue

    const daysAgo = dayDiff(target.date, tx.date)
    const sameAmount = amountSim >= 0.95
    let kind: Scored['kind']
    if (tLabel !== '' && normLabel(tx.note ?? '') === tLabel && sameAmount) kind = 'duplicate'
    else if (noteSim >= 0.6) kind = 'merchant'
    else if (sameCat && amountSim >= 0.8) kind = 'pattern'
    else kind = 'merchant'

    scored.push({
      id: tx.id,
      amount: tx.amount,
      note: tx.note,
      date: tx.date,
      categoryId: tx.categoryId,
      score: Math.min(100, score),
      kind,
      daysAgo,
      noteSim,
      amountSim,
      sameCat,
    })
  }

  // recurring upgrade: same normalized label as target, cadence-like gaps
  let cadenceDays: number | null = null
  if (tLabel !== '') {
    const sameLabel = scored.filter((s) => normLabel(s.note ?? '') === tLabel)
    if (sameLabel.length >= 2) {
      const tMs = new Date(target.date).getTime()
      const gaps = sameLabel
        .map((s) => Math.round(Math.abs(tMs - new Date(s.date).getTime()) / 86_400_000))
        .sort((a, b) => a - b)
      cadenceDays = detectCadence(gaps)
      if (cadenceDays) {
        for (const s of sameLabel) {
          if (s.kind === 'merchant' || s.kind === 'duplicate') s.kind = 'recurring'
        }
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || b.daysAgo - a.daysAgo)

  // duplicates are always worth showing first regardless of the limit cut
  const dups = scored.filter((s) => s.kind === 'duplicate')
  const rest = scored.filter((s) => s.kind !== 'duplicate')
  const items = [...dups, ...rest].slice(0, limit).map(({ noteSim, amountSim, sameCat, ...hit }) => hit)

  return {
    count: scored.length,
    total: Math.round(scored.reduce((a, s) => a + s.amount, 0) * 100) / 100,
    items,
    cadenceDays,
  }
}
