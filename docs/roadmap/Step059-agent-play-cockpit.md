# Step059 — Agent play cockpit (jouer et évaluer sans navigateur)

**Type : outillage interne. Aucune règle de jeu modifiée.**

## Problème

Jusqu'ici, pour jouer la partie et juger son état, il fallait écrire un
test Vitest jetable (`tests/_scratch.test.ts`, supprimé après usage) ou
passer par Playwright en cliquant le canvas. Les deux sont lents et ne
donnent aucun verdict : on lit des assertions, pas une situation de jeu.

## Livré

| Fichier | Rôle |
|---|---|
| `tools/agent/run.mjs` | charge le CLI en TypeScript via `vite.createServer().ssrLoadModule` — résout l'alias `@/` sans build ni dépendance ajoutée |
| `tools/agent/play.ts` | le poste de pilotage : `init`, `tick`, `build`, `do`, `report`, `assess`, `map`, `state`, `save`, `load` |
| `tools/agent/README.md` | protocole, flags, sémantique du verdict |
| `package.json` | script `play` |
| `tsconfig.json` | `tools` ajouté au typecheck |
| `eslint.config.js` | globals Node pour le runner `.mjs` |

Toutes les mutations passent par `applyCommand` / `stepTicks` ; toutes les
lectures composent les requêtes de l'application (`getColonyStats`,
`getResourceSummaries`, `getAlerts`, `getStaffingOverview`,
`evaluateMilestones`). Aucune règle n'est réimplémentée : le verdict ne
peut pas dériver de l'UI.

`assess` répond `healthy` / `tight` / `critical` avec les raisons exactes,
la stagnation en ticks, la timeline récente et les jalons manquants ;
`map` rend la grille ASCII (bâtiments, routes, gisements, terrain).

## Vérification

- `tsc --noEmit` PASS, `eslint .` PASS (rebuild des deux après ajout) ;
- `vitest run` : 342 tests PASS (l'outil n'est pas chargé par la suite) ;
- session réelle exécutée via stdin : `report` → `assess` → `build farm`
  → `tick 120` → `assess` → `save` → `tick 30` → `load` → `map`, sortie
  correcte, `EXIT=0`, et le `load` restaure bien `t=120` (round-trip réel
  du format de sauvegarde).

## Premier constat produit (issu de l'outil)

Sur la partie livrée, sans intervention : au tick 0 la colonie D2 est
`CRITICAL` en apparence (production nulle, le staffing n'arrive qu'à la
fin du tick 1 — le CLI annote désormais ce cas au lieu de le masquer) ;
puis, à partir de ~120 ticks avec les 2 ateliers qui tournent et aucun
parc, la pollution sature à 100 (qualité 0) et **bloque l'admission**.
La population reste à 10/10 alors que la nourriture est pleine et pinnée.
Ce n'est pas un bug de l'outil : c'est la pression de design déjà connue
(Step014/Step056) rendue visible sans écrire de test. À traiter dans le
scope équilibrage/visuel, pas ici.
