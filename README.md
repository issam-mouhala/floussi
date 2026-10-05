# Floussi — Your AI money coach 🇲🇦

Application web **fintech personnelle** premium : suivi de dépenses, Floussi IQ (score d'intelligence financière), coach IA trilingue, statistiques annuelles — avec **comptes utilisateurs sécurisés** (connexion / inscription).

- **Trilingue natif** : English · Français · الدارجة (RTL première classe)
- **Multi-comptes** : chaque utilisateur possède ses propres données (auth scrypt + sessions HttpOnly)
- **Zéro donnée de démo** : un compte neuf démarre vide — vos chiffres sont toujours les vôtres
- **PWA** installable, dark mode, responsive 360 px → 1920 px

---

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Dashboard** | Total du jour / semaine / mois, roue des dépenses, 14 derniers jours, transactions récentes |
| **Floussi IQ** | Score propriétaire 0–100 (anneau segmenté), burn rate, projection fin de mois, anomalie par catégorie, conseils |
| **Statistiques annuelles** | Les 12 mois : total, nombre de transactions, nécessaire vs évitable, catégorie n°1, plus grosse dépense + records toutes périodes |
| **Transactions** | Recherche floue (arabizi + arabe + français), filtres, date ranges, vue par catégorie, « X sur Y » |
| **Coach IA** | Réponses ancrées sur vos vrais chiffres (briefing calculé côté serveur), darija arabe/latine auto |
| **Budgets & objectifs** | Enveloppes par catégorie avec alertes intelligentes, objectifs d'épargne |
| **Analytics / Journalier** | Séries jour/semaine/mois, calendrier 3 mois, tendances MoM |
| **Sécurité** | Backups automatiques 2 emplacements, miroir navigateur par compte, auto-restore anti-perte |

## Comptes & authentification

- `/` : landing publique → bouton **Try FLOUSSI** → écran **Connexion / Inscription** (3 langues)
- **Inscription** : crée le compte + 13 catégories de base clonées + réglages par défaut — **aucune donnée fictive**
- **Sessions** : cookie `floussi_session` HttpOnly (30 jours), token aléatoire 256 bits, seul son hash SHA-256 est stocké
- **Mots de passe** : scrypt (sel aléatoire par utilisateur, vérification à temps constant) + limiteur de tentatives
- **Isolation** : chaque requête API est scopée par `userId` (transactions, catégories, budgets, objectifs, notifications, réglages, export)
- Le **miroir navigateur** est étiqueté par compte : un appareil partagé ne peut jamais restaurer les données d'un compte dans un autre

## Démarrage

```bash
bun install
cp .env.example .env          # mode local SQLite par défaut
bun run db:push               # crée le schéma (script safe : snapshot avant/après)
bun run dev                   # http://localhost:3000
```

Mode cloud (recommandé) : suivre `TURSO-SETUP.md`, puis :

```bash
TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… bun scripts/turso-activate.ts
```

> Comptes : créez le vôtre via **Inscription** (l'application de production refuse toute injection de démo — l'endpoint `/api/seed` est désactivé).

## Déploiement Vercel

L'app se déploie telle quelle sur Vercel — il faut seulement **les deux variables Turso** dans
*Settings → Environment Variables* (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`), sinon aucune donnée
ne se charge. Guide complet + dépannage : **`DEPLOY-VERCEL.md`**. Vérification après deploy :
ouvrez **`/api/health`** → `"storage": "turso"` = connecté.

## Stack & architecture

```
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · framer-motion
Prisma + SQLite/Turso (driver adapter libsql) · TanStack Query · Zustand · Recharts · z-ai-web-dev-sdk (coach)
```

```
src/
  app/            # page unique « / » (gate landing ↔ app) + 25 routes API
  components/     # vues produit, landing/, ui/, auth-view, stats-view…
  lib/            # auth (scrypt/sessions), analytics, intelligence, i18n ×3, cache, persistence
prisma/           # schéma : User, Session, Transaction, Category, Budget, SavingGoal, AppNotification, Settings
```

## Modèle de données (résumé)

`User` (1,N) → Transaction · Category · Budget · SavingGoal · AppNotification · Session · Settings (1,1)
`Category` (1,N) → Transaction · Budget. Unicité `slug`/`categoryId`/`dedupeKey` **par utilisateur**. Suppression en cascade depuis `User`.

## Performance & confidentialité

- Cache TTL serveur (lectures agrégées) + clés de cache **par utilisateur**
- Vues lourdes en `dynamic()` + warm-up idle, skeletons partout, animations `prefers-reduced-motion`-safe
- Vos données restent dans **votre** base (locale ou Turso) — aucun tiers, aucun chiffre inventé : le coach cite uniquement les faits calculés de votre historique

© 2026 Floussi · Made in Morocco 🇲🇦
