/**
 * Smart Darija naming engine — turns Arabizi / French / English category
 * names into native Moroccan Darija written in Arabic script.
 *
 *   "7anote"  → حوانيت      "dejaje" / "poulet" → دجاج
 *   "khobze"  → خبزة        "dessert"           → حلويات
 *   "taxi"    → طاكسي       "siklisse"          → سيكلسة
 *
 * Design: 100% offline + deterministic (same philosophy as detect.ts):
 *   1. normalize input (Arabizi digits → latin, strip diacritics)
 *   2. single-word exact/near hit in the dictionary
 *   3. multi-word: translate only when EVERY word hits the dictionary
 *   4. otherwise null → caller keeps the original name (never invents)
 */

/** Arabizi digits → latin letters (7=ح 3=ع 9=ق 5=خ 8=هـ 2=أ 1=ي) */
export function deArabizi(s: string): string {
  return s
    .replace(/7/g, 'h')
    .replace(/3/g, 'a')
    .replace(/9/g, 'q')
    .replace(/5/g, 'kh')
    .replace(/8/g, 'h')
    .replace(/2/g, 'a')
    .replace(/1/g, 'i')
}

const HAS_ARABIC = /[\u0600-\u06FF]/
const AR_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g

/** true when the string contains no Arabic-script character at all */
export function looksLatin(s: string): boolean {
  return !HAS_ARABIC.test(s)
}

/** normalize a latin/arabizi word for dictionary lookup */
function normLatinWord(w: string): string {
  let t = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  t = deArabizi(t).replace(/[^a-z]/g, '')
  if (t.length >= 5 && t.endsWith('s')) t = t.slice(0, -1) // plural strip
  if (t.length >= 5 && t.endsWith('e')) t = t.slice(0, -1) // khobze→khobz, dejenne…
  return t
}

/** normalize an Arabic word for dictionary lookup (same canon as detect.ts) */
function normArabicWord(w: string): string {
  return w
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/گ/g, 'ك')
    .replace(/ڭ/g, 'ك')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Darija dictionary — category-grade words people actually type.
 * key canon: normLatinWord (latin side) — arabic keys normalized too.
 */
const DICT: Record<string, string> = {}
function addKey(latinish: string, darija: string) {
  const k = /[\u0600-\u06FF]/.test(latinish) ? normArabicWord(latinish) : normLatinWord(latinish)
  if (k && !(k in DICT)) DICT[k] = darija
}

// food & groceries
for (const w of ['khobz', 'khobza', 'khubz', 'khobze', 'pain']) addKey(w, 'خبزة')
for (const w of ['khobzat', 'khobzate', 'khobzat', 'pains']) addKey(w, 'خبزات')
for (const w of ['djaj', 'djej', 'dejaje', 'dejja', 'deja', 'djaje', 'poulet', 'chicken']) addKey(w, 'دجاج')
for (const w of ['lham', 'lehm', 'la7am', 'viande', 'meat', 'kefta']) addKey(w, 'لحم')
for (const w of ['hout', '7out', 'samak', 'poisson', 'fish', 'sardine', 'sardina']) addKey(w, 'حوت')
for (const w of ['hlib', '7lib', 'lait', 'milk', 'lben', 'raib']) addKey(w, 'حليب')
for (const w of ['byed', 'baid', 'oeuf', 'egg', 'eggs']) addKey(w, 'بيض')
for (const w of ['jben', 'fromage', 'formage', 'formaj', 'cheese', 'beurre']) addKey(w, 'فرماج')
for (const w of ['riz', 'rouz', 'rice']) addKey(w, 'روز')
for (const w of ['makrona', 'maqrona', 'pates', 'pasta']) addKey(w, 'مقرونة')
for (const w of ['tomate', 'tmatem', 'maticha', 'batata']) addKey(w, 'خضرة')
for (const w of ['limon', 'limoun', 'citron', 'lemon']) addKey(w, 'ليمون')
for (const w of ['sokar', 'sucre', 'sugar', 'zit', 'huile']) addKey(w, 'مواد غذائية')
for (const w of ['fawakih', 'fakia', 'fruit', 'fruits']) addKey(w, 'فواكه')
for (const w of ['dessert', 'desert', 'gateau', 'gateaux', 'halwa', 'helwa', 'helwa', 'sweets', 'cake', 'patisserie', 'mhencha', 'chebakia']) addKey(w, 'حلويات')
for (const w of ['glace', 'icecream', 'ice cream', 'eskimo']) addKey(w, 'ايس كريم')
for (const w of ['bocadillo', 'sandwich', 'sanwiych', 'tacos', 'takos', 'burger', 'shawarma', 'chawarma']) addKey(w, 'سانطويش')
for (const w of ['msemen', 'rghaif', 'sfenj', 'harcha', 'beghrir', 'batbot']) addKey(w, 'مسمن')
for (const w of ['atay', 'attay', 'tea', 'the', 'chay']) addKey(w, 'أتاي')
for (const w of ['qahwa', 'kahwa', 'cafe', 'coffee', 'kawa']) addKey(w, 'قهوة')
for (const w of ['jus', 'juice', 'jous', 'soda']) addKey(w, 'عصير')

// places & shopping
for (const w of ['7anote', 'hanote', 'hanoute', '7anout', 'hanout', '7anota', 'shop', 'shops', 'qantina', 'kantina', 'mhlaba', 'epicerie', 'store']) addKey(w, 'حوانيت')
for (const w of ['souk', 'souqa', 'marche', 'marchee', 'market', 'jem3a', 'jemaa', 'gm3']) addKey(w, 'السوق')
for (const w of ['marjane', 'carrefour', 'atacadao', 'aswak', 'labelvie', 'bim', 'supermarche']) addKey(w, 'سوبر ماركت')
for (const w of ['hwayej', 'hwaij', 'vetement', 'vetements', 'clothes', 'lbshe', 'lebse', 'qessawa', 'tshirt']) addKey(w, 'حوايج')
for (const w of ['sabat', 'ssabat', 'chaussures', 'shoes', 'babouche', 'balgha']) addKey(w, 'صباط')
for (const w of ['parfum', 'perfume', 'atr', '3atr', 'maquillage', 'makeup']) addKey(w, 'عطور')
for (const w of ['hdiya', 'hedia', 'cadeau', 'cadeaux', 'gift', 'kado']) addKey(w, 'هدايا')

// transport
for (const w of ['taxi', 'taksi', 'taxy', 'gtaxi']) addKey(w, 'طاكسي')
for (const w of ['tomobil', 'toumobil', 'voiture', 'car', 'tonobile']) addKey(w, 'طوموبيل')
for (const w of ['essence', 'benzine', 'bensin', 'gazoil', 'diesel', 'carburant']) addKey(w, 'بنزين')
for (const w of ['siklisse', 'siklesse', 'bicycle', 'velo', 'bisklet', 'bisclet', 'moto']) addKey(w, 'سيكلسة')
for (const w of ['tram', 'tramway', 'train', 'tran', 'oncf', 'bus', 'tobis', 'kar']) addKey(w, 'طران')
for (const w of ['parking', 'garage', 'garaj', 'lavage', 'vidange', 'pneu', 'mecanicien']) addKey(w, 'كاراج')

// bills & housing
for (const w of ['facture', 'factures', 'factura', 'bill', 'bills']) addKey(w, 'فاكتورة')
for (const w of ['dew', 'eddew', 'breq', 'elec', 'electricite', 'electricity']) addKey(w, 'ضو')
for (const w of ['ma', 'elma', 'lma', 'eau', 'water', 'redal', 'amendis', 'lydec']) addKey(w, 'ما')
for (const w of ['internet', 'wifi', 'adsl', 'fiber', 'fibre', 'box']) addKey(w, 'انترنت')
for (const w of ['telephone', 'telefoun', 'portable', 'mobile', 'recharge', 'chargement', 'ta3bia', 'sharj', 'inwi', 'orange', 'iam']) addKey(w, 'تيليفون')
for (const w of ['butagaz', 'boutagaz', 'gaz']) addKey(w, 'بوطغاز')
for (const w of ['kira', 'kraya', 'lkira', 'loyer', 'rent', 'louer']) addKey(w, 'كراء')
for (const w of ['dar', 'eddar', 'maison', 'house', 'appart', 'appartement', 'sokna']) addKey(w, 'الدار')
for (const w of ['syndic', 'sindek']) addKey(w, 'سيندك')

// health & education
for (const w of ['pharmacie', 'pharma', 'farmasi', 'farmasyan', 'pharmacy']) addKey(w, 'فارماسي')
for (const w of ['dwa', 'ddwa', 'adwiya', 'medicament', 'meds', 'medicine']) addKey(w, 'دوا')
for (const w of ['tbib', 'ttebib', 'docteur', 'doctor', 'medecin', 'dentiste', 'hopital', 'clinique']) addKey(w, 'طبيب')
for (const w of ['madrassa', 'lmedrassa', 'ecole', 'school', 'qraya', 'kraya', 'scolaire']) addKey(w, 'قراية')
for (const w of ['ktob', 'kutub', 'livre', 'livres', 'book', 'books', 'cahier', 'fournitures', 'krayas']) addKey(w, 'كتب')
for (const w of ['universite', 'faculte', 'fac', 'university', 'college', 'lycee']) addKey(w, 'جامعة')
for (const w of ['takwin', 'formation', 'cours', 'soutien']) addKey(w, 'تكوين')

// coffee / restaurants / delivery / entertainment
for (const w of ['snack', 'sanak', 'snacker']) addKey(w, 'سناك')
for (const w of ['resto', 'restaurant', 'restaurants', 'restoran', 'diner', 'dejeuner', 'lunch', 'dinner']) addKey(w, 'ريستو')
for (const w of ['tajine', 'couscous', 'seksou', 'hrira', 'bissara', 'pastilla', 'rfissa']) addKey(w, 'طاجين')
for (const w of ['pizza', 'pizzas', 'pizzeria']) addKey(w, 'بيتزا')
for (const w of ['glovo', 'delivery', 'dilevri', 'livraison', 'tawsil', 'commande']) addKey(w, 'ديليفري')
for (const w of ['cinema', 'sinima', 'film', 'movie', 'jeux', 'game', 'games', 'playstation', 'xbox']) addKey(w, 'سينما')
for (const w of ['kora', 'lkora', 'football', 'foot', 'match', 'stade']) addKey(w, 'كورة')
for (const w of ['gym', 'sport', 'riada', 'fitness', 'musculation']) addKey(w, 'رياضة')
for (const w of ['kharija', 'khrija', 'sortie', 'promenade', 'nawba']) addKey(w, 'خروجة')
for (const w of ['3id', 'aid', 'eid', 'fete', 'anniversaire', '3id milad']) addKey(w, 'عيد ميلاد')

// subscriptions / other
for (const w of ['abonnement', 'abonnements', 'subscription', 'subscriptions', 'netflex', 'netflix', 'spotify']) addKey(w, 'اشتراك')
for (const w of ['hkora', '7kora', 'signature', 'stamp', 'timbre']) addKey(w, 'طوابع')
for (const w of ['machakel', 'other', 'autre', 'autres', 'okhra', '7okra']) addKey(w, 'أخرى')

/**
 * Smart Darija name resolution.
 * Returns the Darija (Arabic script) name, or null when not confident —
 * the caller then keeps the original name untouched.
 */
export function smartDarijaName(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw || !looksLatin(raw)) return null // already Arabic → nothing to do

  const words = raw.split(/[\s\-_/,&+]+/).filter(Boolean)
  if (words.length === 0) return null

  const translated = words.map((w) => {
    const k = normLatinWord(w)
    return k && DICT[k] ? DICT[k] : null
  })

  // every word known → join (Darija is RTL, space-joined is correct)
  if (translated.every((x) => x !== null)) {
    const out = translated.join(' ').trim()
    return out || null
  }

  // single word: allow confident prefix/normalized misses like "khobzza"
  if (words.length === 1) {
    const k = normLatinWord(words[0])
    for (const len of [k.length - 1, k.length + 1]) {
      if (len < 3) continue
      const hit = DICT[k.slice(0, len)] ?? null
      if (hit) return hit
    }
  }
  return null
}

/** Suggest a Darija display name for a category (any script). */
export function suggestDarijaName(nameEn?: string | null, nameAr?: string | null, fallback?: string | null): string | null {
  return smartDarijaName(nameAr) ?? smartDarijaName(nameEn) ?? smartDarijaName(fallback)
}
