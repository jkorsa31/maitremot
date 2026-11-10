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

## Version web en ligne (Vercel)

Le fichier `vercel.json` décrit la construction : Vercel installe le projet,
construit la version web de l'app (`expo export --platform web`) et publie
`apps/mobile/dist`. Chaque push sur `main` met le site à jour.

Pour l'essayer en local : `cd apps/mobile && npx expo export --platform web`,
puis servir le dossier `dist` avec n'importe quel serveur statique.

## Organisation du code

| Dossier           | Rôle                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` | Moteur de jeu en TypeScript pur : règles, score, dictionnaire, IA. Chaque fichier commence par un commentaire qui explique son rôle ; `src/index.ts` donne la vue d'ensemble. |
| `apps/mobile`     | Application Expo / React Native : écrans dans `src/app` (Expo Router), composants dans `src/components`, logique de partie dans `src/game`.                                   |
