// ---------------------------------------------------------------------------
// Floussi smart expense detection
// Understands free text written in Moroccan Darija (Arabizi "7anote", Arabic
// script "حانوت"), French ("épicerie") and English ("grocery"), plus Moroccan
// brands (Marjane, Glovo, inwi…). 100% offline — pure functions, no API call,
// so it can never fail with a network error and works instantly while typing.
// ---------------------------------------------------------------------------

export interface DetectableCategory {
  id: string
  slug: string
  nameEn: string
  nameFr: string
  nameAr: string
  /** smart Darija name (Arabic script) when available */
  nameAry?: string | null
  icon: string
}

export interface Detection {
  categoryId: string
  slug: string
  /** precise icon for THIS expense (falls back to the category icon) */
  icon: string
  /** the keyword that triggered the match (as the user would write it) */
  matched: string
  /** internal score, higher = more certain */
  score: number
  /** true when matched via a user-created category name rather than the dictionary */
  viaCustom: boolean
}

// --------------------------------------------------------------- normalization

/** Arabizi digits → latin letters (7=ح, 3=ع, 9=ق, 5=خ, 8=هـ, 2=ء) */
function deArabizi(s: string): string {
  return s
    .replace(/7/g, 'h')
    .replace(/3/g, 'a')
    .replace(/9/g, 'q')
    .replace(/5/g, 'kh')
    .replace(/8/g, 'h')
    .replace(/2/g, 'a')
    .replace(/1/g, 'i')
}

const AR_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g // tashkeel + tatweel

/** Arabic script normalization (alef/yeh/teh-marbuta variants). */
function normalizeArabic(s: string): string {
  return s
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/گ/g, 'ك')
    .replace(/ڭ/g, 'ك')
    .replace(/پ/g, 'ب')
    .replace(/چ/g, 'ش')
    .replace(/ژ/g, 'ز')
}

/** Normalize one latin token: lowercase + strip accents + arabizi digits + french/english plural 's'. */
function normLatin(s: string): string {
  let t = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  t = deArabizi(t)
  if (t.length >= 5 && t.endsWith('s')) t = t.slice(0, -1) // pommes→pomme, factures→facture
  return t
}

/** Normalize any token, Arabic or latin, into comparable form. */
function normToken(s: string): string {
  if (/[\u0600-\u06FF]/.test(s)) return normalizeArabic(s)
  return normLatin(s)
}

const HAS_ARABIC = /[\u0600-\u06FF]/

const STOP = new Set(['dh', 'dhs', 'mad', 'درهم', 'دراهم', 'de', 'du', 'la', 'le', 'les', 'el', 'a', 'et', 'و', 'ف', 'ب', 'li', 'dyal', 'dial', 'ديال'])

// ------------------------------------------------------------------ dictionary
// icon = precise per-expense icon (all names verified in lucide-react 0.525)

interface Entry { slug: string; icon?: string; keys: string[] }

const ENTRIES: Entry[] = [
  // ------------------------------------------------------------- groceries
  { slug: 'groceries', icon: 'ShoppingCart', keys: [
    'hanout', 'hanote', 'hanoute', 'hanuta', '7anout', 'qantina', 'kantina', 'mhlaba',
    'souk', 'souqa', 'marche', 'marchee', 'epicerie', 'suppermarche', 'supermarche', 'hypermarche',
    'courses', 'course', 'groceries', 'grocery', 'provisions', 'market', 'mini market',
    'marjane', 'carrefour', 'atacadao', 'aswak', 'asswak', 'salam', 'bim', 'qmert', 'qmart', 'labelvie', 'label vie',
    'khodra', 'khoudra', 'khdar', 'legumes', 'legume', 'fruits', 'fawakih',
    'khodr', 'dl3', 'della3',
    'سوق', 'السوق', 'حانوت', 'الحانوت', 'قنطينة', 'محل', 'المحل', 'بقالة', 'مارجان', 'كارفور', 'اتاكاداو', 'اسواق', 'اسواق سلام', 'بيم',
    'خضرة', 'الخضرة', 'فواكه', 'فاكية', 'دلاع', 'تسوق البيت', 'مواد غذائية',
  ] },
  { slug: 'groceries', icon: 'Croissant', keys: [
    'khobz', 'khobza', 'khoubz', 'khoz', 'pain', 'pains', 'boulangerie', 'farane', 'baguette',
    'خبز', 'الخبز', 'خبزة', 'فران', 'الفران', 'بولانجيري',
  ] },
  { slug: 'groceries', icon: 'Milk', keys: ['hlib', 'hleb', '7lib', 'lait', 'lben', 'raib', 'milk', 'حليب', 'الحليب', 'لبن', 'رايب', 'حلب'] },
  { slug: 'groceries', icon: 'Egg', keys: ['byed', 'baid', 'bayd', 'oeuf', 'oeufs', 'eggs', 'egg', 'بيض', 'البيض', 'بيضة'] },
  { slug: 'groceries', icon: 'Beef', keys: ['lham', 'lehm', '7am', 'viande', 'viandes', 'meat', 'steak', 'kefta', 'poulet', 'chicken', 'djaj', 'دجاج', 'لحم', 'اللحم', 'كفتة'] },
  { slug: 'groceries', icon: 'Fish', keys: ['hout', '7out', 'poisson', 'poissons', 'fish', 'samak', 'sardine', 'sardines', 'حوت', 'الحوت', 'سمك', 'سردين'] },
  { slug: 'groceries', icon: 'Wheat', keys: ['dkik', 'dqik', 'farine', 'semoule', 'semoules', 'دقيق', 'الدقيق', 'سميد', 'كسكس', 'شعرية', 'مقرونة', 'pates', 'pasta', 'riz', 'أرز', 'عدس', 'حمص', 'فاصوليا', 'lentilles'] },
  { slug: 'groceries', icon: 'Apple', keys: ['tmatem', 'tomates', 'tomate', 'batata', 'pomme de terre', 'pommes de terre', 'carotte', 'carottes', 'basla', 'oignon', 'oignons', 'onion', 'زيتون', 'olives', 'olive'] },
  { slug: 'groceries', icon: 'Milk', keys: ['jben', 'fromage', 'fromages', 'cheese', 'فرماج', 'جبن', 'الجبن', 'زبدة', 'beurre', 'butter'] },
  { slug: 'groceries', icon: 'ShoppingCart', keys: ['sokar', 'sukar', 'sucre', 'sugar', 'سكر', 'السكر', 'zit', 'huile', 'huile dolive', 'oil', 'زيت', 'الزيت', 'sardine boite', 'conserves', 'مصبرات', 'شاي', 'the vert', 'قهوة حبوب'] },

  // -------------------------------------------------------------- housing
  { slug: 'housing', icon: 'Home', keys: [
    'loyer', 'kira', 'kraya', 'lkira', 'rent', 'renta', 'appartement', 'appart', 'apartment', 'flat',
    'dar', 'eddar', 'maison', 'house', 'home', 'syndic', 'logement', 'sokna', 'sokkan', 'habitation',
    'دار', 'الدار', 'كراء', 'الكراء', 'كيرا', 'لوير', 'سكن', 'السكن', 'شقة', 'شقة', 'سيندك',
  ] },
  { slug: 'housing', icon: 'Paintbrush', keys: ['peinture', 'peintures', 'sbeq', 'sbagh', 'صباغة', 'دهان', 'plomberie', 'plombier', 'سباك', 'سباكة', 'depannage', 'اصلاح الدار'] },
  { slug: 'housing', icon: 'Hammer', keys: ['travaux', 'chantier', 'menuisier', 'نجار', 'ترميم', 'إصلاحات', 'repair house'] },

  // ------------------------------------------------------------ transport
  { slug: 'transport', icon: 'CarTaxiFront', keys: [
    'taxi', 'taksi', 'taxy', 'petit taxi', 'taxi petit', 'gtaxi',
    'طاكسي', 'الطاكسي', 'طاكسي صغير', 'تاكسي',
    'indrive', 'in drive', 'careem', 'yassir', 'heetch', 'uber',
  ] },
  { slug: 'transport', icon: 'CarFront', keys: [
    'tomobil', 'toumobil', 'tomobile', 'tumubil', 'voiture', 'voitures', 'car', 'cars',
    'طوموبيل', 'الطوموبيل', 'طوموبيلة', 'سيارة', 'سياره',
    'parking', 'stationnement', 'garage', 'garaj', 'lavage', 'vidange', 'pneu', 'pneus', 'mecanicien', 'ميكانيك', 'ميكانيكي', 'غسيل الطوموبيل', 'كراج',
  ] },
  { slug: 'transport', icon: 'Fuel', keys: [
    'essence', 'carburant', 'gazole', 'gasoil', 'diesel', 'bensin', 'benzine', 'benzine',
    'بنزين', 'البنزين', 'مازوط', 'محطة البنزين', 'fuel', 'petrol', 'gas station',
  ] },
  { slug: 'transport', icon: 'TramFront', keys: ['tram', 'tramway', 'train', 'oncf', 'طرامواي', 'الطرامواي', 'طران', 'الطران', 'تران', 'metro', 'ميترو'] },
  { slug: 'transport', icon: 'BusFront', keys: ['bus', 'tobis', 'toubis', 'autobus', 'kar', 'bouskar', 'طوبيس', 'الطوبيس', 'بوس', 'كار', 'autocar'] },
  { slug: 'transport', icon: 'Bike', keys: ['moto', 'moto', 'motard', 'bisclet', 'bisklet', 'velo', 'vélo', 'bicycle', 'sikklita', 'بيسكليت', 'موتور', 'دراجة', 'بسكلات'] },
  { slug: 'transport', icon: 'CarFront', keys: ['gare', 'la gare', 'station', 'mahatta', 'محطة', 'الݣار', 'لكازا نو traveled'] },

  // ---------------------------------------------------------------- bills
  { slug: 'bills', icon: 'PlugZap', keys: [
    'facture', 'factures', 'factura', 'facturesReseau', 'bill', 'bills', 'utility', 'utilities',
    'فاكتورة', 'الفاكتورة', 'فاكتورات', 'فاتورة',
  ] },
  { slug: 'bills', icon: 'Zap', keys: ['electricite', 'elec', 'elektrisite', 'dew', 'eddew', 'breq', 'barq', 'kahraba', 'electricity', 'power', 'ضو', 'الضو', 'برق', 'كهرباء', 'الكهرباء'] },
  { slug: 'bills', icon: 'Droplets', keys: ['ma', 'elma', 'lma', 'eau', 'water', 'الماء', 'ماء', 'الماء', 'lydec', 'redal', 'amendis', 'بال'] },
  { slug: 'bills', icon: 'Wifi', keys: ['internet', 'internet adsl', 'adsl', 'fiber', 'fibre', 'wifi', 'wi fi', 'انترنت', 'الانترنت', 'وي فاي', 'واي فاي', 'box'] },
  { slug: 'bills', icon: 'Smartphone', keys: [
    'telephone', 'telefoun', 'tilifun', 'portable', 'mobile', 'recharge', 'rechargement', 'recharge credit', 'chargement', 'ta3bia', 'taabia', 'sharj', 'charj',
    'تيليفون', 'التيليفون', 'تعبئة', 'التعبئة', 'شارج', 'شحن',
    'inwi', 'orange', 'iam', 'maroc telecom', 'matel', 'اتصالات المغرب', 'انوي', 'اورنج', 'ياتي',
  ] },
  { slug: 'bills', icon: 'Flame', keys: ['bouteille de gaz', 'boutagaz', 'butagaz', 'gaz', 'بوطغاز', 'الغاز', 'غاز', 'butane'] },
  { slug: 'bills', icon: 'Landmark', keys: ['impots', 'impot', 'taxe', 'taxes', 'tax', 'taxes locales', 'ضرائب', 'ضريبة', 'الضرايب', 'taxe habitation'] },
  { slug: 'bills', icon: 'Tv', keys: ['canal plus', 'canalplus', 'canaux', 'parabole', 'parabol', 'البارابول', 'قنوات'] },

  // --------------------------------------------------------------- health
  { slug: 'health', icon: 'Pill', keys: [
    'pharmacie', 'pharma', 'farmasyan', 'farmasi', 'pharmacy', 'drugstore',
    'فارماسي', 'الفرمسيان', 'الفرماسي', 'فارمسيان', 'الصيدلية',
    'dwa', 'ddwa', 'adwiya', 'medicament', 'medicaments', 'meds', 'medicine', 'médicament', 'ميدامان', 'دوا', 'الدوا', 'الادوية',
    'vitamine', 'vitamines', 'sirop', 'sirops', 'vaccin', 'vaccins', 'piqure', 'لقاح', 'سيروم', 'فيتامين',
    'creme', 'كريم', 'pansement', 'compresses', 'ماسك', 'مرهم',
  ] },
  { slug: 'health', icon: 'Stethoscope', keys: [
    'tbib', 'ttebib', 'docteur', 'doctor', 'doktor', 'medecin', 'médecin', 'physician',
    'طبيب', 'الطبيب', 'دكتور', 'الدكتور', 'سبيطار', 'لپيطال', 'hopital', 'hopitale', 'hospital', 'clinique', 'كلينيك', 'الصحة',
    'dentiste', 'دونان', 'الدونان', 'سنانية', 'analyses', 'analyse', 'تحاليل', 'radiologie', 'radio', 'اشعة', 'متابعة',
  ] },
  { slug: 'health', icon: 'Glasses', keys: ['lunettes', 'lunette', 'glasses', 'نظارات', 'نظارة', 'معينات'] },

  // ------------------------------------------------------------ education
  { slug: 'education', icon: 'GraduationCap', keys: [
    'ecole', 'madrassa', 'lmedrassa', 'school', 'scolaire', 'qraya', 'kraya', 'قراية',
    'مدرسة', 'المدرسة', 'القراية', 'التعليم',
    'universite', 'faculte', 'fac', 'university', 'college', 'lycee', 'ثانوية', 'الجامعة', 'الفاكلتي',
    'inscription', 'تسجيل', 'التسجيل', 'scolarite', 'frais scolarite', 'ecolage', 'دراسة', 'الدراسة',
  ] },
  { slug: 'education', icon: 'BookOpen', keys: [
    'ktob', 'kutub', 'livre', 'livres', 'book', 'books', 'fournitures', 'cartable', 'cahier', 'cahiers', 'krayas', 'قرطاسية', 'كتب', 'الكتب', 'كتاب', 'كراس', 'الكشكول', 'محفظة مدرسية',
    'cours', 'cours particuliers', 'soutien', 'soutien scolaire', 'درس', 'دروس', 'الكورس', 'كورس',
  ] },
  { slug: 'education', icon: 'GraduationCap', keys: ['takwin', 'formation', 'formations', 'training', 'workshop', 'تكوين', 'دورة', 'دورات', 'atelier', 'seminaire'] },
  { slug: 'education', icon: 'Baby', keys: ['creche', 'crèche', 'حضانة', 'الروض', 'روض'] },

  // --------------------------------------------------------------- coffee
  { slug: 'coffee', icon: 'Coffee', keys: [
    'cafe', 'qahwa', 'kahwa', 'kawa', 'قهوة', 'القهوة', 'قهوتي',
    'cappuccino', 'capuccino', 'espresso', 'express', 'nouss nouss', 'nous nous', 'nss nss', 'نص نص',
    'starbucks', 'wego', 'cafe wego', 'café', 'الاطاي',
  ] },
  { slug: 'coffee', icon: 'Coffee', keys: ['atay', 'attay', 'tea', 'thé', 'شاي', 'اتاي', 'الشاي', 'نعناع', 'pomme de canelle? no'] },
  { slug: 'coffee', icon: 'Croissant', keys: ['msemen', 'msemmen', 'rghaif', 'beghrir', 'sfenj', 'harcha', 'batbot', 'مسمن', 'المسمن', 'بغرير', 'سفنج', 'حرشة', 'بطبوط', 'croissant', 'croissants', 'كرواصون', 'viennoiserie', 'pain au chocolat'] },
  { slug: 'coffee', icon: 'CakeSlice', keys: ['chebakia', 'شباكية', 'kaab ghzal', 'كعب غزال', 'gateau', 'gateaux', 'cake', 'كيك', 'حلوة', 'الحلوة', 'حلويات', 'halwa', 'patisserie', 'الحلويات', 'sweets', 'sellou', 'محنشة', 'mhencha'] },
  { slug: 'coffee', icon: 'IceCreamBowl', keys: ['glace', 'glaces', 'ice cream', 'icecream', 'جيلاتو', 'اسكريم', 'الاسكريم'] },
  { slug: 'coffee', icon: 'CupSoda', keys: ['jus', 'juice', 'jous', 'عصير', 'العصير', 'afokas', 'افوكا', 'avocado', 'soda', 'sodas', 'coca', 'cola', 'كوكا', 'سيوي', 'sprite', 'fanta', 'limonade', 'limon', 'ليمون', 'معدنية', 'مشروب'] },
  { slug: 'coffee', icon: 'Sandwich', keys: ['snack', 'sanak', 'سناك', 'السناك', 'snacker', 'sandwich', 'sandwichs', 'سانطويش', 'بوكاديلو', 'bocadillo', 'merguez', 'frites', 'فريت', 'بطاطس مقلية', 'shawima snak'] },
  { slug: 'coffee', icon: 'Cookie', keys: ['biscuit', 'biscuits', 'cookie', 'cookies', 'بسكويط', 'بسكويت', 'گاطو البسكويت'] },
  { slug: 'coffee', icon: 'Popcorn', keys: ['popcorn', 'فوشار', 'بوشار', 'pouchar', 'chips', 'شيبس', 'شيب'] },
  { slug: 'coffee', icon: 'Coffee', keys: ['ftour', 'فطور', 'الفطور', 'petit dejeuner', 'breakfast', 'déjeuner matinal', 'فطور الصباح'] },

  // ------------------------------------------------------------- delivery
  { slug: 'delivery', icon: 'Bike', keys: [
    'glovo', 'ݣلوڤو', 'ڭلوڤو', 'كلوفو', 'گلوو',
    'livraison', 'livraisons', 'delivery', 'dilevri', 'tawsil', 'توصيل', 'ديليفري', 'الديليفري', 'دليفري',
    'commande', 'commander', 'order online', 'أونلاين', 'اونلاين', 'online',
    'kfc', 'mcdo', 'mcdonald', 'mac donald', 'burger king', 'pizza e pasta', 'sushi kadomi', 'tacos king', 'kaala',
  ] },
  { slug: 'delivery', icon: 'Pizza', keys: ['pizza', 'pizzas', 'pizzeria', 'بيتزا', 'البيتزا', 'بيتسا'] },
  { slug: 'delivery', icon: 'Sandwich', keys: ['shawarma', 'chawarma', 'شاورما', 'الشاورما', 'tacos', 'takos', 'طاكوس', 'الطاكوس', 'burger', 'burgers', 'برݣر', 'برغر', 'البرݣر'] },
  { slug: 'delivery', icon: 'Fish', keys: ['sushi', 'sushis', 'سوشي', 'makizushi'] },

  // ---------------------------------------------------------- restaurants
  { slug: 'restaurants', icon: 'UtensilsCrossed', keys: [
    'resto', 'restaurant', 'restaurants', 'ريستو', 'الريستو', 'ريستوران', 'مطعم', 'المطعم',
    'diner', 'dîner', 'dejeuner', 'déjeuner', 'lunch', 'dinner', 'supper', 'repas', 'eat out',
    'traiteur', 'buffet', 'غدا', 'الغدا', 'عشا', 'sqala', 'la sqala', 'cabestan', 'le cabestan', 'annapurna', 'korean house',
  ] },
  { slug: 'restaurants', icon: 'Soup', keys: ['tajine', 'tajines', 'طاجين', 'couscous', 'كسكس', 'seksou', 'pastilla', 'بستيلة', 'بسطيلة', 'rfissa', 'رفيسة', 'hrira', 'حريرة', 'bissara', 'بيصارة', 'harira', 'شوربة', 'soup', 'soupe', 'mfouar', 'مفور'] },
  { slug: 'restaurants', icon: 'Beef', keys: ['grill', 'grillade', 'grillades', 'مشوي', 'كباب', 'kebab', 'kebda', 'كبدة', 'mergeduf? no', 'brochettes', 'مشاوي', 'على الفحم'] },
  { slug: 'restaurants', icon: 'Fish', keys: ['fruits de mer', 'friture', 'friture de poisson', 'سردين مشوي', 'حوت مشوي', 'seafood'] },

  // ------------------------------------------------------------- shopping
  { slug: 'shopping', icon: 'Shirt', keys: [
    'vetements', 'vêtement', 'vêtements', 'habits', 'habit', 'clothes', 'clothing', 'outfit',
    'لبشة', 'اللبشة', 'حوايج', 'حوايج اللبس', 'قساوي', 'تيشيرت', 'tshirt', 'shirt', 'survet', 'سرفيت? no',
    'caftan', 'قفطان', 'takchita', 'تكشيطة', 'jellaba', 'djellaba', 'جلابة', 'جلابية', 'jabador', 'جابادور', 'gandoura', 'قندورة',
    'zara', 'hm', 'h m', 'decathlon', 'morocco mall', 'moroccomall', 'anfa place', 'زارا', 'موروكو مول',
  ] },
  { slug: 'shopping', icon: 'Footprints', keys: ['babouche', 'بلغة', 'البلغة', 'بلغات', 'sabat', 'صباط', 'الصباط', 'sneakers', 'baskets', 'chaussures', 'chaussure', 'shoes', 'سبادري', 'صندال', 'sandal', 'sandales', 'نعل'] },
  { slug: 'shopping', icon: 'Sparkles', keys: ['bijoux', 'bijou', 'bague', 'خاتم', 'حلية', 'parfum', 'perfume', 'عطر', 'العطر', 'maquillage', 'makeup', 'ماكياج', 'cosmetique', 'cosmetiques', 'مستحضرات', 'كريمات'] },
  { slug: 'shopping', icon: 'Gift', keys: ['cadeau', 'cadeaux', 'cadeau anniversaire', 'hdiya', 'هدية', 'الهدية', 'كادو', 'gift', 'present', 'عيد ميلاد', 'مواليد', 'mariage', 'عرس', 'العرس', 'جهاز', 'فراش'] },
  { slug: 'shopping', icon: 'Smartphone', keys: ['iphone', 'samsung', 'xiaomi', 'smartphone', 'ايفون', 'سامسونج', 'تيليفون جديد', 'redmi', 'oppo', 'handheld'] },
  { slug: 'shopping', icon: 'Laptop', keys: ['laptop', 'ordinateur', 'pc portable', 'macbook', 'لابتوب', 'حاسوب', 'كمبيوتر', 'ecran', 'screen', 'ipad', 'tablet', 'تابلت'] },

  // -------------------------------------------------------- entertainment
  { slug: 'entertainment', icon: 'PartyPopper', keys: [
    'sortie', 'خروجة', 'الخروجة', 'نزهة', 'promenade', 'fun', 'loisirs', 'ترفيه', 'الترفيه', 'تسلية',
    'fete', 'حفلة', 'الحفلة', 'anniversaire', 'عيد الميلاد', 'soiree', 'سهرة',
  ] },
  { slug: 'entertainment', icon: 'Gamepad2', keys: [
    'cinema', 'sinima', 'سينما', 'السينما', 'megarama', 'film', 'movie', 'فيلم', 'الافلام',
    'bowling', 'karting', 'escape game', 'laser tag', 'jeux', 'game', 'games', 'ألعاب', 'العاب', 'لعب',
    'playstation', 'play station', 'ps4', 'ps5', 'xbox', 'nintendo', 'fifa', 'pes', 'vivideo', 'فيديو',
  ] },
  { slug: 'entertainment', icon: 'Volleyball', keys: ['foot', 'kora', 'lkora', 'football', 'soccer', 'match', 'stade', 'كورة', 'لكورة', 'الكورة', 'مباراة', 'الستاد', 'basket', 'handball', 'tennis'] },
  { slug: 'entertainment', icon: 'Dumbbell', keys: ['gym', 'salle de sport', 'riada', 'sport', 'fitness', 'musculation', 'workout', 'تمرين', 'رياضة', 'الرياضة', 'نادي', 'النادي', 'كمال الاجسام'] },
  { slug: 'entertainment', icon: 'Music', keys: ['concert', 'concerts', 'festival', 'مهرجان', 'الحفلة الموسيقية', 'أغاني', 'mousica', 'مهرجان موازين', 'mawazine'] },
  { slug: 'entertainment', icon: 'Plane', keys: [
    'voyage', 'voyages', 'safra', 'سفرة', 'السفرة', 'سفر', 'trip', 'trips', 'travel', 'vacances', 'عطلة', 'العطلة', 'اجازة',
    'aeroport', 'airport', 'طيارة', 'tayara', 'avion', 'plane', 'flight', 'طار', 'الطيران', 'ryanair', 'transavia',
  ] },
  { slug: 'entertainment', icon: 'Hotel', keys: ['hotel', 'hôtel', 'أوطيل', 'فندق', 'الفندق', 'booking', 'airbnb', 'ريزيدا? no', 'resort', 'ريزيدو'] },
  { slug: 'entertainment', icon: 'PartyPopper', keys: ['piscine', 'masbah', 'مسبح', 'حمام سباحة', 'plage', 'b7ar', 'البحر', 'beach', 'mer', 'sea', 'شاطئ'] },

  // -------------------------------------------------------- subscriptions
  { slug: 'subscriptions', icon: 'Tv', keys: [
    'netflix', 'نتفليكس', 'شاهد', 'shahid', 'osn', 'prime video', 'disney', 'mycanal? no', 'youtube premium', 'يوتيوب',
  ] },
  { slug: 'subscriptions', icon: 'Headphones', keys: ['spotify', 'سبوتيفاي', 'anghami', 'deezer', 'youtube music', 'apple music'] },
  { slug: 'subscriptions', icon: 'Repeat', keys: [
    'abonnement', 'abonnements', 'subscription', 'subscriptions', 'اشتراك', 'الاشتراك', 'الاشتراكات', 'اشتراك شهري',
  ] },
  { slug: 'subscriptions', icon: 'Cloud', keys: ['icloud', 'cloud', 'stockage', 'storage', 'drive', 'googledrive', 'onedrive', 'dropbox', 'تخزين'] },
  { slug: 'subscriptions', icon: 'Globe', keys: ['hosting', 'domaine', 'domain', 'استضافة', 'دومين', 'vpn', 'ovh', 'namecheap', 'godaddy'] },
  { slug: 'subscriptions', icon: 'Sparkles', keys: ['chatgpt', 'openai', 'claude', 'gemini', 'midjourney', 'chat gpt', 'abonnement ai'] },
  { slug: 'subscriptions', icon: 'Newspaper', keys: ['presse', 'journal', 'journaux', 'magazine', 'صحيفة', 'جريدة', 'مجلة', 'newspaper'] },

  // ---------------------------------------------------------------- other
  { slug: 'other', icon: 'Scissors', keys: ['coiffeur', 'coiffure', 'barbier', 'barber', 'haircut', 'حلاق', 'الحلاق', 'قص الشعر', 'حلاقة', 'salon de coiffure'] },
  { slug: 'other', icon: 'PawPrint', keys: ['veterinaire', 'vet', 'بيطري', 'البيطري', 'animal', 'pet food', 'قطط', 'كلاب', 'قط', 'قطة', 'طعام القطط'] },
  { slug: 'other', icon: 'Baby', keys: ['bebe', 'bébé', 'baby', 'بيبي', 'couches', 'لانصة', 'biberon', 'بيبرون', 'لعبة طفل'] },
  { slug: 'other', icon: 'Wallet', keys: ['banque', 'bank', 'البنك', 'frais bancaires', 'transfert', 'virement', 'تحويل', 'تحويل بنكي', 'mandat', 'سارفة? no', 'wise', 'remitly'] },
  { slug: 'other', icon: 'Heart', keys: ['don', 'dons', 'charity', 'صدقة', 'الصدقة', 'زكاة', 'تبرع', 'التبرع', 'جمعية', 'association', 'خيرية', 'مساعدة'] },
  { slug: 'other', icon: 'Printer', keys: ['impression', 'imprimer', 'photocopie', 'copie', 'print', 'طباعة', 'طابعة', 'صور', 'تصاور'] },
  { slug: 'other', icon: 'KeyRound', keys: ['cle', 'mfeteh', 'مفتاح', 'المفتاح', 'copie de cle', 'serrure', 'قفل', 'serreur'] },
  { slug: 'other', icon: 'WashingMachine', keys: ['lessive', 'machine a laver', 'washing machine', 'lave linge', 'صابونة', 'غسيل', 'الغسيل'] },
  { slug: 'other', icon: 'Briefcase', keys: ['frais de dossier', 'frais', 'honoraires', 'رسوم', 'divers', 'autre', 'autres', 'misc', 'أخرى', 'اخرى', 'اخرى مصاريف', 'مصاريف اخرى'] },
]

// pre-normalized dictionary (latin + arabic forms per entry)
interface NormEntry { slug: string; icon: string; precise: boolean; latin: string[]; arabic: string[]; display: Map<string, string> }

/** default icon per slug — entries with a DIFFERENT icon are "precise" and get a bonus */
const DEFAULT_ICON: Record<string, string> = {
  groceries: 'ShoppingCart', housing: 'Home', transport: 'CarFront', bills: 'PlugZap',
  health: 'HeartPulse', education: 'GraduationCap', coffee: 'Coffee', delivery: 'Bike',
  restaurants: 'UtensilsCrossed', shopping: 'ShoppingBag', entertainment: 'PartyPopper',
  subscriptions: 'Repeat', other: 'Package',
}

/** normalize a multi-word key: drop stop words inside it ("bouteille de gaz" → "bouteille gaz") */
function cleanMultiword(k: string): string {
  return k
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ')
}

const NORM_ENTRIES: NormEntry[] = ENTRIES.map((e) => {
  const latin: string[] = []
  const arabic: string[] = []
  const display = new Map<string, string>() // normalized keyword → original spelling
  for (const k of e.keys) {
    const cleaned = cleanMultiword(k.trim().toLowerCase())
    if (!cleaned || cleaned.includes('?')) continue
    if (HAS_ARABIC.test(cleaned)) {
      const n = normalizeArabic(cleaned)
      arabic.push(n)
      if (!display.has(n)) display.set(n, cleaned)
    } else {
      const n = normLatin(cleaned)
      latin.push(n)
      if (!display.has(n)) display.set(n, cleaned)
    }
  }
  return { slug: e.slug, icon: e.icon ?? 'Package', precise: (e.icon ?? '') !== DEFAULT_ICON[e.slug], latin, arabic, display }
})

// --------------------------------------------------------------- matching core

function commonPrefixLen(a: string, b: string): number {
  let i = 0
  const max = Math.min(a.length, b.length)
  while (i < max && a[i] === b[i]) i++
  return i
}

/** Score one keyword against one token (both normalized). 0 = no match. */
function scorePair(kw: string, token: string): number {
  if (!kw || !token) return 0
  if (kw === token) {
    const base = 3 + (14 - Math.min(kw.length, 14)) * 0.04 // shorter keyword = more precise
    if (kw.includes(' ')) return base + 0.6 // multi-word phrase hit is very telling
    return base
  }
  const minL = Math.min(kw.length, token.length)
  const cp = commonPrefixLen(kw, token)
  // one is a prefix of the other, sharing >= 4 chars ("pharmacie" ↔ "pharmacien")
  if (minL >= 4 && cp >= minL) return 2 + cp * 0.04
  // containment for long-enough words ("الدار" contains "دار")
  if (kw.length >= 4 && token.includes(kw)) return 1.4 + Math.min(kw.length, 14) * 0.04
  if (token.length >= 4 && kw.includes(token)) return 1.1 + Math.min(token.length, 14) * 0.04
  return 0
}

/** One input token: normalized form for matching + original spelling for display. */
interface Tok { norm: string; raw: string }

/** Split raw user text into normalized tokens (drops amounts, currency words, punctuation). */
function tokenize(raw: string): Tok[] {
  const rawTokens = raw
    .replace(/[.,!?;:()\[\]{}"'«»„“”\/\\|_#@$%&*=+\-~^°]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const tokens: Tok[] = []
  for (const t of rawTokens) {
    if (/^[\d]+([.,]\d+)?$/.test(t)) continue // pure numbers = amount
    const n = normToken(t)
    if (!n || STOP.has(n)) continue
    tokens.push({ norm: n, raw: t })
  }
  return tokens
}

/** Build 1..3-word n-grams from the token list (for multi-word keywords). */
function ngrams(tokens: Tok[]): Tok[] {
  const out = [...tokens]
  for (let i = 0; i < tokens.length - 1; i++)
    out.push({ norm: tokens[i].norm + ' ' + tokens[i + 1].norm, raw: tokens[i].raw + ' ' + tokens[i + 1].raw })
  for (let i = 0; i < tokens.length - 2; i++)
    out.push({ norm: tokens[i].norm + ' ' + tokens[i + 1].norm + ' ' + tokens[i + 2].norm, raw: tokens[i].raw + ' ' + tokens[i + 1].raw + ' ' + tokens[i + 2].raw })
  return out
}

const AR_CODE = /[\u0600-\u06FF]/

// ------------------------------------------------------------------ public API

/** Confidence label for UI display. */
export function detectionConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 3) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

/**
 * Detect the category (and precise icon) of an expense from free text.
 * `categories` = current DB categories (user-created included).
 * Returns null when nothing convincing is found.
 */
export function detectExpense(raw: string, categories: DetectableCategory[]): Detection | null {
  const text = (raw ?? '').trim()
  if (text.length < 2) return null
  const tokens = tokenize(text)
  if (tokens.length === 0) return null
  const grams = ngrams(tokens)

  let bestScore = 0
  let bestSlug = ''
  let bestIcon = 'Package'
  let bestMatched = ''
  let bestViaCustom = false

  const consider = (score: number, slug: string, icon: string, matched: string, viaCustom: boolean) => {
    if (score > bestScore) {
      bestScore = score
      bestSlug = slug
      bestIcon = icon
      bestMatched = matched
      bestViaCustom = viaCustom
    }
  }
  let bestDisplay = ''

  for (const entry of NORM_ENTRIES) {
    let entryScore = 0
    let entryMatched = ''
    let entryDisplay = ''
    const words = entry.latin.concat(entry.arabic)
    for (const kw of words) {
      const isAr = AR_CODE.test(kw)
      // Arabic keywords only test Arabic-normalized grams, latin vs latin —
      // pools stay separate so "dar" (latin) never fights "دار".
      for (const g of grams) {
        if (isAr !== AR_CODE.test(g.norm)) continue
        const s = scorePair(kw, g.norm)
        if (s > entryScore) {
          entryScore = s
          entryMatched = kw
          entryDisplay = g.raw // show exactly what the user typed
        }
      }
    }
    if (entryScore > 0) {
      consider(entryScore + (entry.precise ? 0.25 : 0), entry.slug, entry.icon, entryMatched, false)
      if (entryScore + 0.25 >= bestScore) bestDisplay = entryDisplay
    }
  }

  // custom + default categories: match against their localized names / slug
  for (const c of categories) {
    const names = [c.slug, c.nameEn, c.nameFr, c.nameAr, c.nameAry]
      .filter((n): n is string => Boolean(n))
      .flatMap((n) => n.split(/[&/,]|\band\b|\bet\b|\bو\b/))
      .map((n) => normToken(n.trim()))
      .filter((n) => n.length >= 2)
    let catScore = 0
    let catMatched = ''
    for (const kw of names) {
      const isAr = AR_CODE.test(kw)
      for (const g of grams) {
        if (isAr !== AR_CODE.test(g.norm)) continue
        const s = scorePair(kw, g.norm)
        if (s > catScore) {
          catScore = s
          catMatched = g.raw
        }
      }
    }
    if (catScore > 0) {
      // dictionary beats name-matching on equal score
      consider(catScore - 0.15, c.slug, c.icon, catMatched, true)
    }
  }

  if (bestScore < 1.2 || !bestSlug) return null
  const cat = categories.find((c) => c.slug === bestSlug)
  if (!cat) return null
  const icon = bestViaCustom || bestIcon === 'Package' ? cat.icon : bestIcon
  return { categoryId: cat.id, slug: cat.slug, icon, matched: bestDisplay || bestMatched, score: bestScore, viaCustom: bestViaCustom }
}
