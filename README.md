# MaitreMot

Jeu de lettres en français pour iOS et Android. Voir [PLAN.md](PLAN.md) pour les
règles, les choix techniques et l'avancement.

## Prérequis

- Node.js 20 ou plus
- Pour tester sur téléphone : l'app **Expo Go** (iOS / Android)

## Commandes

```bash
npm install              # installe toutes les dépendances (monorepo)
npm run check            # format + lint + typage + tests (comme la CI)
npm test                 # tests unitaires du moteur
npm start -w @maitremot/mobile   # lance l'app (QR code à scanner avec Expo Go, touche w = navigateur)
npm run build:dictionary -w @maitremot/tools   # régénère le dictionnaire
```

## Quelle version ?

En bas de l'écran d'accueil : « Version 1.0.0 · c5d7dc0 · 11/11/2026 », soit le numéro de
version, le commit git à partir duquel l'app a été construite et la date de construction
(voir `apps/mobile/app.config.js`). Deux joueurs ont la même version si le code de
7 caractères est le même ; le dernier commit de `main` est visible sur GitHub.

## Version web en ligne (Vercel)

Le fichier `vercel.json` décrit la construction : Vercel installe le projet,
construit la version web de l'app (`expo export --platform web`) et publie
`apps/mobile/dist`. Chaque push sur `main` met le site à jour.

Pour l'essayer en local : `cd apps/mobile && npx expo export --platform web`,
puis servir le dossier `dist` avec n'importe quel serveur statique.

## Serveur multijoueur (Supabase)

Projet Supabase : voir `supabase/project.json` (URL et clé publique, faites pour être
dans l'app). Le schéma est dans `supabase/migrations`, la logique serveur dans
`packages/server`. Commandes (avec `SUPABASE_ACCESS_TOKEN`, un jeton d'accès personnel
Supabase, et `NODE_USE_ENV_PROXY=1` derrière un proxy) :

```bash
npm run supabase:migrate -w @maitremot/tools   # applique les migrations SQL manquantes
npm run supabase:deploy -w @maitremot/tools    # déploie la fonction serveur « game »
npm run supabase:auth -w @maitremot/tools      # codes à 6 chiffres, e-mails en français
```

Sécurité : chaque joueur ne lit que ses propres lettres (Row Level Security) ;
l'état complet (sac, chevalets) n'est lisible que par le serveur, qui valide
chaque coup avec le même moteur que l'app.

## Organisation du code

| Dossier               | Rôle                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`     | Moteur de jeu en TypeScript pur : règles, score, dictionnaire, IA. Chaque fichier commence par un commentaire qui explique son rôle ; `src/index.ts` donne la vue d'ensemble. |
| `packages/wiktionary` | Récupération et analyse des définitions du Wiktionnaire (API MediaWiki), testées sur de vraies pages.                                                                         |
| `packages/server`     | Arbitre des parties en ligne (fonction serveur Supabase) : invitations, validation des coups, informations cachées.                                                           |
| `supabase`            | Migrations SQL et point d'entrée de la fonction serveur.                                                                                                                      |
| `apps/mobile`         | Application Expo / React Native : écrans dans `src/app` (Expo Router), composants dans `src/components`, logique de partie dans `src/game`.                                   |
