import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from './db'
import { buildBackup, getOwnerUserId, restoreBackupFile, type BackupFile } from './backup'

/**
 * Auto-protection engine: guarantees user data survives app updates, restarts
 * and destructive schema pushes.
 *
 *  - autoBackupIfHasData()  → writes db/backups/auto-latest.json (+ timestamped copy)
 *  - autoRestoreIfEmpty()   → if the live DB lost its data but a backup exists,
 *                             silently restores it (this is what makes data
 *                             survive updates / db push wipes / crashes)
 *  - deleteAutoBackups()    → called on intentional wipe so a deliberate
 *                             "start from zero" is NOT undone at next boot
 */

const AUTO_LATEST = 'auto-latest.json'
const KEEP_STAMPED = 8 // timestamped copies to keep (auto-<ts>.json)
const KEEP_DESTRUCTIVE = 4 // timestamped copies to keep (pre-seed-<ts>.json / pre-wipe-<ts>.json)

/** Directory that holds automatic backups — derived from DATABASE_URL. */
export function backupsDir(): string {
  const url = process.env.DATABASE_URL ?? ''
  const m = /^file:(.+)$/.exec(url)
  const dbPath = m ? m[1] : path.join(process.cwd(), 'db', 'custom.db')
  return path.join(path.dirname(dbPath), 'backups')
}

/** SECOND copy OUTSIDE the project folder — survives project-directory resets
 *  (sandbox restores, redeploys that replace the whole app folder). */
const SECONDARY_DIR = '/home/z/floussi-backups'

async function writeBothDirs(name: string, json: string): Promise<void> {
  for (const dir of [backupsDir(), SECONDARY_DIR]) {
    try {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, name), json, 'utf8')
    } catch {
      /* one location failing must not break the other */
    }
  }
}

async function readLatestBackup(): Promise<string | null> {
  for (const dir of [backupsDir(), SECONDARY_DIR]) {
    try {
      return await fs.readFile(path.join(dir, AUTO_LATEST), 'utf8')
    } catch {
      /* try next location */
    }
  }
  return null
}

async function isUserDataTableEmpty(): Promise<boolean> {
  const [tx, b, g] = await Promise.all([db.transaction.count(), db.budget.count(), db.savingGoal.count()])
  return tx === 0 && b === 0 && g === 0
}

/** Snapshot the DB if it holds user data. Never throws. */
export async function autoBackupIfHasData(): Promise<{ backed: boolean; transactions: number }> {
  try {
    if (await isUserDataTableEmpty()) return { backed: false, transactions: 0 }
    const snap = await buildBackup()
    const json = JSON.stringify(snap)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    await writeBothDirs(AUTO_LATEST, json)
    await writeBothDirs(`auto-${stamp}.json`, json)
    // prune old stamped copies in both locations
    for (const dir of [backupsDir(), SECONDARY_DIR]) {
      try {
        const files = (await fs.readdir(dir)).filter((f) => /^auto-\d{4}-.*\.json$/.test(f)).sort()
        for (const f of files.slice(0, Math.max(0, files.length - KEEP_STAMPED))) {
          await fs.rm(path.join(dir, f), { force: true })
        }
      } catch {
        /* ignore */
      }
    }
    return { backed: true, transactions: snap.transactions.length }
  } catch (e) {
    console.warn('[persistence] auto-backup skipped:', e instanceof Error ? e.message : e)
    return { backed: false, transactions: 0 }
  }
}

/**
 * Safety snapshot taken BEFORE an intentional destructive action (demo seed,
 * full wipe) replaces the live data. Written as `pre-seed-*` / `pre-wipe-*`
 * files that:
 *   - deleteAutoBackups() NEVER removes (its regex only matches auto-* and pre-push-* files)
 *   - autoRestoreIfEmpty() NEVER auto-restores (it only reads auto-latest.json)
 * so they stay a manual escape hatch: the user's real data can always be
 * re-imported after an accidental demo reset. Never throws.
 */
export async function snapshotBeforeDestructive(
  prefix: 'pre-seed' | 'pre-wipe',
): Promise<{ saved: boolean; transactions: number }> {
  try {
    if (await isUserDataTableEmpty()) return { saved: false, transactions: 0 }
    const snap = await buildBackup()
    if (snap.transactions.length + snap.budgets.length + snap.goals.length === 0) {
      return { saved: false, transactions: 0 }
    }
    const json = JSON.stringify(snap)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    await writeBothDirs(`${prefix}-latest.json`, json)
    await writeBothDirs(`${prefix}-${stamp}.json`, json)
    // prune old stamped copies in both locations
    const rx = new RegExp(`^${prefix}-\\d{4}-.*\\.json$`)
    for (const dir of [backupsDir(), SECONDARY_DIR]) {
      try {
        const files = (await fs.readdir(dir)).filter((f) => rx.test(f)).sort()
        for (const f of files.slice(0, Math.max(0, files.length - KEEP_DESTRUCTIVE))) {
          await fs.rm(path.join(dir, f), { force: true })
        }
      } catch {
        /* ignore */
      }
    }
    console.log(`[persistence] ${prefix} snapshot saved (${snap.transactions.length} transactions)`)
    return { saved: true, transactions: snap.transactions.length }
  } catch (e) {
    console.warn(`[persistence] ${prefix} snapshot skipped:`, e instanceof Error ? e.message : e)
    return { saved: false, transactions: 0 }
  }
}

// ---------------------------------------------------------------------------
// DEMO-DATA DEFENSE — final answer to "my data turned back into demo data".
//
// The demo generator (src/lib/seed.ts) writes transactions from a FIXED
// vocabulary of notes. A real user's data essentially never contains 5+ of
// these EXACT strings (deliberately excluded: plausible real notes like
// "Netflix", "InDrive", "Careem", "Petit taxi", "Cinéma Megarama",
// "Resto Annapurna", "Café wego", "Tram ticket" — all present in this
// user's real history). Matching is EXACT on the normalized note, so
// "Glovo pizza" (real) never matches "Glovo – Pizza e Pasta" (demo).
// ---------------------------------------------------------------------------

/** Number of DISTINCT demo signatures that must be present before we call
 *  a dataset "demo-seeded". High on purpose: false positives are unacceptable. */
const DEMO_SIG_THRESHOLD = 5

/** Demo goal titles created by runSeed(). */
const DEMO_GOAL_TITLES = ['emergency fund', 'new iphone', 'summer trip – agadir']

/** Exact (slug, amount) fingerprint of the 7 budgets runSeed() creates. */
const DEMO_BUDGET_FINGERPRINT: Array<[string, number]> = [
  ['coffee', 400],
  ['delivery', 800],
  ['restaurants', 700],
  ['groceries', 1600],
  ['transport', 500],
  ['entertainment', 350],
  ['shopping', 600],
]

/** Unambiguous demo-only notes (normalized). */
const DEMO_SIGNATURES = [
  // recurring set
  'loyer – appartement maarif',
  'facture lydec – électricité',
  'internet – orange adsl',
  'recharge téléphone – inwi',
  'spotify premium',
  // delivery pool
  'glovo – pizza e pasta',
  'glovo – kfc',
  'glovo – burger king',
  'glovo – sushi kadomi',
  'glovo – tacos king',
  'glovo – breakfast',
  'kaala food – shawarma',
  // restaurants pool
  'le cabestan',
  'la sqala',
  'korean house',
  'alex burger',
  'le rouget – family lunch',
  'pizzeria triangulaire',
  // coffee pool
  'café rita',
  'espresso – bureau',
  'café casablanca',
  'starbucks anfa',
  'café maure',
  // groceries pool
  'marjane californie',
  'carrefour market',
  'atacadao',
  'asswak assalam',
  'marché quartier',
  'bim & qmart',
  // shopping pool
  'zara morocco mall',
  'souk semmarine – babouche',
  'decathlon',
  'h&m',
  'sneakers',
  'cadeau anniversaire',
  // entertainment pool
  'bowling & games',
  'escape game',
  'karting',
  'concert – wallet',
  'foot entre amis',
  // transport pool
  'taxi – centre ville',
  'taxi retour maison',
  // snack / topup pools
  'croissant + juice',
  'biscuits',
  'chips & soda',
  'ice cream',
  'msemen & chebakia',
  'snack hanout',
  'tea + msemen',
  'fruits & légumes',
  'pain & lait',
  'hanout week-end',
  'épices & herbes',
  'oeufs & fromage',
  // health / other pools
  'pharmacie – vitamines',
  'pharmacie – crème solaire',
  'médecin – consultation',
  'frais de dossier',
  'coiffeur',
  'impression photos',
  'don association',
  'clé copiée',
].map((s) => normalizeNote(s))

function normalizeNote(s: string): string {
  return (s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** How many DISTINCT demo signatures a backup file contains (0 = clean). */
function backupDemoSignatureCount(snap: BackupFile): number {
  const sigs = new Set<string>()
  for (const t of snap.transactions ?? []) {
    const n = normalizeNote(t.note ?? '')
    if (n && DEMO_SIGNATURES.includes(n)) sigs.add(n)
  }
  return sigs.size
}

/** Inspect the LIVE database for demo contamination. Never throws. */
export async function detectDemoContamination(): Promise<{
  contaminated: boolean
  distinctSignatures: number
  demoTransactions: number
}> {
  try {
    const txs = await db.transaction.findMany({ select: { id: true, note: true } })
    const sigs = new Set<string>()
    const demoIds: string[] = []
    for (const t of txs) {
      const n = normalizeNote(t.note ?? '')
      if (n && DEMO_SIGNATURES.includes(n)) {
        sigs.add(n)
        demoIds.push(t.id)
      }
    }
    return {
      contaminated: sigs.size >= DEMO_SIG_THRESHOLD && demoIds.length >= 10,
      distinctSignatures: sigs.size,
      demoTransactions: demoIds.length,
    }
  } catch (e) {
    console.warn('[persistence] demo detection skipped:', e instanceof Error ? e.message : e)
    return { contaminated: false, distinctSignatures: 0, demoTransactions: 0 }
  }
}

/**
 * Boot-time self-healing: if the DB got demo-seeded (by whatever path), remove
 * ONLY the demo rows and keep everything real. Runs before autoRestoreIfEmpty,
 * so if the DB ends up empty after the purge, the clean auto-backup comes back.
 * Never throws.
 */
export async function purgeDemoData(): Promise<{
  purged: boolean
  transactions: number
  goals: number
  budgets: number
  distinctSignatures: number
}> {
  try {
    const txs = await db.transaction.findMany({ select: { id: true, note: true } })
    const sigs = new Set<string>()
    const demoIds: string[] = []
    for (const t of txs) {
      const n = normalizeNote(t.note ?? '')
      if (n && DEMO_SIGNATURES.includes(n)) {
        sigs.add(n)
        demoIds.push(t.id)
      }
    }
    if (sigs.size < DEMO_SIG_THRESHOLD || demoIds.length < 10) {
      return { purged: false, transactions: 0, goals: 0, budgets: 0, distinctSignatures: sigs.size }
    }

    // 1) demo transactions only — real rows are never touched
    let txDeleted = 0
    for (let i = 0; i < demoIds.length; i += 100) {
      const r = await db.transaction.deleteMany({
        where: { id: { in: demoIds.slice(i, i + 100) } },
      })
      txDeleted += r.count
    }

    // 2) demo goals (exact titles created by runSeed)
    const goals = await db.savingGoal.findMany({ select: { id: true, title: true } })
    const goalIds = goals
      .filter((g) => DEMO_GOAL_TITLES.includes(normalizeNote(g.title ?? '')))
      .map((g) => g.id)
    const goalsDeleted = goalIds.length
      ? (await db.savingGoal.deleteMany({ where: { id: { in: goalIds } } })).count
      : 0

    // 3) demo budgets — only when the live set EXACTLY matches the seed fingerprint
    const budgets = await db.budget.findMany({
      select: { id: true, amount: true, category: { select: { slug: true } } },
    })
    const pairs = budgets
      .map((b) => `${b.category?.slug ?? '?'}:${b.amount}`)
      .sort()
    const seedPairs = DEMO_BUDGET_FINGERPRINT.map(([s, a]) => `${s}:${a}`).sort()
    const budgetsDeleted =
      pairs.length === seedPairs.length && pairs.every((p, i) => p === seedPairs[i])
        ? (await db.budget.deleteMany()).count
        : 0

    console.warn(
      `[persistence] DEMO PURGE: removed ${txDeleted} demo transactions, ${goalsDeleted} goals, ${budgetsDeleted} budgets (${sigs.size} demo signatures matched)`,
    )
    return { purged: true, transactions: txDeleted, goals: goalsDeleted, budgets: budgetsDeleted, distinctSignatures: sigs.size }
  } catch (e) {
    console.warn('[persistence] demo purge skipped:', e instanceof Error ? e.message : e)
    return { purged: false, transactions: 0, goals: 0, budgets: 0, distinctSignatures: 0 }
  }
}

/** Restore candidates in priority order: auto-latest → auto-<ts> (newest first)
 *  → pre-seed-latest. Names are the union of both backup directories. */
async function listBackupCandidates(): Promise<string[]> {
  const names = new Set<string>()
  for (const dir of [backupsDir(), SECONDARY_DIR]) {
    try {
      for (const f of await fs.readdir(dir)) names.add(f)
    } catch {
      /* dir missing — ignore */
    }
  }
  const stamped = [...names].filter((f) => /^auto-\d{4}-.*\.json$/.test(f)).sort().reverse()
  const ordered = [AUTO_LATEST, ...stamped, 'pre-seed-latest.json']
  return ordered.filter((f) => names.has(f))
}

async function readBackupByName(name: string): Promise<string | null> {
  for (const dir of [backupsDir(), SECONDARY_DIR]) {
    try {
      return await fs.readFile(path.join(dir, name), 'utf8')
    } catch {
      /* try next location */
    }
  }
  return null
}


/** If the live DB lost its user data but a previous auto-backup has some, restore it.
 *  NEVER restores a demo-contaminated backup (that is exactly how "my data turned
 *  back into demo data" used to happen). Candidates are tried in order:
 *  auto-latest.json → auto-<timestamp>.json (newest first) → pre-seed-latest.json.
 *  Never throws. */
export async function autoRestoreIfEmpty(): Promise<{ restored: boolean; transactions: number }> {
  try {
    if (!(await isUserDataTableEmpty())) return { restored: false, transactions: -1 }
    // everything belongs to the installation owner (first user) when restored
    // server-side; session-driven restores go through /api/import instead
    const ownerId = await getOwnerUserId()
    if (!ownerId) return { restored: false, transactions: 0 }
    for (const name of await listBackupCandidates()) {
      const raw = await readBackupByName(name)
      if (!raw) continue
      let snap: BackupFile
      try {
        snap = JSON.parse(raw) as BackupFile
      } catch {
        continue
      }
      const hasData =
        (snap.transactions?.length ?? 0) + (snap.budgets?.length ?? 0) + (snap.goals?.length ?? 0) > 0
      if (!hasData) continue
      // GUARD: a backup full of demo signatures must never come back to life.
      const sigs = backupDemoSignatureCount(snap)
      if (sigs >= DEMO_SIG_THRESHOLD) {
        console.warn(
          `[persistence] restore SKIPPED ${name}: looks like demo data (${sigs} demo signatures)`,
        )
        continue
      }
      const r = await restoreBackupFile(snap, { ownerId })
      if (r) {
        console.log(
          `[persistence] AUTO-RESTORED ${r.transactions} transactions, ${r.budgets} budgets, ${r.goals} goals from ${name}`,
        )
        return { restored: true, transactions: r.transactions }
      }
    }
    return { restored: false, transactions: 0 }
  } catch (e) {
    console.warn('[persistence] auto-restore skipped:', e instanceof Error ? e.message : e)
    return { restored: false, transactions: 0 }
  }
}

/** Remove all automatic backups (used after an intentional wipe so the empty
 *  state is respected at next boot). Never throws. */
export async function deleteAutoBackups(): Promise<void> {
  for (const dir of [backupsDir(), SECONDARY_DIR]) {
    try {
      const files = await fs.readdir(dir).catch(() => [] as string[])
      for (const f of files) {
        if (f === AUTO_LATEST || /^auto-\d{4}-.*\.json$/.test(f) || /^pre-push-.*\.json$/.test(f)) {
          await fs.rm(path.join(dir, f), { force: true })
        }
      }
    } catch (e) {
      console.warn('[persistence] delete auto-backups skipped:', e instanceof Error ? e.message : e)
    }
  }
}

/** Status for the Settings card. Never throws. */
export async function readAutoBackupStatus(): Promise<{
  last: string | null
  transactions: number
  budgets: number
  goals: number
}> {
  const raw = await readLatestBackup()
  if (!raw) return { last: null, transactions: 0, budgets: 0, goals: 0 }
  try {
    const snap = JSON.parse(raw) as BackupFile
    return {
      last: snap.exportedAt ?? null,
      transactions: snap.transactions?.length ?? 0,
      budgets: snap.budgets?.length ?? 0,
      goals: snap.goals?.length ?? 0,
    }
  } catch {
    return { last: null, transactions: 0, budgets: 0, goals: 0 }
  }
}
