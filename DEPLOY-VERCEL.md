# Floussi — Déployer sur Vercel (guide pas-à-pas)

Ce guide résout et prévient le problème classique **« l'app se déploie mais aucune donnée ne se charge »**.

## Pourquoi « pas de données » après déploiement ?

Floussi stocke vos données dans **votre base Turso (cloud)**. Sur votre machine, un fichier
d'identifiants local (`db/turso-vault.json`) permet la connexion automatique — mais il est
**volontairement exclu** du projet livré (secret personnel). Sur Vercel, si les variables
d'environnement ne sont pas configurées, l'application retombe sur un SQLite local qui n'existe
pas sur les serveurs Vercel → **toutes les API répondent sans données**.

La règle : **sur Vercel, les identifiants Turso doivent être dans les Environment Variables.**

## Étape 0 — Vos identifiants Turso (2 minutes)

Si votre base Turso existe déjà (c'est le cas si vous utilisiez l'app avec le stockage « Cloud Turso ✓ ») :

1. Ouvrez **https://app.turso.tech** → votre base (ex. `floussi`).
2. Onglet **Overview** → copiez l'**URL** : `libsql://floussi-xxxx.turso.io`
3. Onglet **Tokens** → **Create Token** → copiez le token (commence par `eyJ…`).

> Pas encore de base ? Suivez d'abord `TURSO-SETUP.md`, puis créez les tables et vos compte
> depuis l'app en local (`bun run db:push` ne fonctionne que sur le fichier local ; sur Turso,
> le schéma est créé par l'app/scripts déjà utilisés). Le plus simple : vos données actuelles
> sont DÉJÀ dans Turso — il suffit de connecter Vercel à la même base.

## Étape 1 — Mettre le code sur GitHub

```bash
unzip floussi-project-2026.zip -d floussi && cd floussi
git init && git add -A && git commit -m "Floussi"
git branch -M main
git remote add origin https://github.com/<votre-compte>/floussi.git
git push -u origin main
```

> `.gitignore` est déjà configuré : `.env`, `db/`, backups et secrets ne partiront jamais sur GitHub.

## Étape 2 — Importer dans Vercel

1. **https://vercel.com/new** → **Import Git Repository** → sélectionnez `floussi`.
2. Framework Preset : **Next.js** (auto-détecté). Ne changez ni Build Command ni Output.
3. **Avant de cliquer Deploy** → dépliez **Environment Variables** et ajoutez :

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://floussi-xxxx.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJ…` (votre token) |

> Variante acceptée : une seule variable `DATABASE_URL` = `libsql://floussi-xxxx.turso.io?authToken=eyJ…`
> (le token est extrait automatiquement). `TURSO_*` reste prioritaire si les deux sont présents.

4. **Deploy**. Le build exécute `prisma generate && next build` automatiquement.

## Étape 3 — Vérifier le déploiement

Ouvrez **`https://<votre-app>.vercel.app/api/health`** :

```json
{
  "ok": true,
  "storage": "turso",        ← doit être "turso"
  "creds": "env",
  "latencyMs": 42
}
```

- `storage: "turso"` + `ok: true` → vos comptes et transactions s'affichent, connectez-vous normalement.
- `storage: "local"` + `warning: …` → les variables sont manquantes/mal orthographiées :
  vérifiez l'orthographe **exacte** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`), pour **tous les
  environnements** (Production, Preview, Development), puis **Redeploy**.

## Étape 4 — Connectez-vous

Vos comptes utilisateurs vivent dans Turso : utilisez **le même email / mot de passe** que
dans l'app locale. Les données que vous voyiez en local sont les mêmes (une seule base cloud).

## Le bouton « Essayer le compte démo »

Le compte démo (1 clic, sans inscription) vit dans la **même base Turso** : il se crée tout
seul au premier clic et se remplit d'un jeu de données d'exemple (~230 transactions) à chaque
connexion. S'il ne marche pas sur votre déploiement :

| Symptôme | Cause | Fix |
|---|---|---|
| Le bouton affiche « App non connectée à sa base de données » | Env vars Turso absentes sur Vercel | Étape 2 → ajouter les 2 variables → Redeploy → `/api/health` doit dire `storage: "turso"` |
| « La démo démarre — réessayez » | Cold start serverless + seed en cours (rare) | Réessayer quelques secondes plus tard — le 2ᵉ clic passe |
| « Trop de tentatives » | Rate-limit anti-abus (10 clics / 15 min / IP) | Attendre quelques minutes |
| Rien ne se passe, erreur réseau dans la console | Fonction coupée par le timeout | Corrigé : la route démo demande explicitement `maxDuration = 60` — redéployez la dernière version du code |

> Le démo est isolé par `userId` : personne ne peut toucher vos vraies données depuis le
> compte démo, et l'email `demo@floussi.app` n'est pas registrable.

## Dépannage

| Symptôme | Cause probable | Fix |
|---|---|---|
| Aucune donnée, `/api/health` → `storage: "local"` | Env vars absentes ou mal nommées | Ajouter `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` → Redeploy |
| `/api/health` → `ok: false` | URL/token invalide ou base en pause | Recréer un token (Tokens → Create Token), vérifier l'URL |
| « You don't have an account » avec le bon email | Ce n'est pas la même base Turso | Vérifier que l'URL pointe vers la base utilisée par l'app locale |
| Le coach IA répond « indisponible » | Le service du coach (z-ai) requiert des identifiants dans votre environnement | Toutes les autres fonctions marchent ; le coach se rattrape proprement |
| Le build échoue sur `prisma generate` | Installation incomplète | Vérifier que `prisma` est bien dans `dependencies` (c'est le cas) |

## Notes techniques

- `next.config.ts` : `output: "standalone"` est **désactivé automatiquement sur Vercel**
  (détecté via `process.env.VERCEL`) — c'est le mode supporté par la plateforme. En local,
  `bun run build && bun run start` continue de produire/serveur standalone.
- `maxDuration` des fonctions = 60 s (compatible plan Hobby).
- Le Service Worker (PWA) est en **network-first** partout : aucune donnée périmée n'est servie
  après un déploiement.
- Sécurité : le cookie de session passe en `Secure` automatiquement en HTTPS (Vercel) ;
  le rate-limit de connexion reste actif.
