# NOVA — Game design : accès à la première chaîne industrielle

Version : 0.1
Date : 18 novembre 2026
Build de référence : `88900bc`
Statut : **étude comparative + option C prototypée et mesurée (§8)**. Aucun
coefficient n'est entériné : le prototype de §8 existe pour être mesuré, pas pour
être livré tel quel.

## 1. Objectif

Rendre une première activité industrielle viable **avant 13 colons**, sans dégrader
la survie, la croissance ni l'accès à l'âge 3.

Ce document ne choisit pas de solution. Il établit les règles exactes en vigueur,
l'arithmétique de la marge, puis compare cinq options à partir de ces règles. Là où
un effet ne peut pas être calculé avec les données disponibles, la donnée manquante
est nommée.

## 2. Règles exactes en vigueur

Toute option se compare à ces règles-là, pas à une impression de partie.

| Règle | Valeur | Source |
|---|---|---|
| Postes par bâtiment | 1 pour ferme, puits, atelier, camp, carrière ; 0 pour résidence, parc, entrepôt, centre | `src/content/buildings.ts` (`jobCapacity`) |
| Éligibilité | bâtiment actif + `jobCapacity > 0` + adjacent à une route | `isEligibleWorkplace` |
| Ordre de staffing | ferme 0 → puits 1 → autres 2, puis `y`, `x`, `id` ; réserve hydrique `ceil(N/2)` puits d'abord si `waterPressure >= 75` | `staffPriority`, `staffingAssignment` |
| Un travailleur par poste | pas de poste partagé, pas de temps partiel | `staffingAssignment` |
| Ferme | 2 nourriture/tick (+1 par `cropRotation`, `irrigation`, `winterWheat`) | `production.ts` |
| Puits | 2 eau/tick, **aucune technologie** dans le jeu livré (le prototype de l'option C, §8, en ajoute une à l'essai) | `production.ts` |
| Centre | +1 nourriture/tick, non staffé | `production.ts` |
| Camp | 2 bois/tick sur gisement adjacent, 1 poste | `extraction.ts` |
| Atelier | 1 planche/tick pour **2 bois**, lot entier, 1 poste | `transformation.ts` |
| Perte de nourriture | 3 %/tick de `(stock + production)` | `spoilage.ts` |
| Admission | `population < capacité de logement` **et** nourriture > 0 **et** eau servie ≥ population **et** qualité d'air ≥ 25 | `updatePopulation` |
| Résidence | 1 logement, 25 pièces, 0 planche, entretien exempté | `buildings.ts`, `economy.ts` |
| Taxes / commerce | +1/colon, +2/atelier connecté dès 8 colons, +1 par planche produite | `economy.ts` |
| Entretien | −1/bâtiment opérationnel, résidence et centre exemptés | `economy.ts` |
| Sortie de l'âge 1 → âge 2 | pop 8, 8 bâtiments, 30 nourriture, 3 technologies | `AGE_MILESTONES[1]` |
| Sortie de l'âge 2 → âge 3 | pop 15, 14 bâtiments, 60 nourriture, 5 technologies | `AGE_MILESTONES[2]` |
| Prospérité de l'âge 3 | pop 20, 75 nourriture, 30 bâtiments, 20 résidences | `AGE_MILESTONES[3]` |

**Correction (18 novembre 2026).** Les trois lignes ci-dessus étaient auparavant
libellées « Âge 2 » et « Âge 3 », ce qui les décalait d'un âge : `canAdvanceAge`
lit le jeu de jalons de l'âge **courant**, donc `AGE_MILESTONES[1]` garde l'entrée
dans l'âge 2, `AGE_MILESTONES[2]` garde l'entrée dans l'âge 3, et
`AGE_MILESTONES[3]` ne garde aucune transition (il n'existe pas d'âge 4) — il décrit
la prospérité atteinte dans l'âge 3. Toute phrase de ce dossier qui parlait d'un
« jalon de nourriture à 75 » comme condition d'accès à l'âge 3 est donc à lire
comme le jalon de **60** ; les 75/20 résidences ne bloquent rien.

Deux conséquences de ces règles, avant toute option :

- **Le puits n'a aucune marge technologique.** La ferme peut passer de 2 à 5
  nourriture/tick ; le puits reste à 2 eau/tick pour toujours. Toute croissance
  exige donc `ceil(N/2)` puits staffés, c'est-à-dire la moitié de la population.
- **La nourriture doit dépasser `N / 0.97`**, pas `N` : à `P = N` exactement, le
  stock décroît de 3 %/tick jusqu'à 0 et l'admission s'arrête (plafond de
  ressources, voir `DIAGNOSIS-POPULATION-PLATEAU.md`).

## 3. L'arithmétique de la marge (dérivée, non mesurée)

Postes de survie nécessaires pour une population `N`, avec `F` nourriture par ferme :

`S(N, F) = ceil((N / 0.97 − 1) / F) + ceil(N / 2)`

| N | S à F=2 (sans tech) | libre | S à F=3 (`cropRotation`) | libre | S à F=4 (`+irrigation`) | libre |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | **0** | 9 | **1** | 8 | **2** |
| 11 | 12 | −1 | 10 | 1 | 9 | 2 |
| 12 | 12 | 0 | 10 | **2** | 9 | **3** |
| 13 | 14 | −1 | 12 | 1 | 11 | **2** |
| 14 | 14 | 0 | 12 | 2 | 11 | 3 |
| 15 | 16 | −1 | 13 | 2 | 12 | 3 |
| 16 | 16 | 0 | 14 | 2 | 12 | 4 |

Lecture : une valeur négative signifie que la colonie ne peut pas être
alimentée **et** hydratée en même temps, même avec tous ses colons aux postes de
survie — elle vit alors sur son stock, donc temporairement.

Ce tableau est de l'arithmétique sur des lois mesurées, pas une mesure de partie.
Il dit une chose décisive : **la marge industrielle est créée par la productivité
des fermes, pas par le coût des bâtiments industriels.** À `F=2`, il n'existe aucun
`N` où un travailleur est libre sans déficit alimentaire ; à `F=3`, il en existe un
dès 10 colons.

## 4. Options comparées

Chaque option est décrite par son mécanisme, ses avantages, ses risques, et son
effet attendu sur les sept dimensions demandées. Les effets sont **qualifiés**, pas
chiffrés en jeu : aucune option n'est implémentée.

### A — Réduire le coût en travailleurs des bâtiments essentiels

**Mécanisme.** Un travailleur couvre plus d'un poste essentiel (capacité de travail
par colon supérieure à 1 sur les fermes/puits), par exemple 1,25 poste.

- Avantages : attaque la cause exacte (la survie absorbe tout) ; l'industrie
  s'ouvre sans toucher aux rendements ni aux coûts.
- Risques : crée des fractions de travailleur, donc des règles d'arrondi à
  spécifier ; rend la lecture « 1 poste = 1 colon » fausse dans l'interface.
- Alimentation/eau : inchangées par poste, mais moins de postes nécessaires.
- Bois/planches : ouvre 1 à 3 postes libres à 10–14 colons.
- Croissance : indirectement positive (plus de postes libres pour les fermes).
- Monnaie : les bâtiments essentiels coûtent moins de postes, pas moins de pièces.
- Âge 3 : neutre à positif, aucun jalon ne compte les postes.
- Complexité : **élevée** (allocation fractionnaire, déterminisme, affichage).
- Stratégie dominante : risque moyen — la capacité devient un multiplicateur caché.
- Scénarios à tester : ouverture standard, industrie précoce, N=11 (cas où `S > N`).

### B — Augmenter la capacité de travail totale

**Mécanisme.** Capacité = `N + d` (d ≥ 1), mêmes règles d'éligibilité.

- Avantages : simple, déterministe, immédiatement lisible.
- Risques : travailleurs sans bouche (contraire au principe 5 du dossier) ; `d=1`
  ne produit qu'un poste, insuffisant pour camp + atelier.
- Alimentation/eau : inchangées ; ce sont des producteurs supplémentaires.
- Bois/planches : `d=2` ouvre la chaîne complète à 10 colons (camp + 1 atelier).
- Croissance : risque d'accélération gratuite, puisque la capacité croît avec `N`.
- Monnaie : plus de production sans plus de taxes → rentabilité accrue.
- Âge 3 : les jalons de population ne bougent pas ; les jalons de bâtiments
  deviennent plus faciles (plus de postes staffables).
- Complexité : **faible**.
- Stratégie dominante : **élevé** — chaque colon supplémentaire vaut plus qu'un
  colon, ce qui rend la croissance toujours optimale.
- Scénarios : croissance rapide, partie prudente, N=10 avec `d=1` et `d=2`.

### C — Améliorer progressivement la productivité des fermes et des puits

**Mécanisme.** La productivité des fermes existe déjà (`cropRotation` +1,
`irrigation` +1, `winterWheat` +1). Le levier manquant est **le puits** : 3 eau/tick
ferait passer les puits de `ceil(N/2)` à `ceil(N/3)` postes.

- Avantages : réutilise un système validé ; la progression paie en main-d'œuvre, ce
  qui donne un sens économique aux technologies.
- Risques : rend l'industrie dépendante d'un achat obligatoire ; peut rendre les
  puits obsolètes en fin de partie ; l'âge 1 doit pouvoir payer la technologie.
- Alimentation/eau : la production par poste augmente ; le risque est un excédent
  structurel (stock plein, pertes de 3 %).
- Bois/planches : ouvrirait 1 poste libre à 10 colons avec `cropRotation`, 2 avec
  `irrigation` — **mesuré faux tel quel** (§8.4 : le poste n'est libéré que si le
  plan de puits est reconstruit ; la loi de staffing staffe tous les puits bâtis).
- Croissance : positive et **planifiée** (le joueur choisit d'investir).
- Monnaie : 50 pièces pour `cropRotation`, 150 pour `irrigation` — mesuré, la
  trésorerie d'ouverture atteint 282 pièces à t=151 sur la ligne de référence.
- Âge 3 : positif — la technologie compte dans les 5 exigées pour **sortir** de
  l'âge 2 (§2), et l'excédent d'eau finance la nourriture qui manque à ce même jalon.
- Complexité : **faible** pour les fermes (existe), **moyenne** pour le puits.
- Stratégie dominante : faible — c'est un investissement, pas un interrupteur.
- Scénarios : partie orientée progression, partie prudente, N=10 à F=3.
- **Mesure : faite** le 18 novembre 2026 sur 2 des 6 scénarios, voir §8.

### D — Réduire le coût en travailleurs des bâtiments industriels

**Mécanisme.** Camp et/ou atelier à 0 poste, ou un poste pour deux bâtiments.

- Avantages : la chaîne tourne sans ouvrier, donc sans arbitrage avec la survie.
- Risques : supprime la main-d'œuvre comme contrainte pour l'industrie, ce qui vide
  de sens tout le système de staffing ; l'atelier devient un bâtiment passif.
- Alimentation/eau : inchangées.
- Bois/planches : la chaîne complète fonctionne à 10 colons avec 0 travailleur libre.
- Croissance : inchangée (aucun poste consommé).
- Monnaie : le commerce (+2/atelier) devient un revenu sans contrepartie de travail.
- Âge 3 : positif (bâtiments opérationnels plus faciles).
- Complexité : **faible**.
- Stratégie dominante : **très élevé** — c'est l'option qui « résout » le problème en
  supprimant le système qui le pose.
- Scénarios : ouverture standard, partie prudente, contrôle de non-régression du
  staffing (les tests d'ordre doivent encore passer).

**Élimination arithmétique partielle :** tant que la marge libre est nulle
(`S(N,2) = N` à 10, 12, 14, 16 colons), réduire le coût d'un bâtiment industriel ne
change **rien** à 10–12 colons, puisque zéro travailleur est disponible pour lui.
L'option D ne devient efficace qu'avec une autre option qui crée la marge.

### E — Introduire une capacité industrielle initiale limitée

**Mécanisme.** Un nombre borné de postes industriels (par exemple 1) est staffé hors
compte de population, rattaché à l'âge 1 et à un type de bâtiment.

- Avantages : cible exactement le maillon manquant (un camp) ; borné, donc peu
  susceptible de casser l'équilibre global ; lisible comme « le contremaître ».
- Risques : travailleur fictif (principe 5) sauf si justifié narrativement ; règle
  spéciale à maintenir ; risque que le joueur croie que l'industrie est libre.
- Alimentation/eau : inchangées.
- Bois/planches : 2 bois/tick dès l'âge 1, donc 1 planche/tick avec un atelier
  staffé par un colon dès que la marge existe (N=11) ; à N=10, la planche demande
  encore un poste.
- Croissance : positive (le bois alimente les entrepôts/planchers sans coûter de
  bouche).
- Monnaie : le commerce par planche (+1) devient accessible tôt.
- Âge 3 : positif mais modeste (les jalons ne comptent pas les planches).
- Complexité : **moyenne** (règle dédiée, persistance, affichage de la cause).
- Stratégie dominante : moyen — un seul poste gratuit reste un avantage permanent.
- Scénarios : industrie précoce, seed défavorable, contrôle du déterminisme.

## 5. Données manquantes

Aucune de ces données ne peut être obtenue sans implémenter l'option, ce que ce
document interdit :

1. **Effet d'une option sur une partie complète** (1500 ticks) : population, planches,
   budget, jalons — il faut coder l'option, puis rejouer les scénarios du §6.
   *Mesuré pour C le 18 novembre 2026 (§8.2 et §8.3) sur l'ouverture pop 12 et la
   ligne de croissance ; les quatre autres scénarios restent à exécuter.*
2. **Coût réel d'un poste industriel** en croissance : dépend de la politique de
   construction, pas des lois ; à mesurer avec une politique qui privilégie
   explicitement l'industrie.
3. **Valeur d'un puits à 3 eau/tick** : rendement choisi, jamais mesuré ; aucune
   donnée de référence n'existe. *Mesuré le 18 novembre 2026 (§8.3) : la ligne de
   croissance atteint son plafond 600 ticks plus tôt et laisse 5 968 pièces après
   achat de toutes les technologies — le rendement n'est donc pas neutre.*
4. **Tolérance des joueurs à un travailleur fictif** (option E) : aucune session
   humaine n'a été conduite sur ce sujet.
5. **Interaction avec la crise hydrique** : la réserve de `ceil(N/2)` puits est une
   loi validée ; une option qui réduit les puits nécessaires déplace son seuil. Cet
   effet n'est pas calculable sans prototype et doit être mesuré séparément.

## 6. Protocole de comparaison

À exécuter **après** le choix d'une option, sur le tick réel, jamais dans une
simulation parallèle. Pour chaque scénario : même seed, mêmes commandes, même
durée ; l'option est la seule variable.

| Scénario | Intention |
|---|---|
| Ouverture standard | Référence : 10 colons, 5 fermes, 5 puits, 2 ateliers, 1 parc |
| Développement industriel précoce | Construire camp + atelier avant toute résidence |
| Croissance démographique | Ajouter une résidence par palier, mesurer le coût marginal |
| Partie prudente | Ne rien construire pendant 300 ticks, vérifier l'absence de blocage |
| Partie orientée progression | Technologies d'abord, industrie ensuite |
| Seed défavorable | Obstacles maximaux ; noter que les gisements sont en configuration, pas seedés |

Mesures obligatoires par scénario : population ; travailleurs disponibles, affectés
et libres ; production et consommation par ressource ; stocks de nourriture et d'eau ;
planches produites ; budget net et trésorerie ; âge atteint et tick correspondant ;
apparition d'une pénurie ou d'un softlock.

**Critère principal :** ce n'est pas de produire plus de planches, c'est de garder
une croissance viable et l'âge 3 atteignable. Une option qui gagne en planches et
perd en population est un échec, pas un succès.

## 7. Ce que l'étude établit déjà

Sans implémenter quoi que ce soit :

- La marge ne peut pas venir d'un réordonnancement : l'ordre ne crée pas de
  travailleur (`GAME-DESIGN-WORKFORCE.md` §10.2, `../../adr/ADR-016-staffing-priority-order.md`).
- La marge ne peut pas venir du coût des bâtiments industriels tant que la marge
  est nulle (élimination arithmétique de D seul).
- La marge **peut** venir de la productivité des fermes, qui existe déjà : à 10
  colons, `cropRotation` fait passer les postes de survie de 10 à 9.
- Le puits est le seul poste de survie sans levier de productivité : c'est là que
  se trouve la marge inexploitée.

## 8. Résultat du test de l'option C (18 novembre 2026)

> **Décision D1 (19 novembre 2026) : la technologie de puits est HORS du
> catalogue livré** (`shipped: false`, achat refusé, panneau filtré) jusqu'à ce
> que D2 et D4 soient tranchées. Elle reste dans le dépôt, donc tout ce qui suit
> reste reproductible en la réactivant ; le jeu livré, lui, a retrouvé la ligne
> témoin de ce chapitre. Dossier et conditions de réouverture :
> [`decisions/D1-option-c.md`](decisions/D1-option-c.md) §9.

### 8.1 Ce qui a été codé

Levier choisi : **une technologie d'âge 1**, et non un puits plus fort par défaut —
aucune valeur existante ne change sans un achat du joueur.

| Fichier | Changement |
|---|---|
| `src/content/techs.ts` | `TechEffect` gagne `"wellWater"` ; `wellShafts`, âge 1, 50 pièces, effet +1 eau par puits staffé |
| `src/domain/production/production.ts` | `waterPerWell = WATER_PER_WELL_PER_TICK + techLevel(state, "wellWater") − (sécheresse ? 1 : 0)` |
| `tests/selfplay.governor.ts` | `wellShafts` en 2ᵉ position de `TECH_ORDER` — la politique du harnais, pas une règle du jeu |
| `tests/water.test.ts` | garde de la loi : 2 → 3, `ceil(10/3) = 4` puits, sécheresse 3 → 2 |
| `tests/selfplay.test.ts` | deux postures re-mesurées (§8.4.5) |

La sécheresse reste un **retrait plat** : un puits amélioré passe de 3 à 2 eau/tick,
exactement comme un puits ordinaire passait de 2 à 1. `tests/events.test.ts` n'a pas
bougé. Les 50 pièces et le +1/tick sont les valeurs du prototype : ils ne sont
entérinés par rien.

### 8.2 Scénario « ouverture pop 12 »

Même seed (`selfplay`), même politique, même durée ; seule variable : la technologie
est achetée, ou retirée de `TECH_ORDER` pour le témoin.

| Mesure | Témoin | Avec Well Shafts |
|---|---:|---:|
| ouverture prête | t=321 | t=313 |
| âge 2 atteint | t=321 | t=313 |
| 12 colons | t=328 | t=320 |
| `waterPerWell` | 2 | 3 |
| production d'eau | 12/tick | 18/tick |
| puits (dont staffés) | 7 (6) | 7 (6) |
| postes staffés / libres | 12 / 0 | 12 / 0 |
| trésorerie | 89 | 175 |

L'option avance l'ouverture de 8 ticks et laisse 86 pièces de plus, mais elle ne
libère **aucun** poste : la politique bâtit 7 puits et le staffing les prend tous
(priorité 1). À 12 colons, 6 puits × 3 = 18 eau pour 12 bouches — le gain est de
l'eau, pas des bras.

### 8.3 Scénario « ligne de croissance », 1 500 ticks

| t | Témoin : pop / puits / planches / pièces | Avec : pop / puits / planches / pièces |
|---:|---|---|
| 450 | 19 / 9 / 3 / 61 | 35 / 9 / 20 / 59 |
| 900 | 42 / 21 / 1 / 36 | 86 (plafond) / 31 / 14 / 43 |
| 1200 | 61 / 30 / 1 / 64 | 86 / 33 / 14 / 3 462 |
| 1500 | 86 / 43 / 1 / 57 | 86 / 33 / 14 / 7 968 |

État final détaillé :

| Mesure à t=1500 | Témoin | Avec |
|---|---:|---:|
| population | 86 (plafond de croissance du harnais) | 86 |
| puits staffés / nécessaires | 43 / 43 | 33 / 29 |
| production d'eau | 86 (= population) | 99 |
| eau en stock | 1 | 240 (capacité pleine) |
| nourriture | 32 | 235 |
| bois / planches | 74 / 1 | 1 / 14 |
| trésorerie | 57 | 7 968 |
| ateliers staffés | 0 / 4 | 4 / 4 |
| pollution | 37 | 57 |
| technologies | 4 | 7 |
| jalons de sortie d'âge 2 | 32/60 nourriture, 4/5 technologies → **non** | 235/60, 7/5 → **oui** |
| `canAdvanceAge(state)` | `false` | `true` |

### 8.4 Ce que la mesure établit

1. **Le critère principal est rempli, avec une réserve d'interprétation.** L'option ne
   coûte ni population ni croissance (même plafond de 86 colons) et elle rend le
   passage âge 2 → âge 3 satisfaisable à t=1500, là où le témoin échoue sur deux
   jalons (nourriture et technologies). Mais l'âge 3 n'est **pas atteint** dans la
   simulation : le gouverneur n'appelle `advanceAge` que depuis l'âge 1, donc seul
   `canAdvanceAge` au niveau 2 est mesuré. L'âge 3 réel reste intestable sur cette
   ligne tant que la politique du harnais ne progresse pas.
2. **Un tiers d'eau par puits ne libère pas de poste à 10–12 colons.** La marge
   arithmétique existe (`ceil(10/3) = 4` puits au lieu de 5) mais n'est capturée que
   si le plan cesse de bâtir `ceil(N/2)+1` puits. Tel quel, le puits reste prioritaire
   au staffing et absorbe la marge : à 86 colons, 33 puits staffés pour 29
   nécessaires, soit 4 postes payés en eau (99 produites pour 86 bues). **L'option C
   seule ne répond donc pas à la question du §1** ; elle déplace la contrainte d'un
   cran, et la dernière marche est une politique de construction, pas une loi.
3. **L'effet réel se lit à l'échelle de la partie.** Le témoin finit avec une
   industrie endormie (0 atelier staffé, 1 planche) ; la ligne équipée atteint le
   plafond vers t=900 et finit avec 4 ateliers staffés, 14 planches, pollution 57 et
   7 968 pièces. C'est la première fois qu'une variante mesurée garde la chaîne
   industrielle allumée à la fin d'une ligne de croissance.
4. **Coût principal, non prévu par la fiche : le puits de dépense ne suit plus.** La
   garde Step087 vérifie que l'achat de toutes les technologies absorbe l'excédent ;
   avec l'option il reste **5 968 pièces** après achat complet (contre 1 avant).
   L'économie de fin de partie redevient dégénérée (argent sans emploi). Trois
   sorties possibles, aucune tranchée ici : vendre la technologie plus cher, la
   déplacer à l'âge 2, ou ajouter un puits de dépense.
5. **Deux postures du harnais changent** (garde Step085, re-mesurée) : la bande de
   réveil des ateliers (`water > pop*2`) redevient vivante — 981 ticks, la dernière à
   t=1500, contre 347 avant — et la bande de repos des puits reste quasi morte (8
   ticks), la citerne plafonnant à 240 quand la règle réclame 352 à 86 colons. La
   conséquence est directe : l'option répare ce que Step085 décrivait (industrie
   éteinte faute d'eau) tout en laissant la bande de repos inatteignable.
6. **Crise hydrique : non mesurée.** La réserve de `ceil(N/2)` puits n'est plus le bon
   seuil quand un puits sert 3 bouches ; la sécheresse reste un retrait plat, donc la
   marge sous sécheresse grandit. Aucun scénario de crise n'a été rejoué : c'est la
   donnée manquante n° 5 du §5, toujours ouverte.

### 8.5 Validation

| Commande | Résultat | Durée |
|---|---|---:|
| `node node_modules/vitest/vitest.mjs run` | 31 fichiers, **191 tests** verts | 7,2 s |
| `node node_modules/eslint/bin/eslint.js .` | 0 constat | 3,4 s |
| `npx tsc --noEmit` | 0 erreur | 3,5 s |
| `node tools/testing/audit-vacuity.mjs` | 39 fichiers, 206 déclarations, 0 constat | 1,0 s |
| `playwright test e2e/progression.spec.ts` | 1/1 — la seule surface d'écran touchée | 8,3 s |

**Non exécuté, et pourquoi.** Les quatre autres scénarios du §6 (développement
industriel précoce, partie prudente, partie orientée progression, seed défavorable)
demandent chacun une politique de gouverneur qui n'existe pas encore ; l'âge 3 réel
est hors de portée pour la raison du §8.4.1. Seule la spec `progression` a été
relancée, la seule surface d'écran qui bouge (un bouton de recherche de plus dans le
panneau existant) ; les autres journeys ne touchent pas la liste des technologies.

### 8.6 Mesure complémentaire du 18 novembre — l'échelle de la question

Le §8.3 mesurait la ligne à t = 1 500, où la colonie compte 86 colons et
24 inoccupés : le coût d'un puits en trop y est invisible. La mesure a donc été
reprise **aux premiers ticks à population 12 puis 13**, c'est-à-dire là où un
poste vaut de l'industrie. Protocole identique (même seed, même politique, la
seule variable étant `wellShafts` dans l'ordre d'achat).

| Mesure | Témoin | Avec C |
|---|---:|---:|
| population 12 atteinte à | t = 328 | t = 320 |
| puits construits / staffés / **nécessaires** | 7 / 6 / **6** | 7 / 6 / **4** |
| eau en stock (production) | 28 (12/t) | 34 (**18/t**) |
| fermes staffées | 3 / 5 | 5 / 5 |
| ateliers staffés | **3 / 4** | **1 / 4** |
| travailleurs libres | 0 | 0 |

| Mesure | Témoin | Avec C |
|---|---:|---:|
| population 13 atteinte à | t = 330 | t = 322 |
| puits construits / staffés / **nécessaires** | 7 / 7 / **7** | 7 / 7 / **5** |
| eau en stock (production) | 30 (14/t) | 49 (**21/t**) |
| ateliers staffés | 2 / 4 | 1 / 4 |
| travailleurs libres | 0 | 0 |

Ce que cette mesure ajoute au §8.4 :

1. **La marge hydrique existe dès pop 12** (6 eau/t de surplus, 7 à pop 13) et ne
   devient **jamais** un travailleur : 0 colon libre dans les deux modes. Le
   mécanisme est nommé — la loi de staffing sert tous les puits **construits**
   (priorité 1) et le plan continue de bâtir `ceil(N/2)+1` puits, soit 7 là où 4
   suffisent. L'arithmétique `ceil(N/3)` libérerait donc 2 postes, mais elle est
   une **doctrine de construction**, pas une loi du jeu : elle n'existe nulle part
   dans `src/`.
2. **Le gain d'ateliers est nul, voire négatif à cet instant** (1/4 contre 3/4) :
   c'est un instantané unique, sur un tour où la trésorerie diffère (175 contre
   89) donc où l'ordre de construction diverge. Rien ne permet d'en tirer une
   conclusion causale ; c'est une **donnée à instrumenter**, pas un argument.
3. **Robustesse aux seeds** : sur cinq seeds jouables (`selfplay`, `measure-2`,
   `d2-a`, `d2-b`, `d2-c`), tous les indicateurs sont identiques sauf la
   trésorerie finale de `measure-2` (8 652 au lieu de 7 968). Trois autres seeds
   (`alpha`, `beta`, `gamma`) ne démarrent pas — `createInitialState` lève « world
   has no room for D2 roads ». La couverture multi-seeds du dossier est donc plus
   étroite qu'annoncée.
4. **Réconciliation des deux trésoreries du dossier** : la ligne de croissance
   reste en âge 2 et n'achète que 7 technologies ; 7 968 − 2 000 (les deux
   technologies d'âge 3) = **5 968**, le chiffre de la garde Step087, qui joue une
   ligne d'âge 3 et achète les neuf. Les deux mesures concordent.

**Défaut de cohérence relevé puis corrigé le 18 novembre 2026.**
`waterWorkerReserve` (`src/domain/jobs/jobs.ts`) réservait `ceil(pop / 2)` puits
avec pour justification « deux eau par puits », alors que `ordinaryWaterCapacity`,
dans le même fichier, lit `waterPerWell` : sous option C la réserve grave
sur-protégeait d'un puits à pop 10–13. La réserve dérive désormais de la loi
(`ceil(pop / max(1, waterPerWell))`) et un test verrouille les trois cas (6/4/6 à
12 colons), sécheresse comprise. Correction de cohérence : sans technologie, les
deux formules coïncident, donc les mesures ci-dessus restent valables.

Les arbitrages qui en découlent sont dans `decisions/D1-option-c.md` et
`decisions/D2-well-build-policy.md`.
