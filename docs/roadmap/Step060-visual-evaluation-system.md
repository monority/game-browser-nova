# Step060 — Système d'évaluation complet (simulation + rendu)

**Type : outillage + une addition de diagnostic. Aucune règle de jeu modifiée.**

## Problème

Step059 donnait un cockpit headless : je pouvais jouer et juger l'économie,
mais tout ce qui relève de la présentation (caméra, rendu, erreurs console,
taille du canvas) restait hors de portée. Deux angles morts en découlaient :
un écran cassé pouvait passer pour une partie saine, et toute question de
cadrage se réglait « à l'estime ».

## Livré

| Élément | Rôle | Axe |
|---|---|---|
| `src/renderer/renderer.ts` | `cameraView()` exposé par le renderer (`CameraView` : position, cible, radius, phi, theta, fov, aspect) | rendu |
| `src/app/diagnostics.ts` | `__nova.cameraView()` ajouté à la surface stable (additif) | rendu |
| `src/app/boot.ts` | câblage vers le renderer courant (survit à un `load`) | rendu |
| `tools/agent/observe.mjs` | sonde Playwright : démarre Vite, attend `__nova`, capture tick 0 et tick N (8×), relève canvas / draw calls / géométries / avgUpdate / caméra / erreurs console, écrit deux PNG + `observe.json` | rendu |
| `tools/agent/evaluate.mjs` | entrée unique : scénario JSONL (simulation) **et** sonde (rendu), un seul `PASS`/`FAIL`, rapport `evaluate.md` | les deux |
| `tools/agent/scenarios/opening.jsonl` | scénario par défaut (init → 120 → assess → 180 → assess) | simulation |
| `package.json` | scripts `observe` et `evaluate` | — |

La sonde juge des **faits**, pas du goût : console propre, canvas non nul,
draw calls > 0, caméra exposée. Une apparence ratée reste un jugement
humain — mais elle a désormais des captures et une caméra chiffrée.

## Mesures réelles (2026-11-11)

```
node tools/agent/evaluate.mjs --ticks 60     → EVAL=0 (PASS)
  simulation : t=120 critical, t=300 critical (pollution 100, q0 ; food pinnée à 120/120)
  rendu      : canvas 1280×800 · drawCalls 634 · geometries 598 · avgUpdate 4.67 ms
               camera radius 26.4 · phi 0.982 · theta 0.785 · target (12.0, 12.0)
  artefacts  : playtest/artifacts/agent/{tick-0.png,tick-60.png,evaluate.md}
```

Le premier échec réel de la sonde valait la peine d'être corrigé, pas
contourné : Vite lié à `localhost` atterrissait sur `::1` et la sonde en
IPv4 ne le joignait jamais → `observe.mjs` force maintenant `--host
127.0.0.1` et adresse la sonde en IPv4 littéral.

## Premier test de jeu réel (2026-11-11)

Le cockpit a servi pour de vrai : jouer l'ouverture livrée et la débloquer.
Ce qui a été mesuré, pas supposé :

1. **L'ouverture est bloquée telle quelle.** 2 ateliers actifs émettent
   +2 pollution/tick, aucun parc n'absorbe → qualité 0, admission fermée,
   population épinglée à 10/10 de t=120 à t=300.
2. **Deux parcs suffisent.** −4/tick contre +2 : la pollution décroît de
   2/tick, l'admission rouvre, la population repart 10 → 15.
3. **L'âge 1 est arithmétiquement infaisable avec des ateliers actifs.**
   Un slot par travailleur : `f + w + 2 = P`, avec `2f+1 ≥ P` (nourriture)
   et `2w ≥ P` (eau) → `f ≥ w+1` et `w ≥ f+2`, contradiction. Il faut
   soit mettre les ateliers en sommeil (on perd 4 $/tick de commerce),
   soit prendre `cropRotation` (âge 1, 50 $) qui passe la ferme à 3/tick.
4. **L'affectation est positionnelle, pas économique.** Ordre canonique
   (y puis x) : les ateliers `(7,1)`/`(9,1)` passent **avant** les puits
   de la ligne 2 → 6 puits tenus sur 8, eau à 0/15 servi. Ce n'est pas un
   manque de bâtiments, c'est un ordre de priorité.
5. **Ouvrir les logements avant la capacité tue.** 6 résidences posées
   sans ferme/tech → pop 15 pour 11 nourritures, effondrement puis
   équilibre de famine à pop 11 / food 0 (mesuré, `-1/tick`).

Ligne gagnante enregistrée dans `tools/agent/scenarios/balanced.jsonl`
(tech → parcs → eau → lits, avec une route partagée par deux puits et des
achats étalés pour que la taxe finance la suite) :

```
verdict=HEALTHY   t=540 et t=660
pop 16/16 · money 587 (net +3/tick) · food 120 +0 · water 27 +0
alerts: none · pollution 0 (q100, net -2) · workforce 15/15
```

## Vérification

- `tsc --noEmit` PASS, `eslint .` PASS (globals Node + navigateur pour les
  callbacks `page.evaluate`), `vitest run` 342 tests PASS ;
- `observe.mjs` : PASS, deux PNG écrits (180–187 kB, donc rendus non vides) ;
- `evaluate.mjs` : PASS complet, code de sortie 0 ;
- `run.mjs --script tools/agent/scenarios/balanced.jsonl` : `EXIT=0`,
  `verdict=HEALTHY`, aucun avertissement ;
- `evaluate.mjs --script tools/agent/scenarios/balanced.jsonl` : PASS.
- E2E : relancé après la modification de `src/` (surface `__nova` additive).

## Limites assumées

- Les captures ne sont pas interprétées par l'outil : il les produit, il ne
  les note pas.
- Le scénario par défaut décrit l'ouverture livrée, sans intervention : il
  documente l'état réel, il ne cherche pas à « gagner ».
- `DEFAULT_CONFIG` reste une copie de `src/app/boot.ts` (dérive notée).
