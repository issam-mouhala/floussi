# Floussi — Activer la base de données cloud GRATUITE (Turso)

Vos données restent actuellement dans 4 endroits : la base locale de l'app,
une double sauvegarde automatique sur le disque, et un **miroir complet dans
le navigateur de votre téléphone/PC** (restauration automatique si le serveur
perd tout). Pour une protection **totale** (même si la machine entière est
réinitialisée), connectez la base cloud gratuite **Turso** — vos données
vivront alors sur Internet, indestructibles.

## Étapes (2 minutes, gratuit, sans carte bancaire)

1. Ouvrez **https://app.turso.tech** → créez un compte (GitHub ou email).
2. Créez une base : bouton **Create Database** →
   - Name : `floussi`
   - Location : le plus proche (ex. `fra1`, `cdg1`, `lhr1`)
   - Plan : **Free**
3. Ouvrez la base → onglet **Overview** → copiez l'**URL**
   (ressemble à `libsql://floussi-votrecompte.turso.io`)
4. Onglet ou menu **Tokens** → **Create Token** → copiez le **token**
   (long texte secret).

## Me les envoyer

Collez simplement dans le chat :

```
TURSO_DATABASE_URL=libsql://floussi-votrecompte.turso.io
TURSO_AUTH_TOKEN=eyJ... (votre token)
```

Je m'occupe de tout : création des tables, copie de vos 23 transactions,
bascule de l'app sur le cloud, vérification complète.

## Ce qui change une fois activé

| Avant (aujourd'hui) | Après (Turso activé) |
|---|---|
| Données sur la machine de l'app + miroir navigateur | Données dans le **cloud Turso** + miroir navigateur |
| Survit à un redémarrage / crash du serveur | Survit à TOUT : reset du serveur, redéploiement, effacement du disque |
| Réglages → Stockage : « Local + miroir » | Réglages → Stockage : « **Cloud Turso ✓** » |

Sécurité : seul votre token permet d'accéder à la base. Le plan gratuit Turso
couvre largement un usage personnel (9 Go, des millions de lectures/mois).

> Alternative équivalente si vous préférez : Neon (postgres.neon.tech) ou
> Supabase — mais Turso est le plus simple ici car l'app utilise déjà SQLite.
