# NOVA — Game design : économie et ressources

Version : 0.1  
Statut : cadrage de conception, valeurs existantes à confirmer dans le code avant implémentation

## 1. Objectif

Rendre les chaînes économiques accessibles, cohérentes et utiles sur la durée. La monnaie doit permettre des choix réels ; les ressources doivent avoir des flux identifiables ; la production industrielle doit dépendre de conditions opérationnelles réelles.

## 2. Boucles de ressources

Chaîne industrielle observée ou décrite dans le build de référence :

`wood → planks → stone → warehouse`

Production rapportée :
- Lumber camp : 2 wood/tick.
- Workshop : 1 plank/tick, consommation de 2 wood.
- Quarry : 2 stone/tick.
- Warehouse : capacité supplémentaire de stockage.

Le coût de la quarry est de 5 planches (confirmé dans le catalogue). Le coût du warehouse est de **25 pièces + 2 planches** (confirmé : `plankCost: 2`, `moneyCost: 25`), et non « 2 » sans unité — voir `../PHASE0-VERIFICATION-2026-11-18.md` §1.

### Défaut constaté

La chaîne n'est pas réellement accessible lorsque tous les travailleurs sont affectés aux fermes et aux puits. Le centre éloigné des dépôts ne compense pas ce défaut par son flux passif de bois dans le scénario observé.

### Critères de conception

- Chaque ressource doit avoir une source et des usages identifiables.
- Une chaîne ne doit pas dépendre d'une ressource qui ne peut être produite dans les conditions normales de partie.
- Le joueur doit pouvoir comprendre pourquoi un maillon ne fonctionne pas.
- Les capacités de stockage doivent devenir utiles au moment où le débit et les variations de stock le justifient.
- Les ressources ne doivent pas être générées artificiellement pour masquer une chaîne inaccessible.

## 3. Emplacement du centre et accès aux dépôts

L'emplacement initial du centre (23,23) est rapporté comme étant à environ 20 tiles de chaque dépôt, ce qui éloigne la première exploitation.

Décision à prendre :
- rapprocher le centre d'au moins un dépôt pertinent ;
- ou garantir un accès initial équivalent par une autre règle explicite.

Le choix doit être testé sur plusieurs seeds. Ne pas placer le centre près d'un dépôt uniquement pour le seed de référence si cela rend les autres générations injustes ou triviales.

Critères :
- accès à une première ressource industrielle dans un délai raisonnable ;
- absence de placement initial qui invalide une partie ;
- distances et coûts de routes lisibles ;
- cohérence entre génération de carte et difficulté.

## 4. Monnaie : distinguer revenus et activité réelle

Règles rapportées dans le build :
- +1 coin par colonist et par tick ;
- +2 coins par workshop connecté et par tick ;
- -1 coin d'entretien par bâtiment, résidence exemptée ;
- coût de congestion `floor((population - 10) / 5)`.

Le workshop connecté rapporte actuellement du commerce indépendamment de son staffing et de sa production. Il peut donc devenir un moteur financier même sans produire de plank.

### Décision de conception à tester

Le commerce doit refléter une activité économique réelle. Le staffing du workshop est une piste directe, mais son effet doit être mesuré : l'audit estime que l'ouverture pourrait passer à -2 coins/tick si le revenu commercial actuel disparaît sans remplacement.

Ne pas appliquer un simple interrupteur `staffed ? revenue : 0` sans simuler son effet sur la trésorerie d'ouverture et les premières minutes.

À spécifier :
- conditions exactes du revenu commercial ;
- distinction entre commerce, production et entretien ;
- revenus fixes éventuels et revenus liés à l'activité ;
- plafonds ou demande si nécessaire ;
- comportement d'un workshop connecté mais non staffé ;
- feedback lorsque le commerce ne fonctionne pas.

## 5. Budget et impasses

Le jeu doit distinguer :
- budget net positif ;
- budget net nul ;
- budget net négatif ;
- trésorerie trop faible pour construire ;
- blocage sans action économique accessible ;
- reprise possible via une action existante.

Le scénario à 0 coin/tick et 11 coins de trésorerie montre qu'un budget nul peut être une impasse sans alerte.

### Critères d'acceptation

- Une impasse économique prévisible est signalée avant qu'elle ne soit irréversible.
- L'alerte indique une cause et, si possible, une action réellement possible.
- Une alerte ne recommande pas une action impossible ou non déverrouillée.
- La simulation ne crée pas de dette ou de revenu implicite non documenté.

## 6. Dépenses et débouchés

L'excédent de 33 893 coins à 3 000 ticks, sans achats utiles restants, montre que la monnaie perd sa fonction de décision.

Pistes à évaluer après stabilisation de la workforce :
- coûts de développement industriel ;
- coûts d'accès et d'entretien des infrastructures ;
- technologies ayant un effet mesurable ;
- stockage et logistique ;
- services ou objectifs de fin de partie.

Ne pas ajouter des sinks artificiels uniquement pour vider la trésorerie. Chaque dépense doit acheter une capacité, un choix, une réduction de risque ou une progression compréhensible.
**Mesuré le 18 novembre 2026.** Sur la ligne d'âge 3, l'achat des neuf
technologies laisse **5 968 pièces** ; sur la ligne de croissance (qui reste en
âge 2) il en reste 7 968, l'écart de 2 000 étant exactement les deux technologies
d'âge 3 non achetées. Le chiffre rapporté de 33 893 pièces à 3 000 ticks n'a pas
été reproduit (durée, politique et build différents). Comparaison des familles de
dépense : `decisions/D4-money-sinks.md`.


## 7. Stocks, conservation et eau

Les valeurs rapportées incluent une dégradation de 3 %/tick, un granary de 180 food (+60 par warehouse), et une capacité d'eau de 80 (+40 par warehouse).

Les règles déjà verrouillées pour la crise hydrique restent invariantes :
- seuil sévère : 75 % ;
- conséquences graduelles ;
- récupération graduelle.

La présente roadmap ne réouvre pas ces décisions. Toute modification des capacités, rendements ou coûts doit être évaluée sans altérer indirectement le comportement validé de la crise hydrique.

Pour chaque ressource, suivre :
- stock initial et capacité ;
- production brute ;
- consommation ;
- pertes / dégradation ;
- overflow ;
- stock final ;
- durée de réserve exprimée en ticks.

## 8. Ordre de conception recommandé

1. Rendre la workforce suffisante et explicite.
2. Vérifier que wood et planks sont réellement accessibles.
3. Revoir le commerce à partir de l'activité réelle.
4. Mesurer les budgets d'ouverture et de croissance.
5. Définir des dépenses utiles liées à la progression et à la fin de partie.
6. Ajuster les rendements et coûts seulement après les étapes précédentes.

Ne pas équilibrer la monnaie sur un modèle de production industrielle qui ne fonctionne pas encore.

## 9. Industrie mesurée — ce que la chaîne produit vraiment (18 novembre 2026)

> **Note du 20/11/2026.** Les coûts cités dans cette section sont ceux du 18/11
> (résidence en monnaie, carrière 5 planches). Depuis D3, le barème est :
> résidence 1 planche, ferme 1, camp 1, atelier 2 + 1 eau, carrière 4, entrepôt
> 2 + 8 pierres, puits 25 $. Les débits (1 planche/tick, 2 bois/tick, 2 pierre/tick)
> restent exacts. Voir `decisions/D3-stone.md` §7.2 et §7.8 pour les mesures à jour.

Build `88900bc`. Les valeurs du §2 sont confirmées dans le catalogue
(`src/content/buildings.ts`, `src/domain/production/`), et cette section ajoute ce
que le tick produit réellement.

### 9.1 Règles exactes en vigueur

| Élément | Valeur | Source |
|---|---|---|
| Camp de bûcherons | 2 bois/tick, draine un gisement adjacent, 1 poste | `extraction.ts` |
| Collecte du centre | 1 bois/tick, non staffée, si un gisement est adjacent | `extraction.ts` |
| Atelier | 1 planche/tick contre **2 bois**, 1 poste, lot entier (pas de planche partielle) | `transformation.ts` |
| Carrière | 2 pierre/tick (+1 par `masonry`, `deepMining`), 1 poste | `extraction.ts` |
| Ferme | 2 nourriture/tick (+1 par `cropRotation`, `irrigation`, `winterWheat`) | `production.ts` |
| Puits | 2 eau/tick, sans technologie | `production.ts` |
| Centre | +1 nourriture/tick, non staffé | `production.ts` |
| Commerce | 2/atelier connecté (à partir de 8 colons) + 1 par planche réellement produite | `economy.ts` |
| Entretien | 1/bâtiment opérationnel, résidence et centre exemptés | `economy.ts` |

L'atelier est exempté d'efficacité logistique ; les fermes aussi.

### 9.2 Une planche par tick, à partir de 13 colons

Ligne mesurée (camp en (5,4) près du gisement (4,4), ouverture par défaut) : le camp
n'est staffé qu'à **13 colons**, et la production démarre alors à **1 planche/tick**
(stock 1 → 4 en quatre ticks), avec une nourriture à −3/tick.

- Ce n'est pas un débit industriel, c'est un débit de démonstration : une planche
  par tick paie une carrière en 5 ticks, un entrepôt en 2, une résidence en 0
  (les résidences coûtent de la monnaie, pas des planches).
- Le bois reste à **0** tant que deux ateliers tournent : le camp produit 2, deux
  ateliers absorbent 4.

### 9.3 Le rapport camp / ateliers est le vrai plafond de la chaîne

`2 bois produits` contre `2 bois par atelier et par tick` : **un camp alimente un
atelier**, jamais deux. Avec un seul camp, la deuxième moitié de la capacité
industrielle est morte par construction, quel que soit le nombre d'ateliers bâtis.

Mesuré sur la ligne gouvernée, ordre de base, à t=600 : 1 camp staffé, 74 bois en
stock, **1 planche** en stock, **0 atelier staffé**. Le bois s'accumule sans être
transformé parce que la politique de référence a mis les ateliers en veille ; la
ressource n'est donc pas le seul verrou, l'affectation en est un autre.

### 9.4 La pierre n'a aucun consommateur

Recherche dans `src/` : la pierre est produite (`produceStone`), stockée et
plafonnée, jamais dépensée. Aucun coût de construction, aucune technologie, aucun
jalon d'âge ne l'exige.

Conséquences mesurables :

- Une **carrière coûte 5 planches** (≈ 5 ticks de la chaîne à 1 planche/tick) et
  1 travailleur, pour une ressource sans usage : la dépense est nulle en retour.
- Les technologies `masonry` et `deepMining` (50 et 150 pièces) n'augmentent que ce
  débit inutile.
- Le seul « usage » implicite est la capacité de stockage : la pierre remplit un
  entrepôt sans jamais le vider.

**Décision à prendre (propriétaire du design) :** donner à la pierre un
consommateur réel (coût de construction, palier d'entrepôt, jalon d'âge, unité
militaire ou de voirie), ou retirer la carrière et les deux technologies du
catalogue. Aucune des deux n'est tranchée par ce dossier, et aucune valeur ne doit
être fixée avant la mesure correspondante.

**Vérifié le 18 novembre 2026 (code).** Trois précisions que le dossier ne
portait pas, et qui changent la décision :

1. il n'existe **aucun champ `stoneCost`** dans le modèle de bâtiment : donner un
   coût en pierre est un ajout de schéma de contenu, pas une valeur à régler ;
2. la pierre **n'a pas de plafond de stock** (seuls la nourriture et l'eau en ont) :
   un « usage » qui serait la capacité de stockage n'existe pas ;
3. les deux technologies liées (`masonry` 50, `deepMining` 150) n'améliorent que
   le rendement de la carrière, et le jalon `tech5` de l'âge 2 en dépend : les
   retirer ramène le catalogue à 7 technologies (6 sans l'option C), dont 3
   d'âge 1, pour un seuil de 5 : le jalon deviendrait exactement le catalogue
   disponible à ce stade.

Comparaison des usages possibles (entrepôt, résidence, route pavée, palier d'âge 2,
projet de fin de partie) : `decisions/D3-stone.md`.

### 9.5 Ce que ce n'est pas

La chaîne industrielle n'est **pas** totalement inaccessible : elle s'ouvre à 13
colons, sans famine temporaire, et produit. Ce qui manque est une **marge** de
main-d'œuvre, un **débit** de bois suffisant pour la capacité bâtie, et un **débouché**
pour la pierre. Les pistes chiffrées sont dans `GAME-DESIGN-INDUSTRY-BEFORE-13.md`.
