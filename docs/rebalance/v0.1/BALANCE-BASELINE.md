# NOVA — Balance baseline

Version : 0.1  
Date de mesure : 18 novembre 2026  
Build : `94cbff2`  
Durée : 3 000 ticks  
Statut : mesures de référence rapportées, non reproduites indépendamment ici

## 1. Conditions du scénario

Monde de départ rapporté :
- 10 colonists
- 10 residences
- 5 farms
- 5 wells
- 2 workshops
- 1 park
- 1 center
- 100 coins, 60 food, 40 water

Le scénario utilise la couche de commandes et le tick réel du jeu, avec une politique de jeu scriptée considérée comme compétente. Un seul seed (seed par défaut) a été utilisé.

## 2. Lois et valeurs observées

### Production et besoins

| Élément | Valeur rapportée |
|---|---:|
| Production d'une ferme | 2 food / tick |
| Production d'un puits | 2 water / tick |
| Production d'un camp de bûcherons | 2 wood / tick |
| Production d'une carrière | 2 stone / tick |
| Production d'un atelier | 1 plank / tick |
| Consommation d'un atelier | 2 wood / plank |
| Besoin par colonist | 1 food + 1 water / tick |

### Main-d'œuvre

Pour une population `N`, les besoins imposent, selon les règles rapportées :

- Farms nécessaires : `ceil((N - 1) / 2)`
- Wells nécessaires : `ceil(N / 2)`
- Total des postes essentiels : exactement `N`

Conséquence : la totalité de la main-d'œuvre est absorbée par les besoins alimentaires et hydriques lorsque ces bâtiments sont staffés à leur capacité observée. Aucun travailleur ne reste disponible pour les chaînes industrielles.

### Économie monétaire

| Règle | Valeur rapportée |
|---|---:|
| Taxe | +1 coin / colonist / tick |
| Commerce d'un workshop connecté | +2 coins / tick |
| Entretien d'un bâtiment | -1 coin / tick |
| Résidence | exemptée d'entretien |
| Coût de congestion | `floor((population - 10) / 5)` |

Budget d'ouverture rapporté :
`10 taxes + 4 commerce - 13 entretien = +1 coin / tick`

Effet marginal des actions observées :
- Ajouter une ferme : coût de construction 30, variation nette de budget 0/tick.
- Ajouter un workshop connecté : coût de construction 30, variation nette +1/tick.
- Ajouter un colonist avec résidence, ferme et puits : coût total 75, variation nette -1/tick.

Le commerce est indépendant du staffing dans le build mesuré.

### Stocks et temporalité

| Élément | Valeur rapportée |
|---|---:|
| Capacité granary | 180 food |
| Bonus granary par warehouse | +60 food |
| Capacité water | 80 |
| Bonus water par warehouse | +40 |
| Dégradation des stocks | 3 % / tick |
| Hiver | 15 ticks sur 60 |
| Vitesse 1× | 2 ticks / seconde |
| Vitesse 8× | 16 ticks / seconde |

### Coûts rapportés

- Bâtiment : 25 coins + 2 ticks de construction.
- Route : 5 coins / tile.
- Quarry : 5 planks.
- Warehouse : 2 (unité à confirmer dans la fiche de coût source avant tout arbitrage).

**Point de vérification obligatoire :** confirmer l'unité exacte et les conditions du coût du warehouse avant de définir son accessibilité économique.

## 3. Symptômes reproduits dans le scénario

### 3.1 Industrie inaccessible à 10 colons (voir §8 : ouverte à 13)

- À `t=5` : 12 postes, 10 staffés (5 farms, 5 wells), workshops non staffés.
- À `t=305` : un lumber camp construit près d'un dépôt (4,4), accepté mais non staffé.
- Production de wood : 0.
- Le centre est ancré en (23,23), à environ 20 tiles des dépôts.
- Le flux passif rapporté de 1 wood/tick depuis le centre ne produit rien dans ce scénario.
- La chaîne wood → planks → stone → warehouse n'est donc pas accessible par une partie normale dans ce scénario.

Trois des neuf bâtiments sont décrits comme du contenu mort dans le build mesuré. La liste et les conditions exactes doivent être confirmées dans le catalogue avant d'en faire une assertion exhaustive.
**Vérifié le 18 novembre 2026 (code).** Le catalogue contient bien 9 types de
bâtiments, et `requiredAge` **est** lu par la validation (`placement.ts`) et par
la palette (`controlsPanel.ts`), avec une valeur par défaut de 1 : le mécanisme
existe, aucun contenu ne s'en sert. La seule entrée dont la mort économique est
mesurée aujourd'hui est la **carrière** (aucun consommateur de pierre, voir
`GAME-DESIGN-ECONOMY-RESOURCES.md` §9.4 et `decisions/D3-stone.md`). Ne pas
reprendre « trois des neuf » sans nommer les trois.


### 3.2 Excédent monétaire sans dépense utile

À `t=3000` :
- 12 workshops
- 0 plank produit
- +13 coins/tick
- 33 893 coins
- granary plein
- aucun achat utile restant dans la boucle observée

Le workshop connecté devient un moteur financier même sans production industrielle effective.
**Mesuré le 18 novembre 2026, et réconcilié.** La ligne d'âge 3 (1 500 ticks,
build de référence) achète les neuf technologies et laisse **5 968 pièces** ; la
ligne de croissance (témoin, même politique sans accès à l'âge 3) laisse 57
pièces — non par discipline, mais parce que sa chaîne ne démarre jamais. Le
chiffre rapporté de 33 893 à 3 000 ticks n'a pas été reproduit : durée, politique
et build diffèrent. Ce qui est établi : **même en achetant tout le catalogue, il
reste près de 6 000 pièces**. Débouchés comparés dans `decisions/D4-money-sinks.md`.


### 3.3 Impasse à budget nul

Scénario rapporté :
- 6 farms, 6 wells, 6 workshops, 4 parks
- budget : 0/tick
- trésorerie : 11 coins
- simulation poursuivie 800 ticks
- aucune action achetable, aucune alerte explicite

Les alertes `Budget` (budget négatif) et `Treasury frozen` (budget nul) ne couvrent pas clairement cette situation de blocage économique.

### 3.4 Progression sans destination

- Âge 2 atteint à `t=153` (environ 77 s).
- Âge 3 atteint à `t=229` (environ 115 s).
- L'âge 2 ne dure que 76 ticks dans la stratégie observée.
- Une avancée après l'âge 3 produit un âge 4 inexistant.
- `applyAdvanceAge` n'est pas bornée ; `AGE_NAMES[4]` devient undefined.
- Aucun endgame, score, victoire ou défaite n'est défini.
**Vérifié le 18 novembre 2026 (code).** `applyAdvanceAge` fait `state.age += 1`
sans borne : depuis l'âge 3, un clic produit un âge 4 qui n'a **ni nom ni jalons**
(`AGE_NAMES` ne définit que 1 à 3), et `canAdvanceAge` devient ensuite faux (jeu
de jalons vide). Aucun score, aucune victoire, aucune défaite n'existent dans
`src/`. Destination comparée dans `decisions/D5-endgame.md`.

- Deux technologies (800 et 1200) restent disponibles après l'âge 3 et sont financées sans contrainte par l'excédent monétaire.
- Aucun bâtiment du catalogue ne déclare `requiredAge`, alors que l'interface et la validation semblent dépendre de cette propriété.

## 4. Diagnostic synthétique

| Domaine | Diagnostic | Gravité |
|---|---|---|
| Workforce | Les besoins essentiels absorbent tous les travailleurs | Bloquant |
| Industrie | Les chaînes de transformation ne sont pas atteignables | Bloquant |
| Monnaie | Workshop connecté rentable sans travail ni production | Élevée |
| Dépenses | Pas de débouché durable à l'excédent | Élevée |
| Progression | Âges sans contenu déverrouillé effectif | Élevée |
| Fin de partie | Aucun état terminal ou objectif final | Élevée |
| UX | Les causes de blocage ne sont pas explicites | Moyenne |
| Accessibilité | Carte rapportée comme essentiellement pilotable à la souris | À auditer |

## 5. Ce qui fonctionne et doit être préservé

Selon l'audit :
- Domaine de simulation pur, séparé du rendu.
- Tick déterministe.
- Une source de vérité par loi.
- Prévisions utilisant les mêmes fonctions que le tick.
- Alertes représentant des états.
- Palette et ligne de statut qui indiquent les bâtiments à placer et leur emplacement.
- Jalons lisibles.
- 188 tests rapportés, sans TODO ni `@ts-ignore`.

Les lois de crise hydrique déjà verrouillées restent une contrainte de conception : seuil sévère à 75 %, conséquences graduelles et récupération graduelle. Ne pas les modifier pour compenser les problèmes de workforce ou de monnaie.

## 6. Limites de la mesure

- Un seul seed.
- Une seule politique scriptée.
- Pas de test humain formel.
- Pas de revue visuelle complète incluse.
- Les résultats décrivent un build précis, pas nécessairement l'état actuel si le code a changé depuis `94cbff2`.
- Les mesures du §8 ont été exécutées le 18/11 sur le build `88900bc`, sur cette machine ; elles portent sur un tick réel et une politique de référence scriptée, pas sur un joueur humain.

## 7. Mesures à reprendre après chaque phase

Au minimum :
- Population, postes nécessaires, postes disponibles, postes staffés et travailleurs libres.
- Production réelle par ressource et par tick.
- Besoins, consommation, pertes et variation nette des stocks.
- Revenus et dépenses ventilés par source.
- Temps d'accès au premier bâtiment industriel, à la première transformation et au premier stockage étendu.
- Trésorerie, budget net et nombre d'actions encore achetables.
- Temps d'accès aux âges et technologies.
- Temps avant saturation, stagnation ou état terminal.
- Nombre d'alertes pertinentes et compréhension de la cause par le joueur.

Ne pas fixer de cibles numériques définitives avant d'avoir établi plusieurs scénarios de référence.

## 8. Mesures du 18 novembre 2026 — correctif D et ligne industrielle

**Statut : mesuré sur cette machine**, contrairement aux mesures rapportées du §1.
Build `88900bc` (correctif) et `f654b25` (documentation). Même ouverture par
défaut que le §1 : 10 colons, 10 résidences, 5 fermes, 5 puits, 2 ateliers, 1 parc,
1 centre, 100 pièces.

### 8.1 Ce que le correctif D a corrigé

La surface d'affichage du staffing reclassait les postes **par cellule** et
ignorait la **réserve hydrique** : en crise d'eau, elle annonçait les fermes
staffées et les puits inactifs, c'est-à-dire l'inverse de ce que le tick écrivait.
Interface et simulation lisent désormais la même fonction (`staffingOrder` /
`staffingAssignment`). Aucune valeur de balance n'a bougé : 190 tests unitaires,
205 déclarations sans constat de vacuité, 6/6 scénarios. Détail mesuré :
`../PHASE0-VERIFICATION-2026-11-18.md` §8 ; décision : `../../adr/ADR-016-staffing-priority-order.md`.

### 8.2 Ligne de croissance mesurée

Ouverture par défaut, camp en (5,4) adjacent au gisement (4,4), trois résidences
ajoutées, un tick par échantillon :

| Population | Fermes | Puits | Camp | Ateliers | Planches/tick | Nourriture nette |
|---:|---|---|---|---|---|---:|
| 10 | 5/5 | 5/5 | **0/1** | **0/2** | 0 | +1 |
| 11 | 5/5 | 5/5 | 0/1 | 1/2 | 0 | 0 |
| 12 | 5/5 | 5/5 | 0/1 | 2/2 | 0 | −2 |
| **13** | 5/5 | 5/5 | **1/1** | 2/2 | **+1** | **−3** |

Ce que la ligne établit, sans extrapolation :

- **Première planche sans famine mesurée à 13 colons** (aucun colon perdu ; le
  stock couvre un déficit de −3/tick). Avant ce correctif, le projet n'avait mesuré
  des planches qu'à 10 colons, avec −1/tick.
- **12 des 13 postes éligibles sont des postes de survie** (5 fermes, 5 puits,
  2 ateliers) ; le camp est le 13e.
- **Un seul travailleur est disponible pour l'industrie** à ce point de la partie.
- **Nourriture à −3/tick à 13 colons** : 15 produites, 13 mangées, 3 % de 15
  perdues. La ligne ne peut donc pas stationner à 13 sans `cropRotation`.
- **Chaîne fonctionnelle mais très contrainte** : 1 planche/tick, et un seul camp
  (2 bois/tick) ne peut alimenter qu'un atelier sur deux (2 bois chacun) ; le bois
  reste à 0 tant que deux ateliers tournent.

### 8.3 Comparaison à 1 500 ticks

Ligne gouvernée de référence (`playGame`, 1 500 ticks, plafond de logement 86 à
partir de l'âge 2) :

| Mesure (t=1 500) | Ordre de base | Extraction prioritaire |
|---|---:|---:|
| Planches en stock — mesure d'origine | 1 | 27 |
| Planches en stock — reconstruction du 18/11 | 1 | 36 |
| Population | 86 | 60 |
| Âge 2 prêt | t=321 | t=321 |
| Âge 3 (jalons satisfaits) | non à t≤1 500 | non à t≤1 500 |

Jalons d'accès à l'âge 3 (`AGE_MILESTONES[2]`, lus dans l'âge 2) : pop 15,
14 bâtiments, 60 nourriture, 5 technologies. Les deux lignes ci-dessus les ratent sur
la nourriture et les technologies. Le prototype de l'option C les satisfait
(`GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8.3), sans qu'aucune décision soit prise.

Les deux colonnes mesurent un **stock de planches**, pas une production cumulée.
La reconstruction (camp et carrière en classe 2, atelier en classe 3, dans un
worktree jetable supprimé ensuite) donne 36 au lieu de 27 : même direction, valeurs
différentes — le diff d'origine n'est plus dans Git, la reconstruction n'en est donc
pas une copie exacte.

### 8.4 Ce que cette comparaison ne prouve pas — corrections

Deux affirmations de la note du 18/11 ne tiennent pas à la mesure et sont retirées
ici :

1. **« Âge 3 atteint à t=321 en base »** : faux. t=321 est le tick où l'**âge 2**
   devient disponible dans les deux ordres (`ready@321`, `age2@321`, `pop12@328`),
   et aucun des deux ne satisfait les jalons de l'âge 3 avant t=1 500 (la base
   finit à 32 nourriture et 4 technologies pour les jalons d'accès à l'âge 3, qui
   demandent 60 nourriture et 5 technologies — `AGE_MILESTONES[2]`). Le chiffre
   confondait le marqueur d'âge 2 avec l'âge 3, et l'ancien « jalon à 75 » était le
   jeu de prospérité de l'âge 3, qui ne garde aucune transition.
2. **« Le camp garde le dernier ouvrier, donc la colonie n'a plus personne »** :
   non vérifié. Au plateau, la variante a **13 ouvriers libres**, aucun camp actif,
   aucun atelier staffé, 121 nourriture et une qualité d'air de 55. La population
   s'arrête à sa **capacité de logement** (60/60), et la trésorerie oscille entre
   35 et 59, sous le seuil de construction de la politique de référence (dont
   l'ordre d'options place fermes, puits, entrepôts et parcs **avant** la
   résidence). Les deux variantes conditionnelles testées retombant sur 60
   s'expliquent par ce chemin de financement, pas par une loi de simulation.

Conséquence : la décision de conserver l'ordre actuel reste justifiée par la
mesure (l'alternative achète des planches en sacrifiant la croissance), mais la
**cause** documentée doit être celle du financement du logement, et non
l'épuisement de la main-d'œuvre. Diagnostic complet :
`DIAGNOSIS-POPULATION-PLATEAU.md`.

### 8.5 Diagnostic à remplacer dans le §3.1

Le §3.1 ne doit plus être lu comme « la chaîne industrielle est totalement
inaccessible ». Elle est inaccessible à 10 colons et **s'ouvre à 13**. Ce qui reste
ouvert est autre chose : une marge industrielle d'un seul travailleur, le rapport
2 bois/tick du camp contre 4 pour deux ateliers, et l'absence de consommateur pour
la pierre. Voir `GAME-DESIGN-ECONOMY-RESOURCES.md` §9 et
`GAME-DESIGN-INDUSTRY-BEFORE-13.md`.
