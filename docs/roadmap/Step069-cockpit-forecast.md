# Step069 — Alignement du cockpit de prévision sur la simulation alimentaire

**Type :** cohérence simulation / prévisions / UX. **Aucune règle de jeu
modifiée.** La simulation est la source de vérité ; le cockpit la lit au lieu
d'en réimplémenter une seconde version.

## A. État initial

| | |
|---|---|
| Branche | `main` |
| HEAD initial | `34690c0` (inchangé, aucun commit) |
| Modifications préexistantes | 27 entrées de `git status` (Step067 + Step068) — préservées, aucune écrasée |
| Fichiers examinés | `src/domain/storage/reserve.ts`, `spoilage.ts`, `src/content/conservation.ts`, `src/domain/simulation/tick.ts` (phases 2 → 5a → 5b → 6), `src/application/queries/analysis.ts`, `stats.ts`, `src/app/ui/statsPanel.ts`, `src/app/boot.ts`, `tools/agent/play.ts` (`report`, `assess`, `plan`), `tests/analysis.test.ts`, `tests/conservation.test.ts`, `tests/famine-recovery.test.ts`, `tools/agent/README.md` |

### Écarts mesurés (sonde temporaire, seeds réelles, tick réel)

Colonie de référence : pop 19, 6 fermes avec `cropRotation` = **19 nourriture
par tick**, grenier 58/120.

| # | Écart | Mesure |
|---|---|---|
| **D1** | `foodTicksRemaining` répondait `null` (« n'épuise jamais ») alors que le grenier se vidait | tick réel : 58 → 4 en 40 ticks, **0 au tick 46**, population 19 → 18. Le point fixe de `S' = (S + P)(1 − r) − C` vaut `(19·0.97 − 19)/0.03 = −19` : la couverture du besoin ne protège de rien à 3 %/tick |
| **D2** | `plan` annonçait `capacity 19` (= `floor(production)`) | la doctrine finance **16,03** habitants à 5 ticks ; le plan créditait 3 habitants que la conservation tue (+19 %) |
| **D3** | `report` affichait `+0/tick` pendant que le stock perdait 2/tick | il imprimait `balancePerTick` (production − besoin), jamais `netPerTick` |
| **D4** | Aucune alerte dans cette bande | la ligne Food était conditionnée à `balance < 0`, or la balance valait exactement 0 |
| **D5** | Ni `report`, ni `assess`, ni `plan` ne connaissaient la cible de réserve, l'autonomie de la doctrine, la production nécessaire ni `capacityShort` | `planFoodReserve` existait (Step068) mais n'était appelé que par le gouverneur |
| **D6** | Deux bases de calcul concurrentes pour la même perte | `nextFoodSpoilage` (stock d'avant récolte) vs la phase 5a (après récolte) : écart ≤ 1 unité/tick (`r × P`) ; `netPerTick` était une identité arithmétique (`balance − spoilage`), pas le delta du tick |

## B. Décisions techniques

**Cause commune :** le cockpit recalculait une projection linéaire
(`production − besoin`, `stock / déficit`) au lieu d'appliquer la loi du tick.
Le taux de 3 % rend cette approximation fausse dès que le point fixe est
négatif ou que le plafond mord.

**Source de vérité :** une seule loi, déjà écrite, réutilisée.

| Fonction | Module | Rôle |
|---|---|---|
| `foodEquilibriumStock` | `spoilage.ts` (déplacée depuis `reserve.ts`, ré-exportée) | point fixe de la loi de conservation — foyer unique de la formule |
| `projectFoodTick` | `spoilage.ts` (nouvelle) | projection exacte du tick : production → conservation (avec reliquat) → consommation → plafond |
| `foodTicksRemaining` | `spoilage.ts` (corrigée) | compte à rebours ; `null` **si et seulement si** le point fixe est positif |
| `forecastFoodReserve` | `reserve.ts` (nouvelle) | vue réserve : cible, équilibre atteignable, pertes, net exact, production nécessaire, autonomie, statut |
| `foodReserveStatus` | `reserve.ts` (nouvelle) | `deficit` / `storage-limited` / `thin` / `building` / `funded` |
| `foodSustainablePopulation` | `reserve.ts` (nouvelle) | plafond de population financé par une production à la cible de 5 ticks |

**Preuve du `null` :** `S' − S = r(fixed − S)`. Un point fixe positif n'est
jamais franchi (le stock s'en approche), et l'arrondi vers le bas ne retire
jamais plus que la loi — donc un stock que la loi garde vivant ne peut pas
s'épuiser. Inversement `production >= consommation` n'implique rien : c'est la
cause exacte de D1.

**Choix de conception**

- `netPerTick` devient le **delta exact du tick** (reliquat et plafond inclus),
  plus l'identité `balance − spoilage` ; les deux coïncident quand la colonie
  mange tout son besoin sans être au plafond, et l'exact est le seul vrai quand
  elle jeûne ou déborde (scénario 3 ci-dessous : 132 unités détruites au
  plafond que l'identité n'aurait jamais montrées).
- L'alerte Food passe du signe de la balance au **compte à rebours** (D4) ;
  message inchangé, donc aucune régression de formulation.
- Une alerte **info** (jamais `warning`, donc aucun verdict modifié) signale
  une cible de réserve qui ne tient pas dans le grenier.
- La réserve du HUD est une **ligne de statistique** (`reserve 5.1 / 5 ticks ·
  funded`), pas un allongement de la ligne Forecast : mesuré au navigateur, la
  version longue faisait passer la ligne Food de 2 à 3 lignes à 210 px.

## C. Implémentation

| Fichier | Changement |
|---|---|
| `src/domain/storage/spoilage.ts` | `foodEquilibriumStock` (foyer), `foodTicksRemaining` corrigée, `projectFoodTick`, suppression de `nextFoodSpoilage` (approximation pré-récolte, remplacée par la projection) |
| `src/domain/storage/reserve.ts` | `forecastFoodReserve`, `foodReserveStatus`, `foodSustainablePopulation`, `FoodReserveForecast` ; ré-export de `foodEquilibriumStock` |
| `src/application/queries/analysis.ts` | `ResourceForecast.reserve` (food), `netPerTick`/`spoilagePerTick` lus sur la projection, alerte Food ancrée sur le compte à rebours, alerte info de capacité |
| `src/application/queries/stats.ts` | `foodSpoilagePerTick` sur la même projection ; `foodReserveTicks`, `foodReserveTargetTicks`, `foodReserveStatus` |
| `src/app/ui/statsPanel.ts` | ligne `reserve` (danger si `deficit`/`thin`, ok sinon) |
| `tools/agent/play.ts` | `report` : prod / mangé / perdu / net + réserve ; `assess` : bloc `food` complet + `reserve` ; `plan` : capacité via `foodSustainablePopulation`, ligne réserve (cible, grenier, production nécessaire, statut) et `data.food` |
| `tests/cockpit-forecast.test.ts` | nouveau, 21 tests (12 cas unitaires + 5 statuts + cohérence tick à tick) |
| `tests/conservation.test.ts` | l'assertion « couvrir le besoin n'épuise jamais » était fausse : remplacée par la loi (point fixe négatif → 64 ticks ; point fixe positif → `null`) |
| `tools/agent/README.md`, `docs/game/00-GAME-DESIGN-CONTRACT.md` §7.6 | la doctrine, désormais appliquée, et l'interdiction de re-dériver la loi |

**Volontairement non modifiés :** taux de 3 %, ordre des phases, cible de
5 ticks, seuil de triage `food < pop × 2`, rendements, coûts, capacités,
seuils d'âge, technologies, économie, population, sauvegarde v19, scénarios de
référence, seuils des 7 guardrails.

## D. Validation

| Contrôle | Résultat | Détails |
|---|---|---|
| Typecheck (`tsc --noEmit`) | **PASS** | 0 erreur |
| ESLint (`eslint .`) | **PASS** | 0 erreur |
| Tests unitaires (`vitest run`) | **PASS** | 28 fichiers / **240 tests** (219 avant + 21), 4,6 s |
| Tests d'intégration | **PASS** | inclus : `tests/selfplay.test.ts` = les 7 guardrails, `tests/analysis.test.ts`, `tests/famine-recovery.test.ts` |
| Guardrails | **PASS** | 7/7, jalons inchangés (`ready@185, age2@185, pop12@191`, measure-2 `225/231`) |
| E2E | **PASS** | ciblé `accessibility.spec.ts` + `interaction.spec.ts --grep "forecast\|drill"` : **2/2** (6,4 s / 11,8 s, total 19,3 s) |
| Build (`vite build`) | **PASS** | 1,13 s · app 70,80 kB (22,80 gzip) |
| Vérification navigateur | **PASS** | 1440×900 et 1024×640, 0 erreur console, aucun débordement horizontal |

**Navigateur (Playwright, serveur réel, sauvegarde réelle) :**

| Scénario | Lecture du HUD |
|---|---|
| Ouverture livrée (état « équilibre sans réserve suffisante ») | `reserve 2.2 / 5 ticks · thin`, `stock 47 · net -1`, pas d'alerte |
| Voyage `balanced` chargé (t=660, pop 16) | `reserve 5.1 / 5 ticks · funded`, `stock 81 · net +0` |
| Trois fermes mises en veille par le joueur (déficit réel) | `reserve 0.0 / 5 ticks · deficit` (rouge), `stock 0 · net +0 → 0 ticks`, `Food: 0 stock · 7 colonists unfed (−1/tick)` — la population est tombée de 16 à 7 |

À 1024×640 le panneau de gauche défile (`max-height: 60vh`), la ligne `Water`
du Forecast reste atteignable après défilement (`scrollable: true`,
`waterVisibleAfterScroll: true`) et rien ne déborde horizontalement.

## E. Cohérence des résultats (prévision ⇄ simulation)

Trois scénarios déterministes, population épinglée, événements désactivés ; la
projection est lue **avant** chaque tick et le tick doit atterrir exactement
dessus.

| Scénario | Horizon | Stock | Production | Mangé | Perdu (conservation) | Détruit au plafond |
|---|---|---|---|---|---|---|
| Financé (pop 16, 19/tick) | 40 ticks | 40 → 69 | 760 | 640 | 91 | 0 |
| Déficit (pop 19, 19/tick) | 40 ticks | 58 → 4 | 760 | 760 | 54 | 0 |
| Saturé (pop 4, 19/tick) | 30 ticks | 100 → 120 (plafond) | 390 | 120 | 118 | **132** |

Les valeurs prévues et réelles sont **identiques, terme à terme** (assertion
`toEqual` et égalité du stock à chaque tick) : aucune tolérance numérique n'est
nécessaire, donc aucune n'est accordée. L'autonomie annoncée est vérifiée de la
même façon : sur le scénario de déficit, le compte à rebours annoncé (46 ticks)
est exactement le tick où le stock épinglé atteint 0.

Référence de doctrine recoupée : 19/tick pour 16 habitants laisse un équilibre
de **81 unités = 5,06 ticks**, et le tick réel s'y installe (200 ticks,
81 ± 1) — ce qui valide aussi `capacity 16` du plan (la production 19 ne
finance pas 19 habitants).

## F. Limites restantes

- **`autonomyTicks` suppose la population constante.** Si le grenier se vide,
  les habitants meurent avant la fin du compte à rebours : la valeur annoncée
  est une borne sous population épinglée (convention déjà documentée en
  Step054, désormais explicite dans le code).
- ~~**Le plafond de capacité ne modélise pas la pollution**~~ — traité dans le
  suivi ci-dessous : la porte d'admission est désormais lue par `plan`, mais
  elle est **rapportée à côté** du plafond, car elle ne nomme aucune
  population.
- **La granularité d'une ferme reste visible** : `equilibrium` peut dépasser la
  cible de plusieurs dizaines d'unités (3 nourriture/tick ≈ 97 unités de
  réserve). Le statut `building`/`funded` le dit, mais le chiffre n'est pas
  arrondi à la cible.
- **`spoilagePerTick` et la ligne `spoiled/tick`** décrivent maintenant la même
  perte (base après récolte), et non plus la perte « au stock actuel » : un
  écart de ≤ 1 unité avec l'ancienne lecture est attendu et assumé.
- **E2E complet non relancé** : seuls les deux specs touchant le Forecast ont
  été exécutés (AGENTS.md : sous-suite ciblée d'abord).

## G. État Git

- Branche finale : `main`, HEAD final `34690c0` — **aucun commit, aucun push**.
- Modifiés : `src/domain/storage/spoilage.ts`, `src/domain/storage/reserve.ts`,
  `src/application/queries/analysis.ts`, `src/application/queries/stats.ts`,
  `src/app/ui/statsPanel.ts`, `tools/agent/play.ts`, `tools/agent/README.md`,
  `tests/conservation.test.ts`, `docs/STATE.md`, `docs/game/00-GAME-DESIGN-CONTRACT.md`,
  ainsi que les 25 fichiers préexistants de Step067/Step068 (intacts).
- Nouveaux : `tests/cockpit-forecast.test.ts`, ce rapport.
- Artefacts de test supprimés (`dist/`, `test-results/`, `playwright-report/`) ;
  captures et sondes temporaires hors du dépôt.

## Suivi (2026-11-13) — la porte d'admission dans `plan`

**Écart.** `plan` lisait la pollution seulement comme un chiffre (`pollution 80
(q20)`) : une colonie dont l'air ferme la croissance lisait `capacity 9 ·
headroom +3`, c'est-à-dire « construis, ça poussera », alors que
`updatePopulation` refuse toute admission sous `MIN_QUALITY_FOR_ADMISSION = 25`
(exception bootstrap à pop 0). L'alerte du HUD le disait, le cockpit non.

**Décision.** La porte a une seule implémentation, `admissionGate(state)` dans
`domain/environment/environment.ts` (qualité, seuil, `blocked`, `ticksToClose`),
réutilisée par l'alerte « Growth blocked » et par `plan`. Elle n'abaisse aucun
plafond : la pollution est un **verrou binaire**, elle ne nomme aucune
population, contrairement à la nourriture, à l'eau et au logement. `plan` la lit
donc **sur le clone après le plan** (les ateliers et carrières planifiés émettent
dedans) et l'état est affiché à côté du chiffre :

```
  capacity 5 resident(s) (binding: food) · headroom +0 · admission frozen (air quality 20 < 25)
  capacity 6 resident(s) (binding: food) · headroom +1 · air closes admission in 74 ticks
```

`data.admission = { blocked, quality, threshold, ticksToClose }`. Le headroom
garde son sens numérique : un déficit (−1) n'est jamais adouci en « 0 ».

**Mesure.** Aucun plafond n'est inventé pour l'air, et l'économie livrée n'a
quasiment pas de marge : colonie pop 5, 3 puits + 2 fermes `cropRotation`
(production 7) → `capacity 5`, headroom 0, alors que la doctrine demande
1,19 nourriture/tick par habitant. La porte n'a donc le plus souvent aucun
headroom à annuler : ce qu'elle explique, c'est une croissance **stoppée** que
la nourriture et le logement ne justifient pas.

**Validation.** 4 tests ajoutés à `tests/cockpit-forecast.test.ts` (règle de la
phase de population, bootstrap compris ; air mort → `blocked` + ligne
`admission frozen` ; déficit non masqué ; air sain → aucun texte de porte).
`tsc` PASS, `eslint .` PASS, `vitest run` **28 fichiers / 244 tests, 4,6 s**
(7/7 guardrails), build 1,16 s (70,90 kB / 22,84 gzip). E2E non relancé : la
logique d'alerte est identique (extraction, pas de changement de texte) et les
tests unitaires d'alertes la couvrent ; l'UI n'a pas changé.
## Suivi 2 (2026-11-13) — la porte d'admission dans `assess`

**Écart annoncé.** Le verdict devait dépendre de la porte, pour qu'une
croissance gelée par l'air ne soit plus classée HEALTHY.

**Mesure avant de coder.** Le verdict ne pouvait déjà pas être HEALTHY : la
qualité sous 25 lève une alerte `warning` (`analysis.ts`, seuil
`ENV_QUALITY_ALERT_THRESHOLD`), donc la branche « colmatée » existait déjà —
par coïncidence, pas par construction. Ce qui manquait réellement :

- `reasons` ne nommait que `Environment: quality 20 · pollution 80`, une ligne
  de confort qui ne dit jamais que **la croissance est à l'arrêt** ;
- la lecture ne portait aucun champ `admission` : la porte était un effet de
  bord d'une alerte, pas une donnée ;
- l'échéance (`air closes admission in N ticks`) n'avait aucun lecteur dans
  `assess`, alors que `plan` la publiait déjà.

**Décision.** Même source unique (`admissionGate`), deux usages : `assess`
publie `admission: { blocked, quality, threshold, ticksToClose }`, ajoute
`growth frozen: air quality 20 < admission threshold 25` à `reasons`, et
termine sa ligne pollution par `· admission frozen (air quality 20 < 25)` /
`· air closes admission in N ticks` (même formateur que `plan`,
`admissionNote`). La clause `gate.blocked` entre aussi dans la branche `tight` :
aujourd'hui l'alerte la précède toujours, mais le verdict cesse de dépendre du
seuil et de la sévérité de cette alerte. Les tests pinent l'**invariant**
(aucune porte fermée ne lit `healthy`, logement plein comme famine), pas une
branche inatteignable.

**Validation.** +4 tests (`cockpitAssess()` passe par la vraie CLI `assess`) :
air sain et logement plein → `healthy`, `reasons` vide, aucun texte de porte ;
même colonie sous air mort → `critical` + la raison `growth frozen` + la ligne
`admission frozen` ; invariant sur deux colonies gelées ; une famine reste
`critical`. `tsc` PASS, `eslint .` PASS, `vitest run` **28 fichiers / 248
tests, 4,5 s** (7/7 guardrails), build 1,25 s (70,90 kB / 22,84 gzip).
Scénarios livrés rejoués après le changement : `opening` `HEALTHY` t=300,
`balanced`/`age2` inchangés, pollution 0 partout (Step064 : seuls les ateliers
*staffés* émettent, et aucun scénario ne l'est), donc aucun verdict livré ne
bouge. E2E non relancé : aucune surface UI touchée.
## Vérification finale (2026-11-13) — le cockpit alimentaire contre la simulation

Audit ciblé des prévisions alimentaires (aucune ligne de code modifiée : aucune
divergence démontrée). Chaque lecture du cockpit a été comparée au tick réel
sur la même colonie, population épinglée, projections chaînées tick par tick :
la déviation maximale entre `projectFoodTick().stock` et le stock réel est
**0** dans les cinq scénarios, et l'écart cumulé de production, consommation,
conservation et perte au plafond est nul aussi.

| Scénario | Cockpit (1 tick) | Réel (1 tick) | Sur N ticks | Réserve / autonomie |
|---|---|---|---|---|
| A équilibre exact (pop 19, 6 fermes rotation) | prod 19 · mangé 19 · conservé 2 · stock 58 · net −2 | identique | 20 t : 380 / 380 / 36 / 0 ; stock 60 → 24, écart 0 | `eq 0.00` (loi −19) · `deficit` · autonomie **47** = mesurée 47 |
| B réserve financée (pop 16) | 19 / 16 / 2 · stock 61 · net +1 | identique | 60 t : 1140 / 960 / 162 / 0 ; stock 60 → 78 | `eq 81.00` = 81 atteint, `building`, autonomie `null`, jamais vidé, écart 0 |
| C déficit (pop 10, 3 fermes) | 7 / 10 / 2 · stock 55 · net −5 | identique | 12 t : 84 / 120 / 15 / 0 ; stock 60 → 9 | `eq 0.00` (loi −107) · `deficit` · autonomie **15** = mesurée 15 |
| D plafond saturé (pop 5, 8 fermes, stock 120) | conservé 4 · gaspillé 7 · stock 120 | conservé 4 · gaspillé 7 · stock 120 | 15 t : épinglé à 120, gaspillage identique chaque tick, écart 0 | `eq 120` (plafonné depuis 189) · `funded` |
| E granularité (pop 5, cible 25) | prod 5 · mangé 5 · conservé 1 · net −1 | identique | 40 t : 200 / 200 / 46 / 0, écart 0 | `deficit` (eq −5) · `planFoodReserve` : 3 fermes → eq 59,67, autonomie 11,93 — aucun compte de fermes ne tombe sur 25 |

Ce qui est donc établi, question par question : la loi de réserve de Step068
est la seule (aucun `0.03`/`0.97` hors de `spoilage.ts`/`conservation.ts`,
aucune autonomie recalculée ailleurs) ; la conservation à 3 % entre dans la
projection par `spoilFood` (reliquat fractionnaire inclus) ; l'ordre
production → conservation → consommation → plafond est celui de
`stepSimulation` ; les pertes cumulées sont exactes (le chaînage les
reproduit) ; l'autonomie affichée vient soit de `foodTicksRemaining` (compte à
rebours, vérifié à l'unité près) soit de `équilibre / consommation` (réserve
permanente), jamais d'une division linéaire sur `production − consommation` ;
le plafond borne l'équilibre (`min(loi, capacité)`) et le gaspillage prédit est
le gaspillage appliqué ; la granularité est rapportée, pas promise
(`needs 11.9/tick · runs 11/tick`).

Porte d'admission : `admissionGate` reste la source unique de `plan` et
`assess` (même fonction, même `admissionNote`), `ticksToClose` est
`pollutionTicksToAdmissionBlock` — la fonction que lit aussi le panneau de
stats — donc pas de seconde projection ; porte fermée ⇒ jamais `healthy` (test
d'invariant), et une porte déjà fermée sans flux net positif s'affiche
`admission frozen` avec `ticksToClose: null` (documenté dans
`pollutionTicksToAdmissionBlock`).

**Consolidation des tests (2026-11-13).** Les trois fichiers de l'étape ont
été resserrés de **248 à 229 tests** sans retirer une règle, un seuil ni un
scénario : `cockpit-forecast` 29→14, `conservation` 14→11, `food-reserve`
11→10. Les variations de fixture sont passées en tables dans le test qui les
possède (colonies dégénérées, plafond de capacité, accord avec la simulation,
porte d'admission), les tests qui interrogeaient deux fois la même requête
ont été fusionnés (écho du panneau de stats, accord plan/prévision), et les
trois affirmations déjà épinglées ailleurs ont été supprimées (arrondi de la
conservation — testé sur `spoilFood` dans `conservation.test.ts` —,
`SAVE_VERSION`/`MIGRATABLE_SAVE_VERSION` — `persistence.test.ts` et
`events.test.ts` —, capacité relevée par l'entrepôt — construite dans le test
de doctrine). Aucune assertion affaiblie : les valeurs comparées (3 %,
5 ticks, seuils de porte, rendements, capacité) sont inchangées. Validations
mesurées : `vitest run` 28 fichiers / **229 tests verts, 5,8 s** (dont 7/7
guardrails), `tsc --noEmit` PASS, `eslint .` PASS. E2E non relancé : aucun
code de `src/` modifié par cette passe.

**Deuxième passe (même jour), sous le skill `cleanup-tests`.** La grille
« supprimer d'abord » a été appliquée à l'ensemble de la suite : 17 tests
retirés, 229 → **212**. Dix d'entre eux étaient des **copies de la même
propriété de déterminisme** (`buildings`, `conservation`, `deactivation`,
`economy`, `environment`, `extraction`, `population`, `regrowth`,
`transformation`, `food-reserve`) : elle reste épinglée une fois, au vrai
seam, par `worldState` → `stepSimulation`, et conservée là où la propriété
diffère réellement (flux RNG de `events`, fidélité après `parseSave`, ordre
d'attribution de `staffing`/`removal`, harnais d'auto-jeu). Le reste :
colonies vides en double (`analysis`, `overlay`), assertion de constructeur
(`tick 0`), compteur monotone, chemin `resolveEvents` inatteignable (la
commande vide déjà la liste), et la ligne « different seeds usually produce
different terrain » dont le titre annonçait son propre flottement. Aucune
assertion métier supprimée, aucun seuil modifié, `src/` intact. Validations :
`vitest run` 28 fichiers / **212 tests verts, 5,1 s**, `tsc --noEmit` PASS,
`eslint .` PASS. E2E non relancé.

**Troisième passe, la profonde (même jour, skills `cleanup-tests` +
`avoid-overengineering`).** 66 tests retirés de plus, **212 → 146**, aucun
fichier à plus de 10 cas. La règle appliquée a été la même partout : un test
par **loi distincte**, pas une copie par bâtiment, par âge, par variante de
fixture ni par helper.

| Fichier | Avant | Après | Ce qui est parti |
|---|---|---|---|
| `cockpit-forecast` | 14 | 7 | une loi par test : réserve, déficit, plafond, accord avec le tick, cinq états, règle de la phase population, porte |
| `events` | 13 | 10 | curseur de fréquence, extinction au désactivé (déjà couvert par l'inertie), ligne d'alerte UI |
| `environment` | 13 | 8 | colonie propre de référence, atelier inactif, parc non staffé, totaux de stats, mise à l'échelle du flux |
| `overlay` | 9 | 3 | une copie de teinte par type de bâtiment → lieux de travail, ferme productrice, liste des producteurs |
| `logistics` | 8 | 4 | pente linéaire, 100 % sans entrepôt, wheelbarrow, fermes exemptées (tous dans la courbe calibrée) |
| `atmosphere` | 7 | 3 | un test par âge + pureté ; restent la distinction voisine et la lisibilité des routes |
| `worldState`, `buildings`, `regrowth`, `roads`, `removal`, `storage`, `progression`, `population`, `preferences`, `staffing`, `economy` | — | — | assertions de constructeur, helpers (`deductFood`, `normalizeDeposits`), ordre canonique, doublons de migration/save et variantes de coût |

Reste volontairement : les **migrations et la validation de sauvegarde**
(`persistence`, `regrowth` v16, `events` v17, `conservation` v18), les **maths
d'argent et de réserve**, l'**ordre des phases** du tick, la **porte
d'environnement**, les **guardrails d'auto-jeu** et les deux **instruments de
mesure** documentés (`measure.test.ts` Step048, `famine-recovery.test.ts`
Step054) — ce sont les seuls tests qui ne peuvent pas être retirés sans perdre
une preuve citée dans la roadmap.

**Quatrième passe, la dernière (même jour).** 40 tests de plus, **146 →
106**, aucun fichier au-dessus de 7 cas. Ce qui est parti, toujours par la même
règle : les échos de catalogue (`residence placement costs 25 money`,
`catalog values match the documented contract`), les variantes à un seul canal
(`bountiful harvest`, `closed trade routes`, `taper du taux`), les fixtures
dégénérées (`bare colony`, `invalid dimensions`, `day-0 stock`), les doublons
de déterminisme et de « ça continue de tourner » (`self-play is deterministic`,
`keeps ticking at the fixed rate`), et les rappels de règles déjà épinglées
ailleurs (coût de l'eau, capacité de logement, ordre des dépôts, alertes UI).
Après quatre passes, la distribution est plate : `persistence`, `events` et
`conservation` à 7, la médiane à 3,5 — chaque fichier tient une loi, pas une
surface.

Validations finales : `vitest run` 28 fichiers / **106 tests verts, 4,2 s**,
`tsc --noEmit` PASS, `eslint .` PASS, aucun import orphelin. `src/` intact,
E2E non relancé.
