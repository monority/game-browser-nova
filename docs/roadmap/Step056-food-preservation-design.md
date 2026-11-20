# Step056 — Conservation alimentaire et résilience économique : conception et mesure

**Type : conception, mesure et recommandation. AUCUN changement de mécanique,
de constante, de plafond, de sauvegarde ni de code de simulation.**
Baseline vérifiée : branche `main`, HEAD `34690c0`, arbre propre, `SAVE_VERSION`
18, guardrails self-play 7/7 verts (3,9 s) exécutés pendant l'étape.

> **Conflit de numérotation (à arbitrer).** `Step056` est déjà utilisé par
> `docs/roadmap/Step056-step052-triage-and-pollution-legibility.md` (ligne de
> pollution par bâtiment, compteur de blocage d'admission). Le nom de fichier
> demandé par le brief est conservé ici pour rester traçable ; le prochain
> numéro libre est `Step067` (Step066 = correction de lisibilité du 2026-11-12).
> Recommandation : renommer ce document `Step067-food-preservation-design.md`
> avant tout commit.

---

## 1. État initial vérifié

| Élément | Valeur constatée |
|---|---|
| Branche / HEAD | `main` / `34690c0` (docs : règle de la ligne HEAD) |
| Arbre de travail | propre, aucun stash, aucun commit local en avance |
| `SAVE_VERSION` | 18 (`src/application/persistence/save.ts:32`), migration plancher 13 |
| Guardrails | `tests/selfplay.test.ts` — 7 tests, 7 verts, 3,9 s |
| Commandes | `pnpm check` (typecheck→lint→unit), `pnpm build`, `pnpm test:e2e` |
| Banc de mesure | outil temporaire `tools/bench/step056.mjs`, exécuté puis **supprimé** |

Le banc ne réimplémente aucune règle : chaque tick appelle le vrai
`stepSimulation`, les bâtiments passent par le vrai `applyCommand`, la
production est lue par le vrai `foodProductionPerTick`. Sa fidélité est
vérifiée à l'exécution :

- 200 ticks sans péremption ⇒ état **bit-identique** à un run `stepSimulation`
  direct (`controlMatchesStepSimulation: true`) ;
- l'ouverture D2 livrée pince au **t=70**, la valeur déjà mesurée par l'audit ;
- l'identité du grand livre tient sur chaque run :
  `stock₀ + produit − consommé − perdu − écrêté + manne = stock₁` ;
- réserve de l'ouverture : 120/10 = **12 ticks**, conforme au chiffrage de
  l'audit.

La seule addition du banc est un **drain de péremption en tout début de tick**
(avant production) — la phase qu'un futur `spoilStorage` occuperait.

## 2. Architecture économique actuelle

### 2.1 Cycle de vie de la nourriture

| Étape | Code | Comportement |
|---|---|---|
| Production | `src/domain/production/production.ts:39` `foodProductionPerTick` | fermes staffées × (2 + `farmFood`) + 1 (Centre) |
| Ajout au stock | `production.ts:49` `produceFood` | `addFood`, clamp ≥ 0 |
| Consommation | `production.ts:86` `consumeFood` | `min(stock, population)` — repas partiel, renvoie le nombre nourri |
| Plafond | `src/domain/storage/storage.ts:34` | `120 + 60 × entrepôts actifs` |
| Écrêtage | `storage.ts:47` `clampStorage` | surplus détruit, renvoie `{foodWasted, waterWasted}` |
| Prévisions | `src/application/queries/analysis.ts:45` | production, **besoin**, balance, `ticksRemaining` (stock → 0) |
| Autonomie | même fonction | `ticksRemaining` n'existe que si la balance est négative |
| Population | `src/domain/population/population.ts:40` | famine = −1 colon/tick non nourri ; admission +1/tick |

### 2.2 Ordre des phases (`src/domain/simulation/tick.ts:43`)

1 construction · 2 production · 3–4 extraction/transformation · 5 consommation ·
**6 `clampStorage`** · 7 population · 8 environnement · 9 staffing · 10 argent ·
11 événements.

Deux conséquences structurelles, vérifiées dans le code :

- **l'écrêtage court après la consommation** : il ne mange jamais un repas dû,
  mais il détruit tout le reste, définitivement, sans trace ;
- **la manne de récolte tombe en phase 11**, donc après l'écrêtage : elle est
  écrêtée au tick suivant (mesuré §10).

### 2.3 Ce qui est invisible

`clampStorage` renvoie les quantités perdues, mais **aucun appelant de
production ne lit ce retour** (seul un test le fait). Il n'existe donc :

- aucun cumul « perdu » dans les stats ni dans l'alerte ;
- aucune prévision « le grenier sera plein dans N ticks » ;
- aucun affichage de la réserve en ticks (seulement « le stock dure N ticks »
  quand la balance est négative).

## 3. Diagnostic du surplus alimentaire

Mesures sur 400 ticks, population constante, écrêtage et péremption comptés
séparément :

| Colonie | Production | Besoin | Écrêté | % de la production détruite |
|---|---|---|---|---|
| Ouverture D2 (`5 fermes`, +1/tick) | 11/tick | 10/tick | 130 u. sur 200 ticks | 5,9 % |
| A — 4 fermes `cropRotation` (+3/tick) | 13/tick | 10/tick | 1 140 u. sur 400 ticks | **21,9 %** |
| C — 7 fermes `cropRotation` (+12/tick) | 22/tick | 10/tick | 4 740 u. sur 400 ticks | **53,9 %** |

Le fait central : **la quantité totale détruite ne dépend pas du modèle de
péremption** tant que la colonie reste au plafond. Dans le scénario A, tant que le taux reste sous 3 %, toutes les
variantes (proportionnelle 0,5–2 %, lots 8/12/20/30, seuil 8/12 ticks) détruisent
**21,9 %** de la production ; seule la **répartition** change entre « écrêté » et
« périmé ». À 3 % et 5 %, le total monte un peu (22,3 % et 23,1 %) parce que la
colonie cesse de pincer : la perte continue sous le plafond au lieu de s'arrêter
quand la réserve est pleine. Le modèle ne réduit donc pas la perte, il la **rend lisible** —
et il ne la réduit réellement que lorsqu'il amène l'équilibre sous le plafond
(§6).

Autres constats mesurés :

- la manne de récolte à 110/120 perd **31 de ses 40 unités** au clamp du tick
  suivant, avant même toute péremption (§10) ;
- une colonie en déficit meurt plus tôt dès qu'une péremption s'ajoute : famine
  t=21 sans péremption, t=17 à 2 %, t=14 à 5 % (§5.4).

## 4. Comparaison des modèles de péremption

### 4.1 Les trois modèles évalués

| Critère | A — proportionnelle | B — lots (FIFO, durée L) | C — seuil + proportionnelle |
|---|---|---|---|
| Formule | `perte = stock × k` | cohortes, `âge > L` détruit | `perte = max(0, stock − seuil) × k` |
| Réalisme | moyen (décroissance continue) | **élevé** (durée de conservation) | faible (comportement à deux régimes) |
| Lisibilité joueur | bonne si taux affiché | **meilleure** (« se garde L ticks ») | moyenne : seuil invisible |
| Déterminisme | total, **si** le reste fractionnaire est porté | total, quantités entières | total, même réserve que A |
| Complexité code | 1 phase + 1 accumulateur | 1 phase + file de cohortes | 1 phase + 1 seuil + 1 accumulateur |
| CPU / mémoire | O(1) | O(nombre de cohortes) | O(1) |
| Sauvegarde | 1 scalaire (v19) **ou** arrondi destructeur | **tableau persisté** (v19, croissance non bornée) | 1 scalaire + seuil dérivé |
| Testabilité | très simple (loi fermée) | moyenne (invariant de file) | simple |
| Effet sur la difficulté | progressif, prévisible | **tout ou rien** selon L | progressif au-delà du seuil |
| Risque d'effondrement | faible si k ≤ 3 % | moyen (perte par blocs) | faible |

### 4.2 Ce que la mesure dit de B

Le modèle B avec `L = 12` **ne perd rien du tout** dans une colonie dont la
réserve ne dépasse jamais 12 ticks (scénario A : 0 unité perdue, tout passe par
le clamp). Avec `L = 8`, il perd 1 140 unités — exactement ce que le clamp
aurait détruit. Autrement dit : **B dégénère en « rien » précisément dans le
régime où le jeu tourne aujourd'hui** (réserve ≤ 12 ticks à pop 10), et devient
punitif par blocs dès qu'on le baisse. Il faudrait donc, pour que B produise un
effet, une durée de conservation *inférieure* à la réserve actuelle — c'est-à-dire
un ré-ancrage complet, plus lourd que le modèle A pour un résultat moins
prévisible.

### 4.3 Le problème d'arrondi, qui décide de l'architecture

La nourriture est un entier. À 2 %, une réserve de 12 unités perd
`12 × 0,02 = 0,24` unité par tick : **arrondi à l'entier, la perte est nulle**.
Sans report fractionnaire, un taux de 2 % ne mord qu'au-dessus de 50 unités, et
un taux de 1 % au-dessus de 100 — soit un **seuil caché** exactement du type que
le modèle C rend explicite. Les deux issues honnêtes sont :

1. porter le reste fractionnaire (`carry`) dans l'état ⇒ **v19** ;
2. assumer un seuil et l'afficher (modèle C).

Le banc a mesuré avec report ; c'est la seule variante qui donne les équilibres
de §6.

## 5. Résultats des scénarios économiques

Paramètres communs : seed `step056-bench`, monde 24×24, événements off sauf
§5.6, 400 ticks (500 pour §6), population constante par logement. « Équil. » =
réserve moyenne des 50 derniers ticks ; « resT » = équil./population.

### 5.1 A — colonie stable (pop 10, 4 fermes `cropRotation` = 13/tick, +3)

| Modèle | Équil. | resT | Perdu (périmé) | Écrêté | Total détruit | Pincé |
|---|---|---|---|---|---|---|
| aucun | 120 | 12 | 0 | 1 140 | 21,9 % | 381/400 |
| A 0,5 % | 120 | 12 | 236 | 904 | 21,9 % | 377 |
| A 1 % | 120 | 12 | 471 | 669 | 21,9 % | 372 |
| A 2 % | 120 | 12 | 932 | 208 | 21,9 % | 347 |
| **A 3 %** | **100** | **10** | 1 160 | **0** | 22,3 % | **0** |
| A 5 % | 60 | 6 | 1 200 | 0 | 23,1 % | 0 |
| B 8 / 12 / 20 / 30 | 120 | 12 | 1 140 / 0 / 0 / 0 | 0 / 1 140 / 1 140 / 1 140 | 21,9 % | 381 |
| C 8@2 / 8@3 / 12@2 | 120 | 12 | 308 / 462 / 0 | 832 / 678 / 1 140 | 21,9 % | 379 |

Lecture : à 3 % la colonie cesse de pincer et vit sur une réserve de 10 ticks ;
en dessous, elle pinte toujours et le modèle ne change que l'étiquette de la
perte. C'est la démonstration du §3.

### 5.2 B — colonie en croissance (pop 10 → 18, 6 fermes `cropRotation` = 19/tick)

| Modèle | Pop finale | Équil. | resT | Perdu | Écrêté | % détruit |
|---|---|---|---|---|---|---|
| aucun | 18 | 120 | 6,7 | 0 | 321 | 4,2 % |
| A 0,5 % | 18 | 120 | 6,7 | 215 | 106 | 4,2 % |
| A 1 % | 18 | 98,8 | **5,5** | 342 | 0 | 4,5 % |
| A 2 % | 18 | 50 | **2,8** | 391 | 0 | 5,1 % |
| A 3 % | 18 | 33,3 | **1,9** | 407 | 0 | 5,4 % |
| B 8 – B 30, C 8, C 12 | 18 | 120 | 6,7 | 0 | 321 | 4,2 % |

Aucune famine, aucune perte de population : la croissance n'est pas bloquée.
Mais la **marge de réaction fond** : 6,7 ticks sans péremption, 2,8 à 2 %,
1,9 à 3 %. C'est le coût réel du système : il ne tue pas, il retire du temps.

### 5.3 C — surproduction (pop 10, 7 fermes `cropRotation` = 22/tick, +12)

| Modèle | Équil. | Perdu | Écrêté | % détruit | Pincé |
|---|---|---|---|---|---|
| aucun | 120 | 0 | 4 740 | 53,9 % | 396/400 |
| A 2 % | 120 | 955 | 3 785 | 53,9 % | 395 |
| A 3 % | 120 | 1 433 | 3 307 | 53,9 % | 394 |
| A 5 % | 120 | 2 387 | 2 353 | 53,9 % | 393 |
| B 8 | 120 | 1 170 | 3 570 | 53,9 % | 396 |

**Résultat négatif important** : la péremption n'est pas un exutoire à la
surproduction. À 22/tick contre 10, même 5 % (6 unités/tick à 120) ne suffit
pas à ramener l'équilibre sous le plafond ; le jeu détruit 54 % de la
production quel que soit le modèle. Le seul exutoire à la surproduction reste
la décision du joueur (arrêter des fermes), ce que le gouverneur fait déjà.

### 5.4 D — production insuffisante (pop 10, 3 fermes = 7/tick, −3/tick, stock 60)

| Modèle | Famine | Pop finale | Perdu |
|---|---|---|---|
| aucun | **t=21** | 7 | 0 |
| A 1 % | t=19 | 7 | 5 |
| A 2 % | **t=17** | 7 | 10 |
| A 3 % | t=16 | 7 | 13 |
| A 5 % | t=14 | 7 | 19 |
| B 8–30, C 8, C 12 | t=21 | 7 | 0 |

La péremption **raccourcit la fenêtre de survie** de 4 ticks à 2 %, 7 ticks à
5 %. Le modèle C à seuil 8 ticks ne mord pas (la réserve de 20 ticks fond avant
d'atteindre le seuil) — comportement voulu, mais qui confirme que C protège le
début de crise et rien d'autre.

### 5.5 E — crise et récupération (même colonie, ferme de secours réactivée)

| Modèle | Correction t=10 → famine | Correction t=40 → famine | Perdu |
|---|---|---|---|
| aucun | **t=39** | t=21 | 0 |
| A 1 % | t=32 | t=19 | 5–7 |
| A 2 % | t=28 | t=17 | 10–11 |
| A 3 % | **t=24** | t=16 | 13–15 |
| B 12, C 8@2 | t=39 | t=21 | 0 |

La récupération reste possible dans tous les cas (le trickle du Centre et
l'admission à +1/tick ne dépendent pas de la réserve) : **aucune crise ne
devient irrécupérable**. Ce que la péremption retire, c'est la possibilité de
corriger *tard* : une correction qui laissait 39 ticks de marge n'en laisse
plus que 24 à 3 %.

### 5.6 F — manne de récolte près du plafond (110/120, manne à t=1, 12 ticks)

| Variante | Trajectoire du stock | Perdu | Écrêté | Fin |
|---|---|---|---|---|
| aucune péremption | 151 → 120 → 120 … | 0 | **42** | 120 |
| aucune, 2 % | 149 → 120 → 119 … 107 | 28 | 27 | 107 |
| aucune, 3 % | 148 → 120 → 117 … 97 | 40 | 25 | 97 |
| festin immédiat | 70 → 71 → … 82 | 0 | **0** | 82 |
| réserve protégée, 2 % | 149 → 120 → 120 … 115 | 19 | 28 | 115 |
| réserve protégée, 3 % | 148 → 120 → 119 … 108 | 28 | 26 | 108 |

Sans péremption, **31 des 40 unités** de la manne sont détruites au clamp du
tick suivant. Protéger la manne de la péremption ne change presque rien : le
destructeur est le **plafond**, pas le temps. Seul le festin immédiat supprime
la perte (zéro écrêté), au prix d'un stock qui n'augmente pas.

## 6. Doctrine des réserves en ticks

### 6.1 La loi, et sa vérification

Sans plafond atteint, la réserve converge vers :

`S* = (P − C) / k` et `R = S* / C = (P/C − 1) / k`, donc
**`P = C (1 + k R)`** — l'équation de la doctrine proposée.

Mesures (pop 10, C = 10) :

| Production | Surplus | k | S* prédit | Équil. mesuré | resT | Famine sous choc |
|---|---|---|---|---|---|---|
| 5 fermes (11/tick) | +1 | 0,5 % | 200 | 120 (plafond) | 12 | non |
| 5 fermes | +1 | 1 % | 100 | **99** | 9,9 | non |
| 5 fermes | +1 | 2 % | 50 | **50** | 5 | non |
| 5 fermes | +1 | 3 % | 33,3 | **33,3** | 3,3 | non |
| 5 fermes | +1 | 5 % | 20 | **20** | 2 | **oui (t+15)** |
| 4 fermes `cropRotation` (13/tick) | +3 | 2 % | 150 | 120 (plafond) | 12 | non |
| 4 fermes `cropRotation` | +3 | 3 % | 100 | **100** | 10 | non |
| 4 fermes `cropRotation` | +3 | 5 % | 60 | **60** | 6 | non |

La loi est vérifiée à l'unité sur cinq taux. Le « choc » est la mise au repos
d'une ferme pendant 20 ticks depuis l'équilibre (production −2/tick).

### 6.2 Les quatre niveaux demandés (4 / 8 / 12 / 16 ticks)

| Réserve visée | Points réellement atteignables (pop 10) | Verdict |
|---|---|---|
| 4 ticks | 3,3 (+1/tick à 3 %) ou 5 (+1 à 2 %) | encadrée, jamais exacte |
| 8 ticks | 5 (+1 à 2 %) ou 10 (+1 à 1 %, +3 à 3 %) | encadrée, jamais exacte |
| 12 ticks | 10 (+1 à 1 %, +3 à 3 %), ou 12 plafonné (+3 à 2 %, 208 u. écrêtées) | atteinte seulement au plafond, donc avec perte |
| 16 ticks | inaccessible : 15 exigerait +3 à 2 %, soit 150 u. pour un plafond de 120 | **impossible sans relever la capacité** |


Les deux seuls surplus disponibles à pop 10 (+1 et +3/tick) donnent la grille
mesurée : **10 ticks (1 %, +1), 5 (2 %, +1), 3,3 (3 %, +1), 2 (5 %, +1),
10 (3 %, +3), 6 (5 %, +3)**. Aucune cible de 4, 8 ou 16 ticks n'est atteignable
exactement.

**La granularité est le vrai obstacle** : une ferme vaut 2/tick (3 avec tech)
pour une consommation de 10/tick, soit des pas de 20 à 30 % de la production.
À pop 10 on ne peut pas viser 4 ou 16 ticks ; on peut viser 10 (1 % +1/tick ou
3 % +3/tick). À pop 18 (besoin 18), 6 fermes tech = 19/tick : +1/tick → 1 % donne
5,5 ticks, 2 % donne 2,8. **Une doctrine en ticks exige donc un réglage plus fin
que « une ferme »** : soit des demi-niveaux de tech, soit des rations (Âge 2),
soit une capacité en ticks (S10) qui fixe la cible autrement.

### 6.3 Le couplage avec la capacité

À pop 24, viser 12 ticks demande 288 unités de capacité : le plafond de base
(120) en donne 5, un entrepôt (180) en donne 7,5, il en faut trois pour 12.
**Une doctrine en ticks rend la capacité dépendante de la population** — c'est
exactement le sujet de S10/Q7, et sans lui les entrepôts redeviennent
obligatoires. À noter : l'entrepôt passif (2 planks, sans main-d'œuvre) est
aujourd'hui un achat sans décision ; sous doctrine en ticks, il devient la
variable qui maintient la cible.

## 7. Paramètres testés et configurations retenues

| Configuration | Pertes/tick (A, +3/tick) | resT | Diagnostic |
|---|---|---|---|
| 0,5 % | 0,6 | 12 (plafond) | **trop permissive** : n'empêche pas le pin, perte invisible |
| 1 % | 1,2 | 12 (plafond) / 9,9 (+1) | permissive : le plafond reste le seul exutoire en surplus |
| **2 %** | 2,3 | 5 à +1, 12 (plafond) à +3 | **intermédiaire** : mord partout, marge 5 ticks à pop 10 |
| **3 %** | 3,0 | 10 (+3), 3,3 (+1) | **recommandée** : premier taux qui supprime le pin à +3/tick |
| 5 % | 3,0 | 6 (+3), 2 (+1) | **trop punitive** : famine sous un choc de 20 ticks à +1/tick |
| B 8 | = écrêté | 12 | équivalent à rien (le clamp fait le travail) |
| B 12–30 | 0 | 12 | **aucun effet** dans le régime actuel |
| C 8@2 / 8@3 / 12@2 | 0,8 / 1,2 / 0 | 12 | protège la réserve basse, ne touche pas le pin |

Trois configurations suffisent à la décision : **1 % (permissive), 3 %
(recommandée), 5 % (punitive)**. Entre 2 et 3 %, le choix se fait sur un seul
critère : veut-on que la colonie cesse de pincer à +3/tick (3 %) ou accepte-t-on
le pin avec 208 unités écrêtées (2 %) ?

## 8. Recommandation de modèle

**Modèle A — péremption proportionnelle, avec report fractionnaire, en phase
5b (après production, avant consommation), taux 3 %/tick pour la nourriture.**

Justification mesurée :

1. c'est le seul modèle qui produit un équilibre ferme et prévisible
   (`S* = (P − C)/k`, vérifié à l'unité) ;
2. c'est le seul qui supprime le pin sans toucher aux constantes de production
   (scénario A : 0 tick pincé à 3 %) ;
3. B n'a **aucun effet** dans le régime de réserve actuel et exige des cohortes
   persistées ; C ajoute un seuil invisible et protège surtout le début de
   crise, ce que le joueur comprend moins bien qu'un taux ;
4. le coût d'état est **un scalaire** (le reste fractionnaire) contre un tableau
   pour B.

Points de spécification à respecter à l'implémentation :

- la péremption s'applique **avant la consommation** (les colons mangent ce qui
  reste, pas l'inverse) et **après la production** : elle ne doit jamais créer
  une famine là où le tick produisait assez ;
- elle ne s'applique **jamais** au stock négatif (il ne l'est pas) ni aux
  ressources non périssables ;
- le taux est une constante unique par ressource, dans `src/content/`, pas une
  valeur en dur dans `tick.ts` ;
- l'eau suit la même loi **si** le propriétaire le décide (non mesuré ici : la
  réserve d'eau a une autre dynamique, cf. §13).

## 9. Impacts architecturaux et sauvegardes

| Question | Réponse mesurée / dérivée |
|---|---|
| Le stock global suffit-il ? | **Oui** pour A et C ; non pour B (cohortes). |
| Faut-il persister des lots ? | Non pour A. B exige un tableau de cohortes, non borné en taille. |
| Migration v18 → v19 nécessaire ? | **Oui pour A**, à cause du report fractionnaire : `foodSpoilCarry` (et `waterSpoilCarry` si l'eau suit). Sans lui, la perte entière est nulle sous 1/k unités (50 à 2 %), donc un seuil caché. |
| Les stocks existants survivent-ils ? | Oui : la migration initialise le report à 0 ; aucune unité n'est perdue ni dupliquée. |
| Migration déterministe ? | Oui : champ scalaire, valeur initiale fixe, aucune dépendance au tick. |
| Risque de duplication de données dérivées ? | Faible : le report est un **état**, pas un doublon ; l'autonomie en ticks reste **dérivée** (`stock / besoin`) et ne doit jamais être persistée. |

Alternative sans migration, si Q3 est refusée : **modèle C** avec un seuil
explicite (`seuil = 2 ticks de consommation`) et une perte entière. On accepte
alors que la réserve basse ne pourrisse pas, et on l'affiche. C'est moins
élégant, mais c'est cohérent et sans état nouveau.

## 10. Manne de récolte : comparaison des quatre options

La mesure de référence (§5.6) : la manne arrive en phase 11, le clamp tourne en
phase 6 du tick suivant, et **31 des 40 unités** sont détruites.

| Option | Lisibilité | Intérêt stratégique | Interaction avec la péremption | Risque | Complexité | Identité NOVA |
|---|---|---|---|---|---|---|
| A — bonus temporaire de capacité (+40 pendant 40 ticks) | moyenne (« capacité 160 » puis retour) | faible : rien à décider, le bonus expire seul | **annule le clamp**, puis la péremption ronge le surplus | moyen : capacité instable, valeurs qui sautent | moyenne (capacité temporaire = second plafond) | moyen |
| B — **festin immédiat** | **forte** (« la récolte est mangée sur place ») | moyen : fête visible, aucun stock à gérer | **aucune** : rien n'entre dans le stock, donc rien à perdre | faible | faible (une consommation one-off) | **fort** (cohérent avec « pas de marché », les colons mangent) |
| C — réserve protégée de la péremption | moyenne (notion invisible de « protégé ») | faible | partielle : mesuré 19–28 unités perdues quand même | faible | moyenne (cohorte à part) | faible |
| D — relève durable du plafond | faible (« pourquoi +40 maintenant ? ») | faible : un bonus permanent non gagné | déplace le problème : la réserve repousse le pin | **élevé** : capacité gratuite et permanente | faible | faible |

**Recommandation : option B**, spécifiée comme une consommation immédiate au
spawn — par exemple chaque colon mange jusqu'à 4 portions ce tick-là, le reste
entre au grenier. Mesuré : zéro écrêté, zéro péremption, la manne devient un
repas au lieu d'un stock (trajectoire `70 → 82`). Options A et D ne sont pas
recommandées : elles déplacent le problème du plafond sans créer de décision,
et A fait osciller un chiffre que le joueur vient d'apprendre à lire.

## 11. Contrat d'affichage proposé (aucune UI développée)

Hiérarchie proposée, du plus stable au plus volatil :

```
Food        120 / 150        ← stock et capacité (le plafond est la contrainte)
Production  +13 /tick
Consumption -10 /tick
Spoilage     -3 /tick        ← toujours présent, 0 inclus (une ligne qui apparaît = du bruit)
Net          +0 /tick
Reserve      12 ticks        ← dérivée : stock / consommation, jamais persistée
```

Règles de lisibilité :

1. **la péremption est une ligne permanente**, à 0 comme à 3 : elle explique
   pourquoi le stock ne monte pas malgré une balance positive ;
2. **`Reserve` remplace `ticksRemaining`** dans l'usage courant : c'est la même
   division, mais elle a un sens dans les deux signes. Garder
   « épuisé dans N ticks » uniquement quand la balance est négative ;
3. **le risque est un état, pas une consigne** (règle §7) : « réserve basse
   (2 ticks) », pas « construisez une ferme » ;
4. **pas de pourcentage de gaspillage dans le panneau principal** — il va dans
   le détail (drill-down) avec la répartition périmé / écrêté, sinon il vole la
   place aux flux ;
5. quand le stock est au plafond **et** que la balance est positive, l'alerte
   dit la perte réelle (u./tick), pas l'état du bâtiment.

## 12. Résultats face aux guardrails

Référence exécutée pendant l'étape : `tests/selfplay.test.ts`, **7/7
verts, 3,9 s** (les sept : boucle MVP complète, récupération d'une trésorerie à
zéro, croissance au-delà de pop 12, déterminisme bit-à-bit, boucle MVP avec
événements, seed de robustesse `measure-2`, Âge 3 prospère).

| Guardrail | Vérifiable à cette étape ? | Ce que la mesure en dit |
|---|---|---|
| Boucle MVP complète | **non** | exige le gouverneur, qui ne peut pas recevoir la péremption sans modifier `stepSimulation` ou `selfplay.governor.ts` |
| Récupération crise économique | **partiellement** | scénario E : la récupération reste possible à tous les taux ; le gouverneur n'est pas testé |
| Croissance démographique | **partiellement** | scénario B : pop 10 → 18, aucune famine ; la marge tombe de 6,7 à 1,9 ticks |
| Déterminisme bit-à-bit | **oui** | le banc est bit-identique au pipeline sans péremption ; le modèle A n'introduit aucun aléa |
| Prospérité Âge 3 | non | hors périmètre du banc (le pin y est déjà mesuré) |
| Fonctionnement avec événements | **oui** (mécanisme) | scénario F exécuté avec le vrai `resolveEvents` |
| Robustesse seed alternatif | **oui** (mécanisme) | le banc est paramétré par seed ; la manne a été trouvée par tirage réel |

**Limite explicite** : aucun guardrail ne peut être exécuté *avec* la
péremption active, puisque la mécanique n'existe pas. Les sept passent avec le
code actuel, ce qui établit la référence, pas la compatibilité. La compatibilité
devra être démontrée à l'implémentation, avec les seuils inchangés — c'est un
critère d'acceptation de l'étape suivante, pas un résultat de celle-ci.

## 13. Risques et incertitudes

**Faits mesurés.** Loi `S* = (P − C)/k` vérifiée à l'unité ; pin supprimé à 3 %
dans le scénario A ; 54 % de perte en surproduction quel que soit le modèle ;
famine avancée de 4 à 7 ticks en déficit ; manne perdant 31/40 au clamp ; B sans
effet pour `L ≥ 12`.

**Dérivé (arithmétique, non exécuté).** Le couplage capacité/population (§6.3) ;
le coût en bâtiments d'une cible 16 ticks ; les options A et D de la manne,
qu'on ne peut pas injecter sans modifier `foodCapacity`.

**Hypothèses.** Que le joueur accepte une perte continue comme information
plutôt que comme punition ; que `cropRotation` reste la tech d'équilibrage (elle
devient *nécessaire* à 3 %) ; que la population reste le seul consommateur.

**Jugement.** Le choix A vs C en cas de refus de migration, et le taux 2 vs 3 %.

**Incertitudes à lever avant implémentation :**

- l'eau : sa réserve (80 de base, 3,3 ticks à pop 24) n'a pas la même
  dynamique ; appliquer la même loi sans mesure serait une extrapolation ;
- l'entrepôt : aujourd'hui achat passif sans décision ; sous péremption il
  devient la variable de la cible — faut-il le laisser passif ?
- la granularité de production (§6.2) rend la doctrine en ticks **inapplicable
  telle quelle** à pop 10 ; il manque un réglage fin ;
- l'audit du 2026-11-12 situait le taux nécessaire à ~3 % à pop 16 ; la mesure
  ici donne 2 % → 2,8 ticks à pop 18 et 3 % → 1,9 tick. Les deux sont cohérents
  (2 % reste trop faible pour une cible de 12 ticks) mais **ne fixent pas un
  taux unique pour toutes les populations** : à pop croissante, la même cible
  demande un surplus croissant, donc un taux qui ne peut pas être constant si
  la cible l'est.

## 14. Décisions restant à arbitrer

| # | Question | Ce que la mesure permet de dire |
|---|---|---|
| Q3 | Migration `SAVE_VERSION` 18 → 19 acceptable ? | Oui pour A (1 scalaire). Refus ⇒ modèle C à seuil affiché, sans état. |
| Q4 | Quel exutoire au surplus ? | La péremption **n'est pas** un exutoire à la surproduction (§5.3) : elle ne remplace pas une décision d'arrêt de production. Elle est un exutoire à la *réserve*, pas au *débit*. |
| Q7 | Capacité en ticks plutôt qu'en constantes ? | Devient **nécessaire** si la cible est exprimée en ticks (§6.3), sinon les entrepôts sont obligatoires à pop 24. |
| Q8 | Re-spécifier la manne ? | Oui : option B (festin), zéro perte mesurée. |
| Q9 | Registre des pertes persisté ou dérivé ? | Dérivé suffit (session) ; la règle §20 aime l'historique, mais ce n'est pas requis par le modèle. |
| Q12 | Passer de « balance exacte » à « tampon cible » ? | Oui, et c'est **obligatoire** : les journeys actuels sont à balance exacte ; à 1 tick de déficit ils meurent plus tôt dès qu'une péremption existe (§5.4). |
| **N1** | Taux : 2 % ou 3 % ? | 3 % est le premier taux qui supprime le pin mesuré à +3/tick ; 2 % laisse le pin avec 208 u. écrêtées. |
| **N2** | Modèle A ou C si Q3 est refusée ? | C, avec seuil affiché (2 ticks) — pas d'arrondi silencieux. |
| **N3** | Cible de réserve : combien de ticks, et **constante ou proportionnelle** ? | Une cible constante est inatteignable avec la granularité actuelle ; proportionnelle = capacité en ticks (Q7). |
| **N4** | L'eau périme-t-elle aussi ? | Non mesuré ici ; à trancher avant d'écrire la phase. |

## 15. Découpage proposé des prochaines étapes

1. **Instrumentation seule** (aucune péremption) : cumul des pertes
   (`clampStorage` déjà renvoyé, jamais lu), prévision « plein dans N ticks »,
   réserve en ticks dans les stats, et un témoin `surplus.jsonl` qui échoue si
   l'écrêtage cesse d'être signalé. Ferme l'invisibilité sans toucher à
   l'équilibre.
2. **Péremption A à 3 %, derrière un drapeau** : phase 5b + `foodSpoilCarry`
   (v19), loi fermée testée à l'unité, scénarios A–F rejoués comme tests
   permanents.
3. **Ré-ancrage** : journeys `age2`/`age3` reconstruits sur la nouvelle loi
   (`P = C(1 + kR)`), avec le nombre de fermes documenté, et les sept guardrails
   reverts verts **sans** toucher aux seuils.
4. **Manne en festin** (option B) et contrat UX du §11.
5. **Décision Q7/N3** (capacité en ticks) une fois 1–4 en place : c'est le seul
   point qui change toutes les valeurs des scénarios.

---

## Annexe — reproductibilité

Le banc a été supprimé après usage (outil temporaire, aucun test permanent
ajouté). Paramètres exacts pour le rejouer :

- seed `step056-bench`, monde 24×24, dépôts wood `(4,4,60)` / stone `(7,18,50)` ;
- fixtures construites par la couche de commandes réelle, argent neutralisé
  (`money = 100000` pendant la construction, 100 après) ;
- scénarios : A `pop 10 / 4 fermes / 5 puits / 10 logements / 60 food /
cropRotation` ; B `pop 10 → 18 / 6 fermes tech / 8 puits / 18 logements` ;
  C `7 fermes tech` ; D `3 fermes / 5 puits` ; E = D + ferme de secours ;
  F = ouverture D2 livrée, `food = 110`, `eventsEnabled`, seed à premier tirage
  `bountifulHarvest` (trouvée par recherche : `harvest-0`) ;
- péremption : drain en début de tick, modèle A avec report fractionnaire,
  B FIFO sur cohortes, C seuil en ticks de consommation ;
- 400 ticks (500 pour les réserves), échantillonnage par tick, grand livre
  vérifié à chaque run.

## Ce que cette étape ne conclut pas

- Elle ne dit pas que la péremption **résout** le surplus de NOVA : elle montre
  qu'elle rend la perte lisible, qu'elle supprime le pin sous un certain taux,
  et qu'elle **coûte** de la marge de survie.
- Elle ne fixe pas le taux définitif : 3 % est la meilleure valeur mesurée sur
  la grille testée, pas une vérité d'équilibrage à pop 24.
- Elle ne valide pas les guardrails sous péremption : la mécanique n'existe pas
  encore, et c'est la limite expérimentale principale de cette étape.
