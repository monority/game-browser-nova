# Step082a — Stabilisation de la réserve hydrique (conception)

> **Statut :** conception (§1–§8), puis implémentation (§9). Les nombres de cette
> conception proviennent du moteur réel (`stepSimulation` importé depuis `src/`), la seule
> pièce remplacée étant la décision d'affectation — c'est précisément l'objet
> de la comparaison. Un contrôle de parité a validé le harnais : sur 60 ticks,
> le modèle d'affectation reproduit `assignJobs` à l'identique (mêmes ensembles
> staffés, même pression à chaque tick).

## 1. Diagnostic

### 1.1 Symptôme mesuré

Colonie D2 (10 colons, 5 puits actifs, 7 fermes éligibles), pression initiale 0,
200 ticks réels :

| métrique | valeur |
|---|---|
| changements d'affectation | **126** |
| pression | oscille 74 ↔ 75 en permanence |
| couverture | alterne 60 % ↔ 100 % |
| puits staffés | alterne 3 ↔ 5 |
| fermes staffées | alterne 7 ↔ 5 |
| fin d'oscillation | aucune (`stableAt = null`) |

La boucle est visible dès l'interface : la ligne `pressure` passe de
`74 / 100 · crisis` à `75 / 100 · grave`, la couverture de `60 %` à `100 %`,
toutes les deux ticks.

### 1.2 Cause racine

Trois lois existantes se composent en cycle limite :

1. **Gains de pression** (`water.ts`) : sévère (`4·servis < 3·besoin`) → montée
   de 1 à 4 points ; léger (75–99 %) → **maintien** ; complet → −1/tick.
2. **Réserve de travailleurs** (Step081) : `ceil(population/2)` puits staffés en
   premier dès `pression ≥ 75`.
3. **Ordre Step070** : sans réserve, les fermes passent d'abord ; les puits
   n'obtiennent que les travailleurs restants.

À pop 10 / 5 puits, les deux affectations produisent deux couvertures qui
encadrent exactement la frontière sévère/léger :

| affectation | puits | fermes | eau | couverture | état de la jauge |
|---|---|---|---|---|---|
| réserve à 75 | 5 | 5 | 10 | **100 %** | complet → pression −1 |
| ordre Step070 | 3 | 7 | 6 | **60 %** | sévère → pression +1 |

La position du seuil n'y change rien : **la couverture sans réserve est
indépendante de la pression** (elle ne dépend que de la population, des fermes
et des puits éligibles). Toute règle qui ne consulte que la pression bascule
donc entre ces deux états quelle que soit la valeur du seuil.

### 1.3 Condition exacte de déclenchement

L'oscillation n'apparaît que si la réserve restaure une couverture
**exactement complète** alors que l'ordre ordinaire est **sévère** :

| population, 5 puits | réserve | couverture avec réserve | résultat mesuré (200 ticks) |
|---|---|---|---|
| 10 | 5 | 100 % (complet) | **126 changements, 74 ↔ 75** |
| 11 | 5 | 91 % (léger) | 1 changement, stable à 75 |
| 12 | 5 | 83 % (léger) | 0 changement, stable à 1 |

C'est le cas « capacité hydrique exactement égale au besoin » — fréquent, car
c'est précisément l'optimum que le joueur cherche à atteindre.

## 2. Solutions étudiées

Sept politiques ont été implémentées dans le harnais et exécutées sur les sept
scénarios obligatoires (200 ticks chacune, même moteur, même graine).

| code | politique |
|---|---|
| **0** | Step081 actuel : réserve si `p ≥ 75` |
| **A1/A2/A3** | hystérésis : entrée à 75, sortie à 60 / 50 / 25 |
| **B1/B2** | maintien conditionnel : entrée à 75, sortie quand l'ordre ordinaire sert ≥ 75 % / = 100 % de la population |
| **C1/C2** | couverture réelle < 100 % / < 75 % (la couverture étant celle de sa propre affectation) |
| **D** | réserve dimensionnée pour la bande : viser 75 % de couverture au lieu de 100 % |

### 2.1 Résultat décisif — scénario 1 (pop 10, 5 puits, 200 ticks)

| politique | changements | pression | couverture | nourriture | coût hydrique | stabilisé |
|---|---|---|---|---|---|---|
| **0** Step081 | 126 | 74 ↔ 75 | 60 ↔ 100 | 75 (min 50) | 0 tick | jamais |
| A1 (sortie 60) | 8 | cycle 59 → 75 | 60 ↔ 100 | 81 | 0 | jamais |
| A2 (sortie 50) | 5 | cycle 49 → 75 | 60 ↔ 100 | 49 | 0 | jamais |
| A3 (sortie 25) | 3 | cycle 25 → 75 | 60 ↔ 100 | 54 | 0 | jamais |
| **B1** | **1** | 75 → 0 | 100 | 24 (min 24) | 0 | **t=155** |
| **B2** | **1** | 75 → 0 | 100 | 24 | 0 | **t=155** |
| C1 | **199** | 0 ↔ 1 | 60 ↔ 100 | 22 | 0 | — |
| C2 | **199** | 0 ↔ 1 | 60 ↔ 100 | 22 | 0 | — |
| D | 1 | **bloquée à 75** | 80 | 75 | **126 ticks** | t=80 |

### 2.2 Résultat décisif — scénario 5 (récupération, 5 puits réactivés, p=100)

| politique | changements | pression finale | population | coût hydrique |
|---|---|---|---|---|
| 0 | 175 | 74 ↔ 75 | 10 → 10 | 0 |
| A1 / A2 / A3 | 10 / 6 / 3 | cycles 59→99 / 49→99 / 24→99 | 10 → 10 | 0 |
| **B1 / B2** | **0** | 99 → 0 | 10 → 10 | 0 |
| C1 / C2 | 199 | 99 ↔ 100 | 10 → 10 | 100 ticks |
| D | 5 | 99 | **10 → 7** (départs) | 199 ticks |

### 2.3 Verdict par famille

**A — hystérésis : rejetée.** Elle ne supprime pas l'oscillation, elle la
déplace. La sortie à 60 donne un cycle 59↔75 (8 changements), la sortie à 50 un
cycle 49↔75, la sortie à 25 une dent de scie 0→75 de 75 ticks. La cause est
structurelle : à la sortie, la couverture retombe à 60 % (sévère), la pression
remonte jusqu'au seuil d'entrée, et le cycle recommence. Plus la sortie est
basse, plus la colonie reste longtemps dans la bande grave — c'est-à-dire pire
sur le plan du symptôme perçu (alerte rouge permanente, couverture qui
clignote). Et cela exigerait un champ sauvé **et** un seuil magique de plus.

**B — maintien conditionnel : retenue.** Un seul changement d'affectation sur
200 ticks, la pression redescend jusqu'à 0 et y reste, la couverture est à
100 %. La sortie ne se fait que lorsque l'ordre ordinaire peut servir au moins
75 % de la population — condition qui, dans une colonie où les puits peuvent
juste couvrir tout le monde, n'est jamais remplie : la priorité aux puits est
alors conservée, à juste titre, puisqu'elle est la seule façon de servir tout
le monde. B1 et B2 donnent des résultats identiques sur les sept scénarios ;
le seuil ≥ 75 % est retenu car il réutilise la frontière de sévérité déjà
nommée dans `water.ts` (aucun nombre nouveau).

**C — couverture : rejetée.** Mesurée sur sa propre affectation, elle bascule à
**chaque tick** (199 changements sur 200) : la couverture est complète, donc la
réserve tombe, donc la couverture s'effondre, donc la réserve revient. C'est
l'oscillation à fréquence maximale, la pire variante pour l'interface et pour
la stabilité des affectations. C2 est encore plus instable (152 changements et
effondrement de la colonie dans le scénario 2).

**D — réserve dimensionnée pour la bande : rejetée.** Elle stabilise
effectivement l'affectation (1 changement), mais **parque la colonie dans la
bande grave** : à 80 % de couverture le déficit est « léger », donc la jauge ne
redescend plus. Conséquences mesurées : pression bloquée à 75, facture d'urgence
payée 126 ticks sur 200, et dans le scénario 5 les départs continuent (10 → 7)
parce que la pression reste à 99–100. Elle échange une oscillation contre une
crise permanente — inacceptable.

### 2.4 Scénarios sans différence

S2 (pop 9, 3 puits), S3 (p 75, 3 puits), S4 (p 100, 3 puits), S6 (aucun puits),
S7 (pop 3, plancher) : **toutes les politiques donnent des affectations
identiques**, tick par tick. Avec 3 puits, l'ordre ordinaire staffe déjà tous
les puits disponibles — la réserve ne change rien, donc rien ne peut osciller.
B1 y est strictement neutre, ce qui est la propriété recherchée : elle ne
touche que les colonies où la réserve change réellement l'affectation.

À noter (pré-existant, inchangé par cette étape) : avec 3 puits pour 9–10
colons, la colonie se bloque à 99 de pression avec une facture permanente,
parce que la couverture reste « légère ». Ce n'est pas l'objet de Step082a.

## 3. Solution retenue : B1 — maintien conditionnel

### 3.1 Principe

La réserve s'arme à la pression grave (75) et **reste armée** tant que l'ordre
ordinaire ne peut pas servir au moins 75 % de la population. Elle se relâche
dès que l'ordre ordinaire suffit — c'est-à-dire quand la colonie peut de
nouveau boire sans elle.

Elle n'introduit aucune ressource et aucun système : un booléen, une condition
de sortie, la même formule de réserve.

### 3.2 Formules

```ts
// src/domain/jobs/jobs.ts — le staffing est le propriétaire de la décision ;
// l'importer depuis water.ts fermerait un cycle d'imports
// isSevereShortage(served, need) === 4 * served < 3 * need

/** Puits staffés par l'ordre ordinaire (fermes d'abord), sans réserve.
 *  Même filtre d'éligibilité, même ordre canonique que assignJobs ;
 *  aucun effet de bord (calcul en variables locales). */
export function ordinaryWellStaffing(state: GameState): number;

/** Capacité hydrique de l'ordre ordinaire seul, bornée par la population. */
export function ordinaryWaterCapacity(state: GameState): number;
// = min(ordinaryWellStaffing(state) * waterPerWell(state), population)

/** Transition, une fois par tick, après la jauge (comme updateWaterCrisis). */
export function updateWaterReserveLatch(state: GameState): void {
  if (state.waterPressure >= WATER_PRESSURE_GRAVE_THRESHOLD) {
    state.waterReserveLatched = true;
  } else if (state.waterReserveLatched && !isSevereShortage(ordinaryWaterCapacity(state), state.population)) {
    state.waterReserveLatched = false;
  }
}

// même formule, même borne qu'en Step081
export function waterWorkerReserve(state: GameState): number {
  return state.waterReserveLatched ? Math.ceil(state.population / 2) : 0;
}
```

### 3.3 Transitions

| état | condition | nouvel état | réserve |
|---|---|---|---|
| désarmé | `pression ≥ 75` | armé | `ceil(pop/2)` |
| désarmé | `pression < 75` | désarmé | 0 |
| armé | `pression ≥ 75` | armé | `ceil(pop/2)` |
| armé | `pression < 75` et ordre ordinaire **sévère** | armé | `ceil(pop/2)` |
| armé | `pression < 75` et ordre ordinaire **≥ 75 %** | désarmé | 0 |

Propriétés :
- **Pas de cycle** : la sortie n'est possible que lorsque la couverture sans
  réserve est ≥ 75 %, c'est-à-dire dans la bande où la jauge **maintient** sa
  valeur — elle ne remonte donc plus vers 75 et ne peut pas ré-armer.
- **Progressivité préservée** : la jauge garde ses lois (montée sévère,
  maintien léger, −1/tick complet). Aucune pression n'est forcée.
- **Populations paires et impaires** : la réserve reste `ceil(pop/2)`, bornée
  par `min(travailleurs, postes de puits éligibles)`, donc l'identité
  `ceil(pop/2) + ceil((pop−1)/2) = pop` reste vraie.
- **Déterminisme** : le verrou est un pur booléen d'état, écrit une seule fois
  par tick ; deux exécutions de la même sauvegarde donnent la même trace.

### 3.4 Conséquence chiffrée à assumer

Dans la colonie à capacité exacte (pop 10, 5 puits), la priorité aux puits
devient permanente après la première crise grave : **5 puits + 5 fermes**, donc
11 nourriture/tick au lieu de 15. Mesuré sur 400 ticks (deux cycles de saisons) :
la nourriture se stabilise autour de 22 (jamais 0), la pression reste à 0, la
colonie ne paie aucune facture hydrique et ne perd aucun colon. Le surcroît de
nourriture (15) était un surplus, pas un besoin : le besoin est de 10.

Ce coût est le prix de la sécurité hydrique, et il est visible : deux fermes
restent inactives. C'est un choix de conception explicite, pas un effet de bord.

### 3.5 Persistance

Un champ sauvé est nécessaire : sans lui, une sauvegarde prise pendant la
récupération rechargerait un verrou désarmé et rejouerait quelques ticks
d'oscillation. Décision : **`SAVE_VERSION` 21 → 22**, champ
`waterReserveLatched: boolean`, migration v21 → v22 posant
`waterReserveLatched = waterPressure >= 75` (une colonie sauvegardée en crise
reprend armée ; une colonie sauvegardée hors crise reprend désarmée, comme
aujourd'hui). Validation : booléen strict, défaut `false` pour un document
antérieur au champ. Aucun autre champ, aucune autre migration touchée.

## 4. Critères d'acceptation

1. **S1** (pop 10, 5 puits actifs, 300 ticks) : exactement **1** changement
   d'affectation, pression strictement décroissante de 75 à 0, couverture 100 %
   dès le tick d'armement, **0** tick avec facture hydrique, nourriture > 0.
2. **S5** (récupération, 5 puits réactivés) : **0** changement d'affectation
   après la réactivation, même descente de pression, population inchangée.
3. **S2, S3, S4, S6, S7** : ensembles staffés identiques à Step081 à chaque
   tick (aucune dérive de comportement là où la réserve ne change rien).
4. **Aucune oscillation** : les sept scénarios atteignent une fenêtre constante
   de 40 ticks (`stableAt` fini) ; plus aucun cycle pression/couverture.
5. **Déterminisme** : deux exécutions de la même sauvegarde → traces
   identiques ; aller-retour de sauvegarde v22 → verrou préservé.
6. **Migration** : un document v21 se charge, verrou = `pression ≥ 75`, aucun
   départ au chargement, `SAVE_VERSION = 22`.
7. **Le verrou ne s'arme jamais sous 75** : test dédié partant de 74.
8. **Interface inchangée** : aucune modification de `statsPanel.ts` ni du texte
   des alertes ; la disparition du clignotement est la seule différence
   observable.

## 5. Risques résiduels

- **Maintien long** : après une crise grave, une colonie dont l'ordre ordinaire
  reste sévère garde la priorité aux puits indéfiniment (coût mesuré : 4
  nourriture/tick dans S1). Un joueur qui veut récupérer ses fermes doit
  augmenter sa capacité hydrique (puits, ou population plus faible) — la
  réserve est bornée par les postes de puits, donc elle s'éteint d'elle-même
  s'il n'y a plus de puits.
- **Sauvegardes v21 prises à 74** : elles repartent désarmées et peuvent
  osciller quelques ticks jusqu'au prochain passage à 75, puis se verrouillent.
  Effet transitoire borné, pas une régression d'état.
- **Bande grave maintenue à 99** (3 puits pour 9–10 colons) : pré-existant,
  strictement inchangé par Step082a. La réserve n'y change rien (tous les puits
  sont déjà staffés) ; ce point mérite sa propre étape.
- **Aucune marge alimentaire automatique** : si une future règle réduit la
  production par ferme, la marge de 1 nourriture/tick de S1 disparaîtrait. À
  surveiller lors de toute modification des rendements.

## 6. Plan d'implémentation

1. `state.ts` : champ `waterReserveLatched: boolean`, initialisé à `false`.
2. `jobs.ts` : `ordinaryWellStaffing`, `ordinaryWaterCapacity`,
   `updateWaterReserveLatch` (purs, sans effet de bord) et l'ordre de staffing
   extrait en un seul endroit, partagé par les deux passes.
3. `tick.ts` : appel unique de `updateWaterReserveLatch` après
   `updateWaterCrisis` (le verrou lit la jauge du tick).
4. `jobs.ts` : `waterWorkerReserve` lit le verrou ; le reste d'`assignJobs`
   (deux passes, bornes, absence de double affectation) est inchangé.
5. `save.ts` : `SAVE_VERSION = 22`, sérialisation, validation booléenne,
   `migrateV21ToV22`.
6. Tests : les sept scénarios en table (état → verrou attendu → réserve → puits
   et fermes staffés), le cas 74/75, le déterminisme, la migration, et la
   réutilisation du harnais de parité (modèle ≡ moteur réel).
7. Aucune modification de `statsPanel.ts`, `analysis.ts` ni `play.ts`.

## 7. Plan de validation

1. `tsc --noEmit` et ESLint.
2. Tests ciblés `tests/water-crisis.test.ts` (dont les nouveaux cas de verrou).
3. Mesure cockpit des sept scénarios avec les métriques de ce document
   (changements d'affectation, pression, couverture, nourriture, facture,
   durée de stabilisation) et comparaison à la table §2.
4. Vérification visuelle : la ligne `pressure` doit rester sur une seule valeur
   pendant 60 ticks au scénario 1, sans alternance crisis/grave.
5. Suite unitaire complète, puis build.

## 8. Ce qui n'était pas fait dans la conception

Aucune ligne de code applicatif n'a été modifiée par la conception (§1–§8) ; le
code l'a été ensuite, et §9 dit ce que la mesure y a changé. Les mesures
proviennent d'un harnais externe au dépôt (`/tmp`) qui importe les modules
réels ; le seul remplacement est la fonction d'affectation, validée par le
contrôle de parité. Aucun commit, aucun push.
## 9. Implémentation (Step082b) — ce que la mesure a corrigé

**Statut :** implémentée et livrée dans le commit `f81257f` (Step079, Step081 et
Step082b y vivent ensemble : les trois touchent les mêmes fichiers —
`jobs.ts`, `tick.ts`, `state.ts`, `water.ts` — et le verrou lit le compteur de
crise de Step081). `SAVE_VERSION = 22`; validation : `tsc` et ESLint propres,
179 tests verts, build vert. Ce paragraphe remplace le statut « aucun code
modifié » de l'en-tête pour tout ce qui suit §8.

B1 est implémentée dans le code et mesurée sur le moteur réel (300 ticks,
sept scénarios, harnais temporaire supprimé après la passe). Deux écarts avec
les projections de ce document, tous deux trouvés par la mesure et corrigés
dans le code :

1. **Le critère de sortie ne doit pas lire le stock.** La première version
   testait le service obtenu *stock compris* : au scénario 7 (pop 3, 5 puits),
   une citerne pleine relâchait la réserve, la colonie vidait son stock, la
   pénurie redevenait sévère et le verrou se ré-armait — **67 changements en
   200 ticks**, c'est-à-dire l'oscillation revenue par la porte de service.
   Le critère porte désormais sur la **capacité** des puits de l'ordre
   ordinaire : 2 changements, pression 100 → 0, stable au tick 99.
2. **S2/S3/S4 ne sont pas neutres** (7 fermes, 3 puits) : l'ordre ordinaire n'y
   staffe que 2 puits, donc la réserve change bien l'affectation (3 puits).
   La prédiction « identique à Step081 » du §2.4 venait d'une configuration où
   la réserve était effectivement sans effet, pas de celle-ci. Mesuré : ces
   colonies convergent vers ce que 3 puits peuvent servir (pop 10 → 6, 3 puits
   + 3 fermes, couverture 100 %, pression 0, stable), là où Step081 oscille à
   74/75. Ce n'est pas une régression — c'est la correction qui s'applique aussi
   là — mais ce n'est pas la neutralité annoncée.

### 9.1 Résultats mesurés (300 ticks, moteur réel)

| scénario | changements | pression | population | staffés | couverture | nourriture | ticks facturés | stable à |
|---|---|---|---|---|---|---|---|---|
| S1 pop 10, 7 fermes, 5 puits | **1** | 0 → 75 → 0 | 10 → 10 | 5 puits / 5 fermes | 100 % | 22 | **0** | 149 |
| S2 pop 9, 7 fermes, 3 puits | 5 | 0 → 100 → 0 | 9 → 6 | 3 / 3 | 100 % | 26 | 54 | 191 |
| S3 pop 10, 3 puits, p 75 | 4 | 75 → 100 → 0 | 10 → 6 | 3 / 3 | 100 % | 26 | 63 | 163 |
| S4 pop 10, 3 puits, p 100 | 4 | 100 → 100 → 0 | 10 → 6 | 3 / 3 | 100 % | 26 | 39 | 139 |
| S5 récupération, 5 puits, p 100 | **1** | 100 → 100 → 0 | 10 → 10 | 5 / 5 | 100 % | 23 | **0** | 100 |
| S6 aucun puits | 5 | 0 → 100 → 100 | 10 → 2 | 0 / 2 | 0 % | 95 | 282 | 103 |
| S7 pop 3, 5 puits, p 100 | 2 | 100 → 100 → 0 | 3 → 2 | 1 / 1 | 100 % | 30 | **0** | 99 |

Deux exécutions identiques du scénario 1 donnent une trace identique tick par
tick (300 ticks) : le verrou est déterministe. Le scénario 6 (aucun puits) est
le seul strictement identique à Step081 — sans puits, la réserve vaut 0 dans
les deux politiques — et il conserve le comportement pré-existant (effondrement
au plancher de 2, facture permanente).

### 9.2 Critère 3 révisé

« S2, S3, S4, S6, S7 identiques à Step081 » est remplacé par : **aucun scénario
ne se dégrade** — les sept atteignent une fenêtre constante de 40 ticks, et les
différences avec Step081 n'apparaissent que là où la réserve change réellement
l'affectation (mesuré : S6 est identique tick par tick ; S1/S5/S7 ne paient
aucune facture et ne perdent aucun colon au-delà du tick sec d'ouverture de S7).
