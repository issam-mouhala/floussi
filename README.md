# Floussi — AI Money Coach 💰

Application premium de finances personnelles propulsée par l'IA, conçue pour le Maroc.
Suivi des dépenses, détection du gaspillage, budgets, objectifs d'épargne et coaching IA —
en **Darija (RTL) 🇲🇦, Français 🇫🇷 et Anglais 🇬🇧**, en MAD (درهم).

![Stack](https://img.shields.io/badge/Next.js_16-React_19-black) ![DB](https://img.shields.io/badge/Prisma-Turso/LibSQL-00C4A7) ![UI](https://img.shields.io/badge/Tailwind_v4-shadcn/ui-38bdf8)

---

## ✨ Fonctionnalités

| Module | Description |
|---|---|
| 📊 **Dashboard** | Hero « dépensé aujourd'hui », budget journalier, KPI animés (CountUp), répartition nécessaire/évitable, tendance 14 jours |
| 🧠 **Floussi IQ** | Score d'intelligence financière /100 + conseils contextuels (« safe to spend », projection fin de mois) |
| 💬 **Coach IA** | Chat financier contextuel (réponses basées sur vos vraies données) |
| 🔍 **Recherche intelligente** | Langage naturel trilingue : `"tnine 11 decembre"`, `"khobze"`, `"50 dh"`, `"lbareh"` — dates, jours, montants, mots-clés flous (pont arabizi ↔ arabe) + bloc statistique avec somme et commentaire intelligent |
| 💸 **Transactions** | Filtres (période personnalisée, catégorie, type), vue « Par catégorie », Load more avec progression « X sur Y » |
| 📈 **Analyse** | Graphiques (aires, donut, radar catégories), stats table triable |
| 🐷 **Budgets & Objectifs** | Budgets mensuels/catégories, objectifs d'épargne avec progression |
| 🎮 **Floussi Play** | Mini-jeu arcade « Dirham Drop » (canvas, sons WebAudio synthétisés, records) |
| 🔔 **Notifications** | Alertes budget, anomalies, tips générés côté serveur |
| ⚙️ **Réglages** | Thème clair/sombre, langue, export/import JSON, Turso Cloud, mode démo, protection données |
| 📱 **PWA** | Installable, offline-ready (service worker), safe-areas iOS |

## 🎨 Design System v3 — « Obsidian & Emerald »

- **Tokens oklch** clair/sombre (dark mode « obsidienne » à 3 niveaux de surfaces)
- **Space Grotesk** (display : chiffres, titres) + **Geist** (UI) + **Cairo** (arabe/RTL)
- Cartes premium : ombres multicouches colorées + liseré supérieur interne
- Animations GPU (framer-motion) : transitions de vue 3D, pilule de nav morphing, tilt cards, orbes flottantes, shine sweep — `prefers-reduced-motion` respecté
- Bidi-safe : montants en `font-num` tabulaire, RTL miroir complet

## 🚀 Démarrage

```bash
# 1. Dépendances (bun recommandé, npm/pnpm compatibles)
bun install

# 2. Variables d'environnement
cp .env.example .env
#   → Mode local (aucune config) : SQLite fichier db/custom.db créée automatiquement
#   → Mode cloud : renseigner DATABASE_URL avec votre URL Turso (libsql://…)

# 3. Schéma Prisma
bunx prisma db push

# 4. Lancer
bun run dev        # http://localhost:3000
```

### Base de données

- **Local** : SQLite (`db/custom.db`) — zero-config, démarrage immédiat.
- **Turso Cloud** : coller `DATABASE_URL=libsql://…` (+ token) — la app détecte et migre
  automatiquement, avec coffre-fort de secours (`db/turso-vault.json`) et auto-backups JSON
  horodatés dans `db/backups/` avant chaque opération sensible.
- **Import/Export** : sauvegarde JSON complète depuis Réglages.

## 🗂️ Structure

```
src/
├─ app/
│  ├─ api/            # 24 routes REST (transactions, overview, analytics, chat IA…)
│  ├─ layout.tsx      # Polices (Geist + Space Grotesk + Cairo), PWA, thème
│  └─ globals.css     # Design system v3 (tokens oklch, utilitaires premium)
├─ components/
│  ├─ app-shell.tsx   # Sidebar/desktop + bottom-nav mobile + transitions 3D
│  ├─ dashboard.tsx   # Vue principale (hero tilt 3D, KPI, graphiques)
│  ├─ transactions-view.tsx  # Liste, filtres, recherche intelligente, vue catégories
│  ├─ game-view.tsx   # Mini-jeu « Dirham Drop » (canvas + WebAudio)
│  ├─ fx/             # TiltCard, Reveal, CountUp (motion réutilisable)
│  └─ ui/             # Primitives shadcn/ui personnalisées
├─ lib/
│  ├─ i18n/           # Dictionnaires en / fr / ary (darija, RTL)
│  ├─ smart-search.ts # Parser langage naturel trilingue
│  ├─ cache.ts        # Cache TTL serveur + déduplication de requêtes
│  ├─ intelligence.ts # Score Floussi IQ
│  └─ db.ts           # Client Prisma (Turso/SQLite + fallback coffre)
└─ hooks/
```

## ⚡ Performance

- Cache mémoire TTL côté serveur (overview 2.3 s → ~15 ms) avec invalidation immédiate à chaque écriture
- React Query : `staleTime` 30 s, vues lourdes en `next/dynamic` + préchauffage idle
- Rendu GPU uniquement (transforms), animations mesurées, code-splitting par vue

## 🔒 Confidentialité

Aucune donnée de démonstration n'est créée automatiquement : l'app démarre vide et
n'écrit que ce que vous saisissez. Les sauvegardes automatiques sont locales.

---

Built with Next.js App Router · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · Turso · framer-motion · Recharts · WebAudio
