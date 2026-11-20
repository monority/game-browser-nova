# Step068 — Réserve alimentaire (doctrine du gouverneur)

**Date :** 2026-11-13 · **HEAD :** `34690c0` (aucun commit, aucun push) ·
**Précédents :** [`Step067`](Step067-food-preservation.md) (mécanique de
conservation) et [`Step056`](Step056-food-preservation-design.md) (conception).

## 1. Décision appliquée

Ancienne doctrine (Step056/Step065) : **équilibre exact** entre production et
consommation, `fermes = ceil(pop / rendement)`. Elle n'a plus de point fixe
depuis Step067 : `S* = (P(1−r) − C)/r` avec `P = C` vaut **zéro**, donc la
colonie vivait sur la frontière de famine (une mort et une admission par tick,
alerte permanente — mesuré sur les trois parcours livrés et sur le gouverneur,
2026-11-13).

Nouvelle doctrine : **couvrir la consommation, compenser la conservation et
tenir une réserve exprimée en ticks d'autonomie.**

```
S_next = (S + P)(1 − r) − C          production, conservation, puis consommation
S*     = (P(1 − r) − C) / r
P(R)   = (C + r·R) / (1 − r)         production pour tenir la réserve R
R      = C · T                        T ticks d'autonomie
```

`T = 5` (`FOOD_RESERVE_TICKS`), justifié par mesure au §3. Le calcul est
arrondi **en nombre entier de fermes** : le plan énumère les équilibres
réalisables `S*(k)` et prend **la plus petite réserve ≥ cible**, jamais un plan
qui déborde le grenier ; à défaut, la plus grande réserve possible sous le
plafond. La granularité est réelle et **rapportée**, pas masquée : une ferme
vaut 2–4 nourriture/tick, soit **32 à 130 unités de stock** à 3 %.

## 2. Implémentation

| Fichier | Changement |
|---|---|
| `src/domain/storage/reserve.ts` (nouveau) | Loi pure : `planFoodReserve`, `foodProductionForReserve`, `foodEquilibriumStock`, `FOOD_RESERVE_TICKS = 5`, `FOOD_TRIAGE_TICKS = 2`. Ne réimplémente ni le taux (constante de `src/content/conservation.ts`), ni les rendements (`foodPerFarm`), ni le plafond (`foodCapacity`). |
| `tests/selfplay.governor.ts` | Fermes alignées sur `plan.farms` (remplace `ceil(pop/yield)` **et** le repos « food > pop·4 + 16 », qui se battaient) ; seuil de triage `food < pop·4 + 16`/`pop + 4` → `food < pop × 2` ; entrepôt demandé quand `capacityShort` et que la réserve atteinte reste sous 80 % de la cible. |
| `tools/agent/scenarios/balanced.jsonl` | +1 ferme (6 = 19 nourriture pour 16), −1 parc (le second n'était que de l'entretien : un parc tient l'air à net 0 face aux 2 ateliers). |
| `tools/agent/scenarios/age2.jsonl` | Même arc ; achat des technologies d'âge 2 étalé (`tick 60` entre les deux) pour rester dans la trésorerie sans déplacer le jalon t=780. |
| `tools/agent/scenarios/age3.jsonl` | Même arc ; le parc supplémentaire arrive avec le 3ᵉ atelier (sinon pollution 100). |
| `e2e/simulation.spec.ts` | Fixture environnementale : `cropRotation` + 1 ferme + 3 puits, `food 120`, `water 80`, pop 16 (§6). |
| `tests/food-reserve.test.ts` (nouveau) | 11 tests de la doctrine (§7). |

Rien n'a été touché : taux de 3 %, `SAVE_VERSION` 19, phases du tick, seuils de
progression, rendements, technologies, bâtiments, rationnement, système
économique.

## 3. Le choix de `T = 5` (mesuré, pas supposé)

Équilibres réalisables (`S*`) et autonomie réelle par population, sans entrepôt
(plafond 120), mesurés par la loi et vérifiés par simulation entière
(`floor` + reliquat, 4 000 ticks, convergence exacte) :

| pop | rendement | fermes (plan) | production | `S*` | autonomie |
|---|---|---|---|---|---|
| 10 | 2 | 6 | 13 | 87 | 8,7 ticks |
| 12 | 3 | 5 | 16 | 117 | 9,8 ticks |
| 16 | 3 | 6 | 19 | **81** | **5,06 ticks** |
| 18 | 3 | 7 | 22 | 111 | 6,2 ticks |
| 22 | 3 | 8 | 25 | **75** | **3,4 ticks** |
| 24 | 3 | 9 | 28 | 105 | 4,4 ticks |
| 24 | 4 | 6 | 25 | 8,3 | 0,35 ticks → **entrepôt requis** |

- **`T = 2`** laisse la colonie dans la bande de triage (2 ticks) : à pop 22 le
  plan retient 44,7 unités, soit 2,03 ticks — un événement suffit à repasser
  sous le seuil.
- **`T = 5`** est atteignable sans entrepôt jusqu'à pop 24 en rendement 3, et
  c'est la plus petite cible qui ne retombe jamais sous 3 ticks sans bâtiment.
- **`T = 10`** exige au moins un entrepôt dès pop 13 et deux à pop 16 (10 × 16 =
  160 > 120) ; comme une branche de ferme fait sauter l'équilibre de 32 à 130
  unités, la cible est en pratique inatteignable sans empiler les entrepôts.
  Mesuré : pop 16, `T = 10` → `capacityShort`, et même avec un entrepôt le plan
  reste à 81 faute de branche disponible.

## 4. Les trois parcours livrés (restaurés)

Pipeline réel (`tools/agent/run.mjs` → `stepSimulation`), mêmes commandes que
les fichiers livrés.

| Parcours | Avant Step067 | Après Step067 | **Step068** |
|---|---|---|---|
| `balanced` t=540 | HEALTHY | **CRITICAL** (grenier 0, 15 non nourris) | **HEALTHY** : pop 16/16, argent 592, **food 78** (4,9 ticks), eau 25, pollution 0, 16/16 staffés |
| `balanced` t=660 | HEALTHY | HEALTHY intermittent (food 1) | **HEALTHY** : pop 16/16, argent 952, **food 81** (5,1 ticks) |
| `age2` t=780 | HEALTHY, 4 jalons faits | **CRITICAL** (16 non nourris) | **HEALTHY** : âge 2, pop 16/16, argent 1152 (+5/tick), food 81, jalons **none**, `canAdvanceAge=true` |
| `age3` t=1140 | HEALTHY, money 3319 | **CRITICAL** (22 non nourris) | **HEALTHY** : pop 22/22, argent 3295 (+7/tick), food 75 (3,4 ticks), eau 15, pollution 0 (net −1), 22/22 staffés |
| `age3` t=1141 | age3 HEALTHY | CRITICAL | **age3 HEALTHY**, jalons none |

Ticks de référence, objectifs et critères inchangés. Deux adaptations ont été
nécessaires et sont **mesurées**, pas décoratives (§5).

## 5. Différences de parcours, documentées

1. **Une ferme de plus** : c'est la doctrine elle-même (6 fermes = 19 pour 16).
   Elle coûte 25 $ et 1/tick d'entretien. Sans elle, aucune réserve n'est
   positive : à 5 fermes la production vaut exactement la consommation.
2. **Un parc de moins** : le second parc absorbait 2/tick pour un besoin déjà
   couvert par le premier (net 0, qualité 100). Son entretien (1/tick) valait
   600 $ sur 300 ticks, exactement ce qui manquait pour la milestone
   `tre600` de l'âge 2, compte tenu de l'entretien de la ferme de réserve.
   Preuve par A/B : avec 2 parcs, t=780 → argent 463 (jalon `tre600` en
   attente) ; avec 1 parc, 1152 et jalons faits. L'air reste propre dans les
   deux cas.
3. **Technologies étalées** : la facture d'âge 2 (4 techs, 475 $) ne tenait plus
   dans la trésorerie à t=660 (383 $). Les deux techs d'âge 2 sont achetées de
   part et d'autre de `tick 60`, ce qui **ne déplace aucun tick de référence**
   (t=780, t=1140, t=1141).
4. **Un parc à l'âge 3** : le 3ᵉ atelier ajoute +1 pollution ; sans parc
   supplémentaire, qualité 0 et verdict CRITICAL (mesuré). Le parc est construit
   avec l'atelier.

Ces quatre points sont des adaptations de **ligne de jeu** (le parcours),
jamais des critères : les jalons, les ticks et les seuils restent ceux d'avant.

## 6. Fixture E2E environnementale

`simulation › environment` forçait 14 habitants sur les 5 fermes d'ouverture
(11 nourriture/tick). Depuis Step067 cette colonie meurt de faim : la famine
retire un colon par tick, la population retombe à 10, les 5 fermes + 5 puits
absorbent alors tous les ouvriers et **les ateliers ne sont plus staffés** —
or depuis Step064 un émetteur non staffé ne pollue pas. Le test mesurait donc
une famine, plus la pollution (A/B : passe en 5,2 s sur le code d'avant).

Fixture adaptée, assertions intactes : `cropRotation` (3 nourriture/ferme),
1 ferme et 3 puits supplémentaires, `food 120`, `water 80`, pop 16 → 19
nourriture pour 16 bouches, 16 eau pour 16, et 17 postes pour 16 habitants (un
poste non staffé, sans effet : il faut ≥ 1 atelier staffé pour émettre, il y en
a 2). Mesure : le test passe en **4,7 s**, pollution 0 avec les parcs, qualité
< 100 après leur retrait.

## 7. Tests et validation

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` | PASS |
| `eslint .` | PASS |
| `vitest run` | **27 fichiers, 219 tests, 219 verts** (208 avant + 11 doctrine) — 4,7 s |
| 7 guardrails (`tests/selfplay.test.ts`) | **7 verts** (2 l'étaient pas) |
| 3 parcours livrés | **3 verts** aux ticks de référence (§4) |
| E2E `simulation.spec.ts` | **2/2 verts** (dont `environment`, 4,7 s) |
| `build` | PASS (voir §9) |

Les 11 tests de doctrine (`tests/food-reserve.test.ts`) : production jamais
égale à la consommation (7 populations × 3 rendements), réserve tenue par le
vrai tick (convergence à 81 ± 4, jamais zéro), démonstration de l'ancien
équilibre exact qui meurt, réserve qui croît avec la population, croissance
réelle (6 → 12 habitants, besoins doublés, réserve reconstruite), grenier
saturé (le plan ne change pas et ne demande pas de ferme de plus), aucun plan
qui déborde, entrepôt demandé quand la cible ne tient pas, récupération depuis
un grenier vide sans perte, pas de surproduction, déterminisme
sauvegarde/chargement.

## 8. Équilibrage mesuré

- **Production** : 19/tick pour 16 habitants (5 ticks de réserve), 25 pour 22.
- **Pertes de conservation** : à l'équilibre, `r·S*` = 2,4/tick à pop 16 — soit
  exactement le surplus laissé par la doctrine ; rien n'est perdu au plafond
  (`lost at cap/tick` = 0 dans les trois parcours).
- **Saturation** : aucun parcours n'atteint 120 ; `capacityShort` ne se déclare
  jamais (sauf pop 24 en rendement 4, testé par unité).
- **Surproduction** : bornée par construction (pas de plan au-dessus du
  plafond) ; le cas de granularité extrême (pop 12, 117/120) est documenté, pas
  corrigé — il reste sous le plafond et ne détruit rien.

## 9. Limites et questions ouvertes

- Le taux de 3 % reste **expérimental** : il n'est plus bloqué par la doctrine
  (7/7 guardrails), mais aucun réglage fin n'a été fait.
- `T = 5` est une cible, pas une garantie : la granularité fait osciller
  l'autonomie réelle entre 3,4 et 9,8 ticks selon la population.
- Le gouverneur est l'outil de test (`tests/`), pas du code produit : le jeu ne
  construit rien tout seul, `plan` (cockpit) ne connaît pas encore la doctrine
  et peut donc surestimer la capacité d'une colonie à l'équilibre exact.
- `docs/roadmap/Step022`, `Step035`, `Step056`, `Step065`, `Step067` et
  `docs/audits/*` gardent leurs formulations d'origine : ce sont des rapports
  historiques, pas des règles vivantes.
