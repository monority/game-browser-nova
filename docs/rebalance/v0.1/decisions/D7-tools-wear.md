# D7 — Usure des bâtiments et outils

Statut : **ouverte.** Le propriétaire a retenu le principe le 2026-11-21
(« c'est bien l'idée de l'usure ») ; **aucune valeur de loi n'est tranchée** et
aucune ligne de code n'est écrite. Cette fiche chiffre la proposition et nomme
les deux murs mesurés qui la bloquent. Elle répond à la première moitié de
**O5** (une catégorie de biens) et laisse les services dehors.

Base : `HEAD = f0845d6`, arbre propre. Lignes re-jouées le 2026-11-21 avec
`tools/agent/run.mjs` (commandes réelles, tick réel) + une commande `report`
ajoutée en fin de script.

## 1. Le principe retenu

L'idée directrice n'est pas « un stock de plus » : c'est qu'un **bâtiment
s'use**. Ce qu'il faut éviter, c'est de doubler la monnaie d'entretien — le jeu
paie déjà 1 pièce par tick et par bâtiment (`MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK`).
Une usure payée en argent serait la même dépense sous un autre nom.

D'où la loi proposée, en quatre points :

1. **Un poste de travail s'use** : ferme, puits, atelier, camp de bûcherons,
   carrière. Une résidence, un parc et le Centre non (même doctrine que
   l'exonération d'entretien, Step021).
2. **Un outil par poste tous les `W` ticks.** L'atelier fabrique l'outil
   (`2 bois → 1 outil`), au prix d'un lot de planches non fait.
3. **Un poste qui ne paie pas son outil rate son tick.** C'est la seule forme
   d'usure exacte avec des productions entières, et elle est lisible : « ruche
   au repos — pas d'outils », un tick perdu, pas un pourcentage inventé.
4. **L'ordre de service est canonique** (y, x, id), le même que l'affectation
   et que le partage du bois : les premiers bâtiments servis, les derniers
   créés s'arrêtent d'abord.

### Pourquoi pas « 60 % de production »

C'est la version qui vient naturellement, et elle est fausse ici : la
production est entière et par bâtiment. Une ferme à 2/tick à 60 % donne 1,2 →
**1**, soit une coupe de 50 % ; avec `cropRotation` (3/tick), 1,8 → 2, soit
33 %. La même pénalité annoncée donne deux résultats selon la technologie du
joueur. Le tick raté, lui, vaut exactement un tick.

## 2. La demande d'outils sur les lignes mesurées

Composition réelle en fin de ligne (lettres du rapport : `A` Centre, `f` ferme,
`p` parc, `r` résidence, `w` puits, `s` atelier) :

| Ligne | Tick | Composition | Postes qui s'usent | Outils/tick à `W = 20` |
|---|---|---|---|---|
| `opening` | 120 | A1 f5 p1 r10 w5 s2 | 12 | 0,60 |
| `balanced` | 660 | A1 f6 p1 r16 w8 s2 | 16 | 0,80 |
| `age2` | 780 | A1 f6 p1 r16 w8 s2 | 16 | 0,80 |
| `age3` | 1141 | A1 f8 p2 r17 w11 s3 | 22 | 1,10 |
| `idle-industry` | 300 | A1 f5 p1 r10 w5 s5 | 15 | 0,75 |

Lecture : un camp de bûcherons rend **2 bois/tick**, soit **1 outil/tick**, soit
**20 postes entretenus** à `W = 20`. Une ligne arrive donc exactement à la
limite d'un camp, et la dépasse en âge 3. Sensibilité, pour situer le réglage :
à `W = 40` un seul camp entretient 40 postes (la mécanique devient un péage
unique) ; à `W = 10` il faut deux camps (la mécanique devient le centre du jeu).

## 3. Les deux murs mesurés (c'est ici que A se bloque)

**Mur 1 — le bois n'est jamais ouvert.** Sur les cinq lignes, les gisements
sont **intacts** (`wood 100/100`, `stone 50/50`) : aucun camp, aucune carrière
n'a été construit. Les stocks de planches en fin de ligne valent 0 à 5.

Correction du 2026-11-21 : le ruissellement du Centre (1 bois/tick) ne compte
pas ici — l'ancre du monde livré est en (23,23), **aucun gisement n'est
orthogonal à elle**, donc ce débit vaut 0 et personne ne l'a jamais vu. La
colonie n'a donc strictement aucun bois avant son premier camp : les outils
(0,6 à 1,1 bois/tick) n'auraient rien à prendre, et A rendrait chaque ligne
**pire** qu'aujourd'hui, pas meilleure. Ce trou d'information est corrigé la
même semaine (voir §6).

**Mur 2 — la main-d'œuvre est déjà prise.** `age3` affiche `workforce 17/22` :
**5 postes ne sont pas staffés**. Un camp et un atelier d'outils ajoutent deux
postes qui ne peuvent être pourvus qu'en retirant un ouvrier à une ferme ou à un
puits — exactement ce que la doctrine de réserve (D2) interdit. C'est le
constat P1-1 du registre, mesuré une seconde fois ici.

**Conséquence d'ordre.** D7 ne peut pas être livrée seule : elle dépend de
l'ouverture de la filière bois (camps staffés, priorité de staffing) — le même
mur que l'âge 3 refuse aujourd'hui avec ses cinq résidences en
`insufficientPlanks`. Livrer les outils d'abord, c'est payer une taxe sur une
colonie qui n'a pas encore de quoi la payer.

### Suivi du 2026-11-21 : le mur 1 est tombé en le jouant

Le mur 1 n'était pas une loi manquante, c'était une filière jamais construite.
Mesuré sur la ligne : **1 camp + 2 parcs** sur le gisement (4,4) — le camp sort
2 bois/tick, chaque parc en repousse 1, donc le gisement reste à **100/100**
indéfiniment, pour 1 planche et 50 pièces une fois. Résultat sur `age3` :
**âge 3 ouvert à t = 1141, pop 22/22, 51 bâtiments, nourriture 116, planches
944** (les cinq résidences refusées sont construites), plus deux fermes pour le
jalon `food60`, qui plafonnait à 40 avec 6 fermes.

Ce que ça change pour D7 : le bois n'est plus le facteur limitant (2 bois/tick
renouvelables), mais les outils en prendraient **1,1** — plus de la moitié — et
les planches s'arrêteraient. Il faudra donc soit un troisième parc, soit lier
l'outil à la planche. Le mur 2, lui, est intact et mesuré deux fois :
`workforce 22/25` en âge 3, trois postes sans ouvrier dont un camp et un atelier
d'outils.

## 4. La source des outils

| Source | Effet mesuré / prévisible | Verdict |
|---|---|---|
| **Bois** (`2 bois → 1 outil`, à l'atelier) | ne touche pas aux planches de logement ; consomme 0,6 à 1,1 bois/tick sur les lignes | **recommandée** |
| Planches (`2 planches → 1 outil`) | entre en concurrence directe avec le logement : les lignes finissent avec 0 à 5 planches et l'âge 3 refuse déjà 5 résidences en `insufficientPlanks` | **rejetée par la mesure** |

Reste une question que la loi ne résout pas seule : un atelier ne peut pas
faire les deux à la fois. Deux formes défendables — **le joueur choisit** la
recette dans le panneau de l'atelier (par défaut : planches, donc la grille D6
ne bouge pas tant que personne ne bascule), ou **une règle automatique**
(outils d'abord sous un seuil, planches ensuite). La première est cohérente
avec les règles du jeu (« le jeu ne décide pas à la place du joueur ») et coûte
un réglage par bâtiment ; la seconde est invisible et donc à éviter.

## 5. Ce qui reste à trancher (recommandation par ligne)

| Question | Recommandation | Pourquoi |
|---|---|---|
| Intervalle `W` | **20 ticks** | un camp = 20 postes : la mécanique se joue exactement à la taille de la colonie mesurée |
| Bâtiments qui s'usent | **ceux qui produisent** (ferme, puits, atelier, camp, carrière) | une résidence exonérée d'entretien ne peut pas être, en plus, la seule à s'user |
| Comportement sans outil | **un tick raté**, ordre canonique | seule forme exacte avec des productions entières (§1) |
| Premier outil | **inclus dans la construction** ; l'échéance tombe `W` ticks après la fin du chantier | pas de falaise au tick 0, pas de stock initial à inventer |
| Recette de l'atelier | **choisie par le joueur**, planches par défaut | le jeu ne décide pas à sa place, et D6 reste valable sans re-mesure |
| Outil en coût de pose | **non** | le premier outil est déjà inclus ; un coût en plus ferait payer deux fois l'entrée |

## 6. Ce que le code porterait

- `src/domain/resource/resource.ts` : champ `tools` dans `ResourceStock` +
  `addTools` / `deductTools` (contrat des consommables, borné à 0).
- `src/domain/production/transformation.ts` : recette d'outils
  (`2 bois → 1 outil`), même ordre d'allocation que les planches ; le choix de
  recette vit sur le bâtiment, pas dans un compteur global.
- `src/domain/production/*` : l'usure se lit à la phase de production, pas dans
  une boucle séparée — un poste qui rate son tick ne produit pas *et* ne
  consomme pas.
- `src/application/persistence/save.ts` : `SAVE_VERSION` 22 → 23. Migration :
  `tools = 0` **et** échéance reportée de `W` ticks pour chaque bâtiment
  existant, sinon une sauvegarde ancienne s'effondre au premier tick.
- `src/app/refusals.ts` : `insufficientTools` → « not enough tools » (la table
  est déjà en place ; le test de complétude échouera tant que la ligne
  manquera, ce qui est le comportement voulu).
- `src/app/details.ts` : état d'un poste (outils dus dans N ticks / au repos).

### Déjà livré le 2026-11-21 (le système du bois, avant l'usure)

- `src/domain/resource/forest.ts` : la loi du bois en **une** maison — sites
extracteurs (part de logistique, borne par la portée), parcs (repousse bornée
par la place libre, lue **après** extraction puisque c'est l'ordre du tick),
projection `extraction / repousse / net / ticksToEmpty`. Le compte à rebours
marche la loi réelle et s'arrête sur un point fixe : un parc contre un camp
laisse le dernier bois en place tous les ticks — une forêt durable, pas un
compte à rebours.
- `src/application/queries/forest.ts` : lecture unique pour l'UI (survol d'un
gisement, ligne d'inspection du camp / du Centre / du parc, résumé de forêt).
- `analysis.ts` : deux alertes qui n'existaient pas — camp staffé sans bois à
portée (**warning**, il tient un ouvrier pour rien), et budget de forêt qui se
vide (**info**, avec l'horizon).
- `tests/forest.test.ts` : 10 tests (portée, place libre, point fixe, ancre sans
gisement, copies des deux alertes).

## 7. Ce qui sera mesuré avant toute affirmation

Rien de ce qui précède n'est une mesure d'effet : ce sont des débits lus dans
les lois existantes. La livraison devra rejouer les **cinq lignes** et
comparer, ligne par ligne, verdict / population / argent net / bâtiments
opérationnels / planches, à la grille du 2026-11-20. Une ligne qui baisse sans
explication est un rouge, pas un réglage à retoucher.

Sonde attendue : un test unitaire de la loi (poste sans outil = tick raté, ordre
canonique, un lot de 2 bois ne nourrit qu'un atelier d'outils) + la grille des
scénarios. Aucun test existant ne sera réécrit pour faire vert.
