import en, { type Key, type Dict } from './en'
import fr from './fr'
import ary from './ary'

export type Lang = 'en' | 'fr' | 'ary'

export const LANGS: { code: Lang; label: string; native: string; flag: string; dir: 'ltr' | 'rtl'; locale: string }[] = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧', dir: 'ltr', locale: 'en-US' },
  { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷', dir: 'ltr', locale: 'fr-FR' },
  { code: 'ary', label: 'Darija', native: 'الدارجة', flag: '🇲🇦', dir: 'rtl', locale: 'ar-MA' },
]

const DICTS: Record<Lang, Dict> = { en, fr, ary }

export function dict(lang: Lang): Dict {
  return DICTS[lang] ?? en
}

/**
 * BiDi isolates (U+2068 FSI … U+2069 PDI) around interpolated values.
 * Keeps "26%", "+51", "1 850 درهم" glued as one directional island inside
 * Arabic (RTL) sentences — the % / sign / digits can never drift away from
 * the number, and Arabic-valued params (category names) keep their natural
 * RTL direction via first-strong detection. No-op visually in en/fr.
 */
const FSI = '\u2068'
const PDI = '\u2069'

/** Translate with {param} interpolation (bidi-safe). */
export function tr(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const d = DICTS[lang] ?? en
  let s = d[key] ?? en[key] ?? key
  if (params) {
    // Pass 1: capture an optional sign before and "%" right after the placeholder
    // so "+{pct}%" renders as the single island "+26%".
    s = s.replace(/([+\-]?)\{([a-zA-Z_]+)\}(%?)/g, (m, sign: string, k: string, pct: string) => {
      if (!(k in params)) return m
      return FSI + sign + String(params[k]) + pct + PDI
    })
    // Pass 2: any remaining placeholders (e.g. Arabic category names).
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, FSI + String(v) + PDI)
    }
  }
  return s
}

/** Inti.DateTimeFormat locale for a UI language (numbers & dates stay Latin in Morocco). */
export function intlLocale(lang: Lang): string {
  return LANGS.find((l) => l.code === lang)?.locale ?? 'en-US'
}

export type { Key, Dict }
