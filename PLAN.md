# MaitreMot — plan de développement

Jeu de lettres en français pour iOS et Android, aux règles proches du jeu de
lettres classique sur grille : solo contre l'ordinateur d'abord, puis parties
en ligne en temps réel entre amis.

## Décisions prises

| Sujet                   | Choix                                                        |
| ----------------------- | ------------------------------------------------------------ |
| Langue du jeu           | Français uniquement                                          |
| Dictionnaire            | Liste libre Grammalecte, accents ignorés (É → E)             |
| Définitions             | Wiktionnaire (CC BY-SA), uniquement pour les mots déjà joués |
| Mot invalide            | Refusé immédiatement, le coup n'est pas joué                 |
| Chronomètre / duplicate | Non                                                          |
| Solo                    | 1 joueur contre 1 à 3 IA (3 niveaux)                         |
| Multijoueur             | 2 à 4 joueurs, temps réel, entre amis (invitation par code)  |
| Communication           | Chat texte, puis audio / vidéo                               |
| Diffusion               | Entre amis (TestFlight / APK), stores plus tard              |
| Langage                 | TypeScript partout, code et commentaires en anglais          |

## Règles

- Grille 15×15, disposition de cases bonus propre à MaitreMot
  (8 mot ×3, 16 mot ×2, 12 lettre ×3, 28 lettre ×2), départ au centre.
- 102 jetons dont 2 jokers (0 point), 7 lettres par chevalet.
- Premier mot sur la case centrale, au moins 2 lettres ; ensuite chaque mot
  touche les lettres déjà posées, en ligne, sans trou.
- Tous les mots formés comptent ; un bonus ne sert qu'au tour où l'on pose dessus.
- +50 points si l'on pose ses 7 lettres.
- Échange possible s'il reste au moins 7 jetons dans le sac ; passe possible.
- Fin : un joueur vide son chevalet sac vide (il gagne les points restants des
  autres), ou deux tours de table complets sans mot posé. Chacun déduit ses lettres restantes.

## Dictionnaire

- Source : le dictionnaire orthographique de Grammalecte v7.5 (« classique »,
  paquet npm `dictionary-fr`, licence MPL 2.0). `tools/dictionary/build.ts`
  génère toutes les formes (pluriels, féminins, conjugaisons) à partir des règles Hunspell.
- Sont exclus : noms propres, sigles, symboles d'unités (mm, kcal…), mots avec chiffres, trait d'union ou apostrophe,
  mots de 1 lettre ou de plus de 15 lettres.
- Différences avec les listes officielles des clubs : quelques mots rares absents
  (ex. KA), quelques mots présents en plus. On pourra ajouter une liste de
  corrections maison si besoin.
- **Dictionnaire maison** : `packages/lexicon-fr/house-words.txt` (mots acceptés en plus,
  ex. KA, KAT, SKYR) et bouton « Ajouter » dans le jeu quand un mot est refusé.
- Chaque mot du plateau retrouve ses graphies réelles et ses lemmes
  (ETE → été : été, être), pour chercher la définition sur le Wiktionnaire.

## IA

- Le générateur trouve **tous** les coups légaux (vérifié contre une recherche
  exhaustive) en ~7 ms en médiane, ~0,5 s au pire (deux jokers) sur PC.
- **Expert** : meilleur score + valeur des lettres gardées (joker, S, équilibre voyelles/consonnes).
- **Moyen** : un coup au hasard entre 55 % et 85 % du meilleur score.
- **Facile** : un coup court (≤ 4 lettres posées) entre 20 % et 50 % du meilleur score.
- Moyennes sur 30 parties à trois : facile ≈ 100 pts, moyen ≈ 240 pts, expert ≈ 415 pts.

## Architecture

```
apps/mobile/       application Expo / React Native
packages/engine/   moteur de jeu en TypeScript pur (règles, score, DAWG, IA)
packages/lexicon-fr/ données du dictionnaire français (générées)
supabase/          (phase 2) base de données et fonctions serveur
tools/             scripts (construction du dictionnaire...)
```

Le moteur ne dépend d'aucune interface : il est testé seul et sera réutilisé
tel quel par le serveur en phase 2 pour valider les coups.

## Étapes

### Phase 1 — solo contre l'IA

- [x] **1. Mise en place** : monorepo npm, Expo, TypeScript strict, ESLint, Prettier, Vitest, CI GitHub
- [x] **2. Moteur de règles** : plateau, sac, chevalets, placement, mots formés, score, échange, passe, fin de partie
- [x] **3. Dictionnaire** : dictionnaire Hunspell de Grammalecte déplié (toutes les formes) → DAWG compact (440 Ko), lexique forme accentuée → lemme (550 Ko), chargement dans l'app
- [x] **4. IA** : générateur de coups (Appel & Jacobson), 3 niveaux, 1 à 3 IA par partie
- [x] **5. Interface** : accueil (1 à 3 IA, niveaux), plateau zoomable, glisser-déposer (case visée surlignée, aimantation sur la case libre la plus proche) ou toucher, curseur de saisie (→/↓), propositions pour compléter le mot depuis le chevalet, joker, aperçu du score, échange, passe, historique, fin de partie
- [ ] **5 bis. Définitions** : fiche Wiktionnaire au toucher d'un mot joué, cache
- [ ] **6. Sauvegarde** : reprise de partie, statistiques
- [ ] **7. Diffusion** : builds EAS, TestFlight et APK

### Phase 2 — multijoueur entre amis

- [ ] **8. Comptes** : Supabase Auth, profils, amis par code d'invitation
- [ ] **9. Parties en ligne** : coups validés côté serveur, Realtime, présence, reconnexion
- [ ] **10. Chat texte**
- [ ] **11. Audio / vidéo** : LiveKit (WebRTC)
- [ ] **12. Notifications push**
