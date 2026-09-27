// Moroccan Dirham (MAD / DH / د.م.) formatting.
// Morocco reads numbers with Latin digits; grouping differs by UI language.

export type FormatStyle = 'standard' | 'compact'

function grouped(n: number, lang: string, decimals: number): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR' // fr grouping (1 850) for French & Darija
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/** "1,850 DH" / "1 850 درهم" — the default money format across the app (Darija UI writes درهم). */
export function formatMAD(amount: number, lang = 'en', decimals?: boolean): string {
  const abs = Math.abs(amount)
  const showDecimals = decimals ?? (abs > 0 && abs < 10 && !Number.isInteger(amount))
  const d = showDecimals ? 2 : 0
  // LRM keeps the minus sign glued to the number in RTL (Darija) layouts
  const sign = amount < 0 ? '\u200E-' : ''
  const cur = lang === 'ary' ? 'درهم' : 'DH'
  return `${sign}${grouped(abs, lang, d)} ${cur}`
}

/** Compact for chart axes: "12.5K", "1.2M" (currency suffix optional, Darija writes درهم). */
export function formatCompact(amount: number, withCurrency = false, lang = 'en'): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  let out: string
  if (abs >= 1_000_000) out = `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  else if (abs >= 1000) out = `${sign}${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  else if (abs >= 1 || abs === 0) out = `${sign}${Math.round(abs)}`
  else out = `${sign}${abs.toFixed(2)}`
  return withCurrency ? `${out} ${lang === 'ary' ? 'درهم' : 'DH'}` : out
}

/** Signed percentage like "+12%" / "-8%". */
export function formatPct(pct: number, withSign = true): string {
  const sign = withSign && pct > 0 ? '+' : ''
  return `${sign}${Math.round(pct)}%`
}

export function formatNumber(n: number, lang = 'en'): string {
  return grouped(n, lang, 0)
}
