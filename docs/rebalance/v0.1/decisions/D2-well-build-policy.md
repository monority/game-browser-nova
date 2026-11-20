# D2 — Politique de construction des puits : `ceil(N/3)` est-elle la bonne cible ?

Statut : **ouverte — mesurée le 19 novembre 2026**, arbitrage du propriétaire en attente (voir §5).
Date : 18 novembre 2026.
Voir : `D1-option-c.md` (la technologie qui change le rendement), `../GAME-DESIGN-WORKFORCE.md` §10.7 (réserve hydrique), `../GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8.6 (mesures à pop 12–13).
Objet : décider comment une colonie dimensionne ses puits, et si la cible
`ceil(population / rendement)` doit devenir une doctrine, une prévision ou une
règle.

## 1. Distinction préalable : trois choses différentes

1. **La loi du jeu** (vérifiée) : un puits staffé produit `waterPerWell` et un
   colon boit 1/tick servi. Il n'existe **aucune** règle qui dimensionne les
   puits — le jeu n'a pas de plan de construction automatique.
2. **La doctrine du harnais** (`tests/selfplay.governor.ts`) : le joueur scripté
   bâtit un puits tant que `count(well) < ceil(pop/2) + 1` et que la trésorerie
   dépasse 60 pièces. C'est **la** politique qui produit les chiffres de tout le
   dossier — y compris ceux de l'option C.
3. **La surface joueur** : le panneau expose la capacité (`min(plafond
   alimentaire, eau, logement)`) et les prévisions production/consommation, mais
   **aucune** lecture « puits nécessaires ». Un joueur humain doit faire
   l'arithmétique lui-même, et l'option C déplace justement cette arithmétique.

Les trois ne se décident pas ensemble : changer la doctrine du harnais est de la
mesure, changer la surface est de l'ergonomie, changer la loi serait une règle
automatique (aucune option ci-dessous ne la propose).

## 2. Lois vérifiées (18 novembre 2026)

| Loi | Valeur | Source |
|---|---|---|
| Rendement d'un puits staffé | 2/tick, `+1` par niveau `wellWater`, `−1` **plat** sous sécheresse | `production.ts` |
| Sécheresse | événement, `−1` par puits, appliqué **un tick sur deux** (`isEventEffectTick`) | `events.ts` |
| Besoin en eau | 1/colon **servi** par tick ; non servi = colon non buvant, pas de perte directe | `water.ts`, `production.ts` |
| Admission | exige eau **servie** ≥ population (et nourriture > 0, air ≥ 25, logement libre) | `population.ts` |
| Plafond d'eau | 80 de base (+40 par entrepôt opérationnel) ; **aucune perte** de stock d'eau | `storage.ts` |
| Plafond alimentaire | 180 de base (+60 par entrepôt) ; perte de **3 %/tick** | `storage.ts`, `conservation.ts` |
| Ordre de staffing | ferme 0 → puits 1 → camp/ateliers 2, puis ordre canonique des cases | `jobs.ts`, ADR-016 |
| Réserve hydrique | à partir de la bande grave (pression 75) : `ceil(pop / 2)` puits servis en premier | `jobs.ts` |
| Pression hydrique | +4 au blackout, +1 ailleurs, −1/tick de récupération ; grave ≥ 75 ; un départ tous les 10 ticks à 100, plancher de population 2 | `water.ts` |
| Hiver | **n'existe pas** : aucun cycle saisonnier, aucun effet de saison. `winterWheat` est un nom de technologie, pas une loi | `events.ts` |

Deux asymétries portent toute la décision :

- **l'eau ne se perd pas, la nourriture si** : un puits en trop produit pour un
  plafond, donc un stock définitif — jamais un gaspillage continu, mais jamais
  récupéré non plus ;
- **la réserve grave et le rendement partagent désormais la même hypothèse** :
  `waterWorkerReserve` dérive de `waterPerWell` depuis le 18/11 (voir D1 §2), donc
  une politique de construction peut s'appuyer dessus sans se contredire.

## 3. Politique actuelle, mesurée

À pop 12 (seed `selfplay`, ligne de croissance, option C active) : 7 puits
construits, 6 staffés, **4 nécessaires** ; eau produite 18/tick pour 12 bues ;
0 travailleur libre ; 1 atelier staffé sur 4. À pop 13 : 7 staffés pour **5
nécessaires**. En fin de ligne : 33 staffés pour **29 nécessaires** à pop 86,
4 postes payés en eau que personne ne boit, dans une colonie qui a par ailleurs
24 colons inoccupés — donc le coût du surdimensionnement est **invisible** à
cette échelle et **maximal** entre 10 et 13 colons, c'est-à-dire exactement là où
la question se pose.

## 4. Options

### A — Statu quo : `ceil(N/2) + 1` (doctrine actuelle)

- Avantage : marge d'un puits entier, qui absorbe la sécheresse sans réserve et
  laisse la bande grave inutilisée ; aucune famine mesurée à ce jour.
- Inconvénient : suppose un rendement de 2. Dès que le rendement vaut 3, la marge
  implicite passe de +1 à +3 postes ; l'eau excédentaire ne devient jamais du
  travail.
- Coût : nul. Risque : le plafond de population reste fixé par la planche, pas
  par l'eau — ce qui est précisément le blocage étudié.

### B — `ceil(N / rendement) + 1` (le `ceil(N/3)` proposé, généralisé)

- Effet attendu (dérivé des mesures du §3) : à pop 12, 4 puits staffés au lieu de
  6 → **2 postes rendus** ; à pop 13, 5 au lieu de 7 → 2 postes rendus.
- Avantage : la cible suit la loi (`waterPerWell`), donc reste vraie sous
  sécheresse (3 → 2 ⇒ `ceil(N/2)`), avec l'option C, et après tout changement de
  rendement futur. Une seule formule, une seule source.
- Risque : `+1` puits de marge vaut 1 poste de travail au moment le plus tendu ;
  sous sécheresse, la marge disparaît et la pression hydrique monte. Il faut la
  mesure, pas l'arithmétique.
- Complexité : triviale dans le harnais (une expression), **nulle** dans le jeu
  (aucune règle ajoutée) — mais alors elle ne sert qu'à mesurer, pas à jouer.

### C — Dimensionner sur une réserve en ticks plutôt qu'en puits

« Tenir N ticks sans production » : la cible devient `ceil(pop/rendement)` plus
une réserve de stock, et le plafond de citerne (80, +40 par entrepôt) devient la
variable de conception. Cohérent avec la doctrine alimentaire (`FOOD_RESERVE_TICKS
= 5`), donc lisible pour un joueur.
- Avantage : parle la même langue que la nourriture ; rend l'entrepôt utile pour
  l'eau (aujourd'hui l'eau ne fuit pas, donc l'entrepôt ne sert qu'au plafond).
- Risque : déplace le problème vers un stock qui ne se dégrade pas ; peut
  récompenser l'accumulation au lieu de la production.
- Donnée manquante : aucune mesure de la valeur réelle d'un tick de réserve d'eau
  (le seul scénario qui la teste est la sécheresse, désactivée par défaut).

### D — Rendre le besoin visible au joueur (sans changer la doctrine)

Exposer « puits nécessaires : 4 (staffing : 6) » dans le panneau de prévision,
à côté de la capacité. La politique reste une décision du joueur, mais devient
calculable sans ardoise.
- Avantage : aucun changement de loi, aucun risque d'équilibrage, bénéfice immédiat
  pour l'accessibilité (P4 de la roadmap).
- Inconvénient : ne corrige pas le surdimensionnement du harnais ; un joueur qui
  suit la recommandation peut se retrouver à court sous sécheresse.
- Complexité : une requête dérivée qui lit `waterPerWell` — cohérente par
  construction, mais c'est du code d'interface.

## 5. Mesure exécutée — 19 novembre 2026

Le protocole prévu (une seule ligne du harnais changée) a été exécuté sur la
**loi livrée**, c'est-à-dire depuis D1 : un puits vaut 2, et **1 pendant une
sécheresse**. Conséquence immédiate, et c'est le résultat principal :
`ceil(N / rendement)` ne diffère de `ceil(N / 2)` **que pendant les fenêtres de
sécheresse**. Hors événement, les deux doctrines sont la même ligne de code.

Dispositif : `playGame(-1, false, 240, cap, fréquence)`, seed `selfplay`, 1 500
ticks, instrumentation par le hook `onTick` existant du harnais (aucun fichier
ajouté au dépôt). La variante ne diffère que par l'expression de construction :
`Math.ceil(pop / 2) + 1` → `Math.ceil(pop / waterPerWell(state)) + 1`, restaurée
ensuite (`git diff` vide, vérifié). Sonde jetable supprimée.

### 5.1 Ouverture pop 12, événements `frequent` — le seul scénario qui diffère

| Mesure à t = 1 500 | Témoin `ceil(N/2)+1` | Variante `ceil(N/rendement)+1` |
|---|---:|---:|
| Puits construits | **7** | **13** |
| Eau en stock | 22 | 48 |
| Planches | 443 | 317 |
| Trésorerie | **3 715** | **1 798** |
| Pénuries (ticks / colons) | 0 / 0 | 0 / 0 |
| Ticks en bande grave | 0 | 0 |
| Arrivée à pop 12 | t = 368, 7 puits, 0 libre | **t = 368, 7 puits, 0 libre** |

La variante double le parc de puits (13 pour 12 habitants) et coûte
**1 917 pièces et 126 planches**, pour **zéro colon de plus servi** et aucun
tick de crise évité. Sur cette ligne, la doctrine actuelle ne produit aucune
pénurie : la survie n'est pas menacée, donc la marge supplémentaire n'achète
rien de mesurable.

### 5.2 Lignes de croissance (cap 86), sans événement puis `frequent`

**Aucun champ ne diffère** entre les deux doctrines : 43 puits (pop 86) sans
événement, 40 puits (pop 81) avec `frequent`, mêmes trésoreries (57 et 45),
mêmes planches (1), mêmes pénuries (0), même `canAdvanceAge` (false).

- sans événement, l'égalité est **structurelle** : pas de sécheresse, donc pas
  de rendement à 1, donc deux expressions identiques ;
- avec `frequent`, des sécheresses ont bien eu lieu mais la règle n'a produit
  **aucune** construction supplémentaire. Hypothèse non instrumentée : la
  trésorerie de cette ligne vit sous le seuil de construction du harnais
  (60 pièces, lignes finales à 57 et 45), donc la demande accrue ne se
  convertit jamais en puits. À vérifier avant d'en faire une conclusion.

### 5.3 Ce que la mesure ne couvre pas

- **la variante avec l'option C** : rendement 3, cible `ceil(N/3)+1`. Elle est
  hors d'atteinte tant que D1 maintient la techno hors catalogue ; la mesurer
  exigerait de la réactiver, ce qui est une autre décision ;
- **la bande grave n'a jamais été armée** (0 tick sur les trois scénarios), y
  compris sous sécheresses fréquentes : la réserve hydrique n'est pas exercée
  par ces lignes, ce qui est un fait à retenir pour D1 comme pour D2 ;
- **la politique n'a pas été jugée sur une pénurie réelle** : aucune des deux
  doctrines n'en a produit, donc le critère de rejet du protocole (§5 d'origine)
  n'a jamais eu l'occasion de trancher sur ce point.
## 6. Recommandation argumentée

**Dimensionner sur le rendement NOMINAL lu dans la loi (`ceil(N / x) + 1`), ne
pas dimensionner sur le rendement du jour, et garder D (exposer le besoin au
joueur).**

Raisons mesurées (§5) :

- hors sécheresse, A et B sont **la même règle** — il n'y a rien à gagner ;
- sous sécheresse, B **coûte sans rendre** : 13 puits au lieu de 7, 1 917
  pièces et 126 planches, pour zéro colon supplémentaire servi et zéro tick de
  crise évité ;
- sur la ligne de croissance, B ne change rien du tout, et la raison probable
  (trésorerie sous le seuil de construction) dit quelque chose d'utile : **la
  contrainte réelle n'est pas la doctrine de dimensionnement, c'est l'argent**.

B redevient la bonne formulation dans un seul cas : si D1 rouvre et que
l'option C entre dans le jeu (rendement 3). Là, `ceil(N/3) + 1` et
`ceil(N/2) + 1` ne coïncident plus et la question « combien de puits pour la
marge » se repose pour de vrai. Ce n'est pas le cas aujourd'hui.

D (surface joueur) reste indépendant : afficher « puits nécessaires : n » au
joueur ne décide aucune valeur et ne dépend d'aucune des deux doctrines. C'est
la partie de la recommandation qui survit sans arbitrage de balance — et c'est
un changement d'interface, donc une décision séparée.

### 6.1 Appliqué le 19 novembre 2026 — la doctrine lit le x nominal

`production.ts` expose désormais deux lectures distinctes :

| Fonction | Sens | Qui la lit |
|---|---|---|
| `nominalWaterPerWell(state)` | ce qu'un puits sert quand rien ne va mal (2 + technologies) | le **plan de construction** |
| `waterPerWell(state)` | ce qu'il sert **ce tick** (nominal − sécheresse) | le tick, la capacité, la **réserve hydrique** |

Le harnais dimensionne sur le nominal : `ceil(pop / nominalWaterPerWell(state)) + 1`.
Le `2` n'est plus écrit dans la doctrine — c'était la même faute que la réserve
du §2 de D1, une seconde copie de la loi.

**Aucun résultat ne bouge aujourd'hui**, puisque le nominal vaut 2 : les gardes
self-play sont identiques au tick près (bandes 347 / 1 / 323, trésorerie < 100,
193 tests verts). Le jour où l'option C revient (nominal 3), la doctrine suit
sans être retouchée.

Ce qui reste ouvert dans D2 :

1. **le `+1` de marge** — sa nécessité n'a jamais été mesurée : aucune ligne ne
   produit de pénurie avec ou sans lui, puisque la bande grave ne s'arme pas ;
2. **la surface joueur (D)** — afficher « puits nécessaires : n » est un
   changement d'interface, pas une valeur de balance ; il attend sa propre
   décision.
## 7. Données manquantes

1. ~~La mesure de B, sous sécheresse et sans sécheresse.~~ **Fait le 19/11** : à
   refaire seulement si D1 rouvre (rendement 3).
2. Le comportement d'un joueur humain devant l'arithmétique du puits : personne
   n'a observé si un joueur sur-construit, sous-construit ou utilise la
   prévision.
3. La valeur d'un tick de réserve d'eau : aucun scénario ne la teste, la
   sécheresse étant désactivée par défaut.
4. Les seeds hors D2 : la politique ne peut pas être jugée sur des cartes que le
   harnais refuse de démarrer.
