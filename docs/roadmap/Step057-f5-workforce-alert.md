# Step057 — F5 : alerte staffing, information déplacée et cause actionnable

**Type : présentation/analyse. Aucun changement de mécanique, d'équilibrage,
de format de sauvegarde ou d'architecture.**
Baseline : `226a3c3` ; le working tree portait déjà Step056 (non committé).

---

## A. Problème

Dès l'ouverture D2, l'alerte `Workforce: 10/12 workplaces staffed` s'affiche
en permanence : 12 postes pour 10 colons. Le fait est vrai, mais
**structurel** (il faut des résidences et de la nourriture pour grandir), il
ne masque rien et n'a aucun remède « état-only » — Step053 l'avait donc
différé faute de correction sûre démontrée, en attendant un signal humain.

## B. Décision

Demande : rendre l'alerte **actionnable ou silencieuse sans perdre
l'information**. Réponse en trois points, sans toucher aux règles :

1. **L'information devient un fait permanent** du panneau de stats :
   ligne `Workforce` → `10 / 12 staffed`. Zéro perte, zéro bruit, zéro
   répétition d'alerte à chaque tick.
2. **L'alerte ne porte plus que sur une cause réparable** : un bâtiment
   opérationnel qu'aucune route ne dessert → `Workplaces: N without road
   access`. C'est un état (pas une instruction), il est absent de
   l'ouverture D2, donc le début de partie est silencieux ; il apparaît
   quand le joueur a réellement laissé un chantier hors réseau.
3. **La pénurie structurelle ne produit plus d'alerte** : elle reste
   lisible dans la ligne stats, l'overlay Emploi et l'inspection par
   bâtiment (rang + état). Le détail par bâtiment n'est pas dupliqué dans
   les alertes.

## C. Modifications

| Fichier | Contenu |
|---|---|
| `src/application/queries/staffing.ts` | `unconnected` : postes opérationnels dont la raison est `no-road` (compté depuis les entrées existantes, aucune règle redéfinie) |
| `src/application/queries/analysis.ts` | l'alerte de ratio est remplacée par l'alerte d'accès routier ; commentaire de contrat mis à jour |
| `src/application/queries/stats.ts` | expose `staffedWorkplaces` / `eligibleWorkplaces` (dérivés) |
| `src/app/ui/statsPanel.ts` | ligne permanente `Workforce` → `N / M staffed`, neutre (pas d'alerte implicite par couleur) |
| `tests/staffing.test.ts` | 4 tests de l'alerte réécrits : ratio présent dans les stats et absent des alertes, alerte d'accès émise, silence quand tout est connecté, silence sans colon ; `unconnected` verrouillé |
| `e2e/interaction.spec.ts` | pins mis à jour : `1 / 2 staffed`, absence de `Workforce:`, `1 / 1 staffed` après mothball |

## D. Décisions de détail

- **Sévérité inchangée** (`info`) : une cause réparable mais non critique ne
  doit pas devenir une alarme.
- **Aucune nouvelle alerte par bâtiment** : l'inspection expose déjà
  `staffing · no road access`, et dupliquer chaque cas dans le flux
  d'alertes recréerait le bruit qu'on supprime.
- **Aucun champ persisté** : `unconnected` et le ratio sont dérivés de
  l'état à chaque lecture, comme tout le reste de l'analyse.

## E. Validation (exécutée)

| Check | Commande | Résultat |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | **PASS** |
| Lint | `./node_modules/.bin/eslint .` | **PASS** |
| Unit | `./node_modules/.bin/vitest run` | **PASS — 26 fichiers / 342 tests** (+1) |
| Build | `tsc -p tsconfig.build.json` + `vite build` | **PASS** — app 68,39 kB (21,99 kB gzip) + three 470,93 kB |
| E2E | `playwright test` (35 specs) | **PASS — 35/35** (3,2 min), cache bibliothèques `LD_LIBRARY_PATH` + Vite direct (`pnpm` cassé par `libatomic`) |

## F. Différé (assumé)

- **F2/F3** : visuel (V2-V3-V5, cadrage Step042) ;
- **V2 logistique**, événements conditionnels, contenu Âge 4+ : hors scope.

## G. État Git

`main` à `226a3c3` + Step056 et Step057 **non committés**.
