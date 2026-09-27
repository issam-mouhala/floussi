import { buildBackup } from '@/lib/backup'
import { bad } from '@/lib/api-helpers'
import { cached } from '@/lib/cache'

/** GET /api/export            → full JSON backup (settings, categories, transactions, budgets, goals)
 *  GET /api/export?format=csv → transactions CSV */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const format = url.searchParams.get('format')

    if (format === 'csv') {
      const { db } = await import('@/lib/db')
      const txs = await db.transaction.findMany({
        include: { category: true },
        orderBy: { date: 'desc' },
      })
      const esc = (v: string | number | null) => {
        const s = String(v ?? '')
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const rows = [
        'date,time,category,note,amount_dh,necessary,recurring,payment',
        ...txs.map((t) => {
          const d = new Date(t.date.getTime() + 3600000)
          return [
            d.toISOString().slice(0, 10),
            d.toISOString().slice(11, 16),
            esc(t.category.nameEn),
            esc(t.note ?? ''),
            t.amount,
            t.necessary ?? t.category.essential,
            t.isRecurring,
            t.paymentMethod,
          ].join(',')
        }),
      ]
      return new Response('\uFEFF' + rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="floussi-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // JSON backup is fetched repeatedly by the DataGuard mirror (focus/interval)
    // → short TTL keeps every snapshot fresh within 10s while killing the cost
    const backup = await cached('export:json', 10_000, () => buildBackup())
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="floussi-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (e) {
    console.error('export error', e)
    return bad('Export failed', 500)
  }
}
