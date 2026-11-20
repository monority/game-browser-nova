# D3 — Destin de la pierre et de la carrière

Statut : **tranchée le 19 novembre 2026** — voir §7. Mise en œuvre à mesurer avant commit.
Date : 18 novembre 2026.
Voir : `../GAME-DESIGN-ECONOMY-RESOURCES.md` §9.4 (constat), `D5-endgame.md` (usage de fin de partie), `D4-money-sinks.md` (ce que la pierre ne peut pas remplacer).
Objet : décider si la pierre reçoit une fonction économique réelle, ou si la
carrière et les technologies qui en dépendent sont retirées.

## 1. Ce qui est vérifié dans le code

| Fait | Détail | Source |
|---|---|---|
| Production | `STONE_PER_QUARRY_PER_TICK = 2`, `+1` par niveau `quarryStone` | `extraction.ts` |
| Coût de la carrière | 25 pièces, **5 planches**, 0 eau, 2 ticks, 1 poste | `content/buildings.ts` |
| Consommation | **aucune** : aucun bâtiment, aucune technologie, aucun événement ne consomme de pierre | `content/buildings.ts`, `content/techs.ts` |
| Champ de coût | il n'existe **aucun** champ `stoneCost` dans le modèle de bâtiment | `content/buildings.ts` |
| Plafond | la pierre n'a **pas** de plafond de stock (seuls nourriture et eau en ont) | `storage.ts` |
| Usage réel | affichage dans le panneau de statistiques et la sauvegarde | `statsPanel.ts`, `save.ts` |
| Technologies liées | `masonry` (50, âge 1) et `deepMining` (150, âge 2) n'augmentent **que** le rendement de la carrière | `content/techs.ts` |
| Dépôts | finis, indexés par case, épuisés restent à 0 ; le rendement dépend de l'efficacité logistique (rayon, décroissance, plancher 60) | `extraction.ts`, `logistics` |

Conclusion factuelle : la pierre est une ressource **produite, stockée, affichée
et jamais dépensée**. La carrière coûte 5 planches — la ressource la plus rare du
jeu à 10–13 colons — et un poste de travail, pour un stock sans emploi. Deux
technologies (200 pièces au total) n'améliorent que ce stock.

## 2. Pourquoi c'est un problème de conception, pas d'équilibrage

Le jeu a une hiérarchie de rareté claire : planches ≪ pièces < bois < nourriture
< eau. Toute dépense en planches doit **soit** économiser des planches, **soit**
ouvrir quelque chose que les planches ne peuvent pas payer. La carrière ne fait
ni l'un ni l'autre : elle transforme 5 planches et 1 poste en un stock décoratif.
Ce n'est pas une valeur trop faible — c'est une boucle absente.

## 3. Options

### A — Donner un consommateur réel à la pierre

Cinq usages possibles, **tous des hypothèses**, aucun adopté :

| # | Usage | Intérêt stratégique | Coût en planches | Fréquence | Place dans la progression | Effet sur les choix | Risque d'artifice |
|---|---|---|---|---|---|---|---|
| A1 | **Entrepôt en pierre** : l'entrepôt coûte 2 pierres en plus des 2 planches | rend l'entrepôt payable en ressources déjà produites ; la pierre devient un prérequis de la logistique de stock | neutre (la carrière doit être construite d'abord) | élevée (chaque entrepôt) | âge 1–2 | crée un arbitrage « carrière ou atelier » | moyen : la carrière devient une taxe d'entrée |
| A2 | **Résidence en pierre** : la résidence coûte 1 pierre | attaque directement le plafond de logement (le seul plafond mesuré, à 60) | **élevé** (1 résidence par colon) | très élevée | âge 1 | la carrière devient obligatoire pour croître | **fort** : transforme une ressource morte en obligation |
| A3 | **Route pavée** : la route coûte 1 pierre | touche la logistique (rayon, décroissance) sans nouvelle loi | moyen (beaucoup de routes) | très élevée | âge 1–2 | concurrence la longueur de route (5 pièces) | moyen : la route doit rester bon marché |
| A4 | **Palier de construction** : un bâtiment d'âge 2 (atelier lourd, brasserie…) exige de la pierre | crée une vraie raison de produire de la pierre **au moment où les planches existent** | faible (un bâtiment rare) | faible | âge 2–3 | ouvre un choix de spécialisation | faible si le bâtiment a un usage propre |
| A5 | **Projet de fin de partie** : un monument payé en pierre (voir D5) | donne une destination à la ressource et à la partie | faible | une fois | âge 3 | ne pèse pas sur la boucle quotidienne | **élevé** : un monument est une accumulation déguisée |

Lecture : A4 est la seule option qui ne rend pas la carrière obligatoire et qui
donne à la pierre un usage au moment où elle devient abordable. A1 est la plus
simple à implémenter mais rend la carrière une taxe. A2 et A5 sont les deux
pièges : l'un rend la croissance payante en pierre, l'autre transforme la fin de
partie en stock.

### B — Retirer la carrière et les technologies associées

- Supprime : le bâtiment `quarry`, les technologies `masonry` et `deepMining`, les
  dépôts de pierre du monde, la lecture de pierre du panneau.
- Effet mesuré (dérivé de la ligne de croissance) : les 5 planches de la carrière
  reviennent à la chaîne industrielle ; le catalogue perd 2 technologies, donc
  l'âge 2 (5 technologies requises) devient plus difficile à ouvrir — il ne
  resterait que 3 technologies d'âge 1 et 2 d'âge 2, soit **exactement le seuil**.
  Vérifié : `tech5` resterait satisfaisable (3 + 2 = 5), sans aucune marge.
- Avantage : supprime un contenu mort, allège le catalogue, rend la planche
  entièrement disponible pour l'industrie.
- Coût : le monde perd une ressource et un type de dépôt ; la sauvegarde doit
  gérer la disparition du bâtiment (migration) ; le code de l'extraction ne sert
  plus qu'au bois.
- Risque : décider trop tôt ferme A4/A5, qui sont les seules pistes solides.

### C — Ne rien décider et assumer que la pierre est du décor

- Avantage : zéro travail.
- Inconvénient : le catalogue contient un piège (5 planches pour rien) et deux
  technologies qui n'améliorent qu'un stock mort. Un joueur qui les achète est
  pénalisé par le jeu lui-même, sans que rien ne le signale.
- C'est l'état actuel, et c'est celui que la roadmap qualifie de « décision du
  propriétaire ».

## 4. Ce que la décision doit vérifier avant d'être prise

1. **Le seuil de technologies de l'âge 2** (5) si l'on retire `masonry` et
   `deepMining` : il ne resterait que 7 technologies au total (6 si l'option C est
   elle aussi retirée), dont 3 d'âge 1 — le jalon deviendrait exactement le
   catalogue disponible à ce stade.
2. **Le coût en planches par tick** : la carrière en consomme 5 d'un coup, alors
   que la chaîne en produit 1/tick à partir de 13 colons. Toute option qui rend
   la carrière indispensable doit être mesurée sur l'ouverture pop 12.
3. **L'effet logistique** : les usages A1/A3 touchent le rayon et la décroissance
   (déjà mesurés), il ne faut pas rééquilibrer deux systèmes à la fois.
4. **La sauvegarde** : retirer un type de bâtiment est une migration ; ajouter un
   coût en pierre est une migration de schéma de contenu, pas de sauvegarde.

## 5. Recommandation argumentée

**Retenir A4 (un bâtiment d'âge 2 qui exige de la pierre) comme direction à
prototyper, et ne pas retirer la carrière avant cette mesure.**

Raisons :

- c'est le seul usage qui donne à la pierre un rôle **au moment où le joueur peut
  se la payer** (les planches n'existent qu'à partir de 13 colons) ;
- il ne rend pas la carrière obligatoire pour la croissance, donc il ne convertit
  pas un contenu mort en taxe — c'est le piège d'A2 ;
- il ne crée pas de nouvelle loi de simulation (pas de plafond, pas de
  consommation continue), donc pas de risque de dérive tick/prévision ;
- il est réversible : si la mesure déçoit, B reste disponible.

Si le propriétaire préfère une décision plus radicale : **B**, mais alors il faut
traiter ensemble le seuil `tech5` de l'âge 2, sinon l'âge 2 devient un mur sans
que personne ne l'ait voulu. Ne pas choisir C : l'état actuel est un piège pour
le joueur.

## 6. Données manquantes

1. Le nombre de carrières qu'un joueur construirait réellement (aucune mesure ;
   le gouverneur n'en construit jamais).
2. Le coût d'opportunité réel des 5 planches à pop 12 : mesuré en planches, pas
   en population.
3. La valeur d'un bâtiment d'âge 2 supplémentaire : le catalogue n'en a aucun à
   proposer aujourd'hui, donc A4 demande une décision de contenu en plus d'une
   décision de coût.

## 7. Décision du 19 novembre 2026 — les ressources construisent, l'argent arbitre

Décision du propriétaire : *« la pierre doit servir ; certains bâtiments coûtent
de la pierre ; l'argent sert comme dans The Crust — pour certains bâtiments —
mais en général on construit avec les ressources ; plus tard des matériaux
particuliers. »*

### 7.1 La règle

1. **Un bâtiment d'habitat ou de production se paie en planches.** Son coût en
   argent disparaît.
2. **Un bâtiment lourd ajoute de la pierre** : le stockage aujourd'hui, tout
   bâtiment d'âge 2 et suivants demain.
3. **La carrière ne demande jamais de pierre.** C'est le seul producteur : lui en
   demander serait une boucle impossible.
4. **L'argent paie l'infrastructure et le civique** : routes (5 pièces la
   cellule), parcs, services à venir (école, santé), entretien (1 pièce par
   bâtiment actif et par tick), recherche (50 pièces la techno).
5. **Les matériaux particuliers** (verre, métal, pierre taillée) arriveront avec
   les âges 2 et 3, sur le même mécanisme que la pierre.

C'est l'option **A1** (pierre dans le stockage) combinée à **A4** (bâtiments
lourds des âges suivants). Sont écartées : A2 (résidence en pierre — rend la
carrière obligatoire pour croître), A3 (route pavée — demandera deux types de
routes, à reprendre plus tard), A5 (monument — transforme la fin de partie en
accumulation).

### 7.2 Le tableau de coûts mesuré (provisoire)

Les nombres écrits le 20/11 avant mesure (2 planches partout) ne tenaient pas :
voir §7.8. Voici le barème réellement chargé dans le jeu.

| Bâtiment | Planches | Pierre | Eau | Argent | Pourquoi |
|---|---|---|---|---|---|
| Logement | 1 | – | – | – | habitat : matériau léger |
| Ferme | 1 | – | – | – | production |
| Puits | – | – | – | 25 | **infrastructure** : l'eau ne peut pas dépendre des planches |
| Bûcheron | 1 | – | – | – | production |
| Atelier | 2 | – | 1 | – | transformation, plus cher que l'extraction |
| Carrière | 4 | – | – | – | **jamais de pierre** (bootstrap) |
| Entrepôt | 2 | **8** | – | – | bâtiment lourd : la pierre entre ici |
| Parc | – | – | – | 25 | civique |
| Centre de colonie | – | – | – | – | offert au jour 0, jamais construit |
| Route | – | – | – | 5 / cellule | infrastructure |

Plus **12 planches de départ** au jour 0 (`D2_PLANKS`) : sans elles, la colonie
est fermée — 10 habitants pour 12 postes, aucun atelier staffé, aucune planche,
aucun logement.

### 7.3 Pourquoi ces nombres, avec les débits du jeu

- Un atelier produit **1 planche/tick** en consommant 2 bois ; un bûcheron produit
  2 bois/tick. Au jour 0, deux ateliers donnent au mieux 2 planches/tick : un
  logement à 1 planche, c'est **une résidence par tick au maximum**, et seulement
  si les deux ateliers sont staffés et nourris. La mesure (§7.8) montre que ce
  débit est en réalité le plafond de la croissance.
- Une carrière produit **2 pierres/tick** : un entrepôt à 8 pierres, c'est **4
  ticks de carrière**, donc un vrai investissement, pas une formalité.
- L'argent ne meurt pas : l'entretien prend 1 pièce par bâtiment actif et par
  tick, les routes 5 la cellule, un parc 25. Au jour 0, l'entretien des bâtiments
  offerts absorbe déjà une part notable des recettes (10 pièces de taxes + 6 de
  commerce).

### 7.4 Ce que la décision change dans la boucle

Le goulot d'étranglement de la construction passe de **l'argent** aux
**planches**, puis à la **pierre** pour les bâtiments lourds. C'est un vrai
déplacement de décision :

- avant : « ai-je 25 pièces ? » — une seule ressource, aucune allocation ;
- après : « je staffe un atelier de plus, ou une ferme ? » — parce que les
  planches viennent du travail, pas de la trésorerie.

### 7.5 Critères d'acceptation de la mise en œuvre

1. **La pierre est consommée** : sur une partie de 300 ticks, la pierre produite
   finit dépensée et le stock ne croît plus indéfiniment.
2. **Aucune boucle impossible** : la carrière reste constructible sans pierre.
3. **L'argent reste vivant** : à chaque tick, une dépense utile existe (routes,
   entretien, parc) ; l'argent ne s'accumule pas sans emploi.
4. **Les trois parties de référence restent franchissables.** Si un jalon casse,
   on ajuste les nombres du tableau — jamais la règle.
5. **La suite est verte** et le libellé de la palette affiche la pierre.

### 7.6 Risques nommés

| Risque | Signal | Réponse |
|---|---|---|
| Les planches deviennent le seul goulot | attente de planches permanente, population qui stagne | baisser le coût des logements en premier |
| La carrière devient une taxe d'entrée | aucune partie sans carrière avant l'âge 2 | garder les bâtiments de survie sans pierre |
| L'argent devient mort à son tour | trésorerie qui monte sans dépense possible | ouvrir un poste de dépense civique avant de retirer l'argent des coûts |
| Les tests de référence cassent | jalons non atteints | ajuster les nombres, mesurer, documenter |

### 7.7 Tension documentaire à résoudre

`product/02-mvp.md` §4 range « construction cost » dans la rubrique **Economy**
(argent). La décision ci-dessus déplace la construction vers les ressources.
Le document d'origine doit être mis à jour : c'est une correction de la décision
par le propriétaire, pas une dérive du build.

### 7.8 Ce que la mesure a donné (20/11)

Trois parties de référence rejouées avec le barème ci-dessus, plus un sondage
de 1 500 ticks sur la graine du gouverneur.

| Configuration | Population finale | Verdict |
|---|---|---|
| Barème écrit avant mesure (2 planches partout, 0 planche au départ) | 10 | boucle fermée : pas de planche, pas de logement, pas d'ouvrier |
| Planches de départ 12, 1 planche par bâtiment léger | 37 | l'eau tombe à 0 à t=450 : sans eau, les ateliers s'arrêtent, donc plus de planches, donc plus de puits |
| Puits payés en argent (barème actuel) | 28 | l'eau tient, mais tous les bras sont pris par l'eau et la nourriture |
| Barème actuel + atelier à 2 planches/tick | 78 | proche de la cible de 86 |

Deux causes sont mesurées, aucune n'est une opinion :

1. **Le débit de planches est le vrai plafond.** Un atelier produit 1
   planche/tick ; une planche achète un bâtiment ; or l'eau et la nourriture
   consomment à elles deux l'équivalent d'un ouvrier par habitant (puits à 2
   eau/ouvrier, ferme à 2 nourriture/ouvrier). Il ne reste alors aucun bras pour
   l'industrie qui fabrique les planches. Doubler le débit de l'atelier ramène la
   population de 28 à 78 : c'est le levier, et il touche une loi du jeu
   (Step006), donc il appartient au propriétaire.
2. **L'argent est mort**, exactement comme le risque §7.6 l'annonçait : la
   trésorerie finit entre 2 800 et 8 800 pièces sans emploi possible. Les seuls
   postes de dépense sont les puits, les parcs, les routes et les technos, et ils
   ne suffisent pas. Il faut un poste de dépense récurrent avant de retirer
   l'argent de la construction — c'est la fiche D4 (phase 7 du plan).

**Conséquence sur le critère d'acceptation §7.5.4** : il n'est pas satisfait.
Les trois parcours de référence ne sont plus franchissables tels quels (28
colons au lieu de 86, jalons d'âge atteints plus tard). La règle n'est pas en
cause, les deux leviers ci-dessus le sont.

**Suite, même journée (soir).** Le propriétaire a tranché le premier levier :
l'atelier produit désormais **2 planches pour 2 bois** (`D6-workshop-rate.md`).
La ligne de croissance passe de **28 à 78 colons** — le chiffre du tableau
ci-dessus est donc confirmé par la vraie ordonnance du tick, pas seulement par
un sondage. Le second levier (l'argent) reste ouvert : 3 301 pièces dormantes
sur 3 000 ticks (D6 §4). Les lignes ci-dessus restent les mesures du débit
1 planche/tick et ne sont pas réécrites.
