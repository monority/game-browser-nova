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
| Recette de l'atelier | **réserve automatique** : un lot d'outils, puis des planches | la recette manuelle mesurée injouable (une bascule toutes les 20 images) ; même doctrine que l'ordre de staffing — une politique énoncée, pas de la micro-gestion |
| Outil en coût de pose | **non** | la facture tombe au tick ; un coût de pose ferait payer deux fois l'entrée |
| Premier âge facturé | **âge 3** (`WEAR_START_AGE`) | mesuré : l'âge 1 ne peut pas payer (ni bois ni ouvrier), l'âge 2 le paie mais perd le plafond de croissance ; fiche §7 |
| Rendement d'un lot | **4 outils** par lot de 2 bois | à 1 par lot la facture prenait 80 % de l'atelier ; à 4, 20 % (mesuré, fiche §7) |

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

## 7. La mesure du 21/11 : la loi est écrite, et elle tue les lignes

La loi livrée (voir §9) a été activée sur les quatre lignes de référence. Résultat,
sans ambiguïté : **les quatre passent en CRITICAL**, et pas pour un détail.

| Ligne | Sans usure | Avec la facture | Ce qui casse |
|---|---|---|---|
| `opening` | HEALTHY t=300 | **CRITICAL** | nourriture 1, eau 0 : chaque 20ᵉ tick plus rien ne sort |
| `balanced` | HEALTHY t=660 | **CRITICAL** | idem |
| `age2` | HEALTHY t=780 | **CRITICAL** | idem |
| `age3` | HEALTHY t=1141 | **CRITICAL** | idem |

La cause est structurelle et déjà connue ailleurs dans ce dépôt : **l'ouverture
tourne à l'équilibre exact** (11 nourritures pour 10 bouches, eau au plafond).
Un poste qui rate un tick ne coûte pas 2,5 % : il vide la réserve et la colonie
meurt de faim. Ce n'est pourtant pas une question de marge de nourriture — la
mesure du 21/11 ci-dessous montre que **la facture est impayable** au départ,
pas qu'elle est chère.

**Décision de livraison :** la loi est écrite, testée, et **allumée en âge 3**
(`WEAR_START_AGE = 3`, `wearEnabled: true`). Les deux âges du dessous ne
peuvent pas la payer, et les deux murs sont mesurés (ci-dessous, « la marge
mesurée ») : l'âge 1 n'a ni bois ni ouvrier libre, l'âge 2 la paie mais elle
coûte le plafond de croissance (86 → 50 sur la ligne d'auto-jeu). En âge 3 la
ligne de référence garde ses chiffres et aucun poste ne repose.

Deuxième mesure au passage : la recette manuelle (le joueur choisit planches ou
outils) est injouable — il faudrait basculer toutes les 20 images. La loi la
remplace par une **réserve automatique** : les ateliers remplissent d'abord un
lot d'outils (un par poste staffé), puis font des planches. Même doctrine que
l'ordre de staffing ou le loquet hydrique : une politique énoncée, pas une
micro-gestion.

### La marge mesurée (21/11)

Trois expériences, toutes jouées sur l'état réel et le vrai pipeline de tick
(`node tools/agent/run.mjs`, `{"cmd":"init","wear":true}` ou
`{"cmd":"wear","enabled":true}`).

**1. L'ouverture, facture allumée.**

| t | postes au repos | outils | bois | nourriture | eau |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 60 | 40 |
| 20 | 10 | 0 | 0 | 28 | 20 |
| 40 | 10 | 0 | 0 | 16 | 10 |
| 100 | 10 | 0 | 0 | 3 | **0** |

Verdict CRITICAL dès t=100 (« stock 3 → 1 ticks »). La raison n'est pas le prix :
**il n'y a rien pour payer ni personne pour produire**. 10 bouches = 5 fermes +
5 puits = **10 ouvriers**, zéro libre ; l'ordre canonique sert les fermes et les
puits avant les camps et les ateliers, donc un camp ne peut jamais prendre son
ouvrier, donc aucun bois, donc aucun outil. C'est le mur du §3, mesuré au tick 0
et non en âge 3. À ce rythme (2 par ouvrier, 1 par bouche), nourriture et eau
saturent la population **à l'unité près, quelle que soit sa taille** : ajouter
une ferme ne libère pas un ouvrier, elle en demande un.

**2. Le premier état qui paie.** `balanced` à t=660 (16 bouches, 6 fermes = 19
nourritures, un camp sur le gisement (4,4), 17 postes dont 1 sans ouvrier) :
facture allumée sur cet état et rejoué 300 ticks — t=679 l'atelier a stocké sa
réserve de 16 outils, t=680 la facture tombe et 16 postes sont payés (1 outil
restant), t=960 : **HEALTHY, aucun poste n'a jamais reposé**, nourriture 40, eau
80, pop 16. Le mou apparaît avec le rendement agricole (6 fermes pour 16
bouches, +1/tick), pas avant.

**3. Ce qu'elle coûte** (même état, mêmes 300 ticks, planches à t=960) :

| Régime | Planches | Débit |
|---|---|---|
| facture éteinte | 958 | +2,0/tick |
| facture allumée, 1 outil par lot (livré) | 476 | +0,4/tick |
| facture allumée, 4 outils par lot (essai) | 836 | +1,6/tick |

L'arithmétique explique la mesure : la facture vaut 16 outils / 20 ticks =
**0,8 outil/tick**, et un atelier fait **un** outil par tick — il passait donc
80 % de son temps à l'entretien. À 4 outils par lot (le lot reste 2 bois, seul
le rendement change) il n'y consacre plus que 20 % et rend 1,6 planche/tick,
sans qu'aucun poste ne repose.

**Conclusion pour la bascule** — trois conditions, dans cet ordre :

1. **un bois** : la facture n'est payable que dans une colonie qui a un camp (ou
   un stock d'outils). Le Centre n'y supplée pas : son ruissellement exige un
   gisement adjacent et l'ancre n'en a aucun dans le monde livré.
2. **des outils à 4 par lot** : à 1 par lot la facture prend 80 % du seul atelier
   (mesuré) ; c'est un curseur de rendement, pas de structure.
3. **après le rendement agricole** : le premier état qui paie est celui où 6
   fermes nourrissent 16 bouches. Avant, la population est saturée à l'unité près
   et le camp ne peut pas être staffé.

**4. Le mur de l'échelle (mesuré en allumant).** La facture vaut 0,05 outil par
poste et par tick, soit **0,1 bois/tick/poste** : une colonie de ~100 postes a
besoin d'un camp par 20 postes pour l'entretien seul, en plus du bois que mangent
ses ateliers. Mesuré sur la ligne d'auto-jeu (plafond 86, politique de référence
à un camp) :

| Verrou | Fin de ligne | Garde-fous |
|---|---|---|
| âge 2, facture à 20 ticks | pop **50** au lieu de 86 | 5 rouges |
| âge 2, facture à 40 ticks | plafond toujours cassé | 2 rouges |
| **âge 3, facture à 20 ticks** | inchangée | **10/10 verts** |

D'où `WEAR_START_AGE = 3` : c'est le seul verrou où l'entretien se paie sans
changer le plafond du jeu. L'âge 2 reste faisable, mais il faudrait alors une
politique qui construit un camp par 20 postes — une décision de harness **et** de
jeu, pas un réglage de constante.

**Vérification dans le vrai jeu (navigateur, 21/11).** Save d'âge 3 chargée dans
l'app (bouton Load), 24 ticks à 1× : outils 8 → 18 dans la réserve, panneau
« Tools 18 », aucun poste au repos, aucune erreur console, capture
`playtest/artifacts/agent/wear-age3.png`. La capture d'ouverture (t=60) montre
« Tools 0 », c'est-à-dire la loi présente et muette avant l'âge 3.

Les lignes de référence restent **HEALTHY** : `opening` t=300, `balanced` t=660,
`age2` t=780, `age3` t=1141 (planches 944, outils 0 à la bascule), et 160 ticks
de plus en âge 3 gardent outils 22↔24 sans qu'aucun poste ne repose.

## 8. Ce qui sera mesuré avant toute affirmation

Rien de ce qui précède n'est une mesure d'effet : ce sont des débits lus dans
les lois existantes. La livraison devra rejouer les **cinq lignes** et
comparer, ligne par ligne, verdict / population / argent net / bâtiments
opérationnels / planches, à la grille du 2026-11-20. Une ligne qui baisse sans
explication est un rouge, pas un réglage à retoucher.

Sonde attendue : un test unitaire de la loi (poste sans outil = tick raté, ordre
canonique, un lot de 2 bois ne nourrit qu'un atelier d'outils) + la grille des
scénarios. Aucun test existant ne sera réécrit pour faire vert.
## 9. Ce que la loi est devenue (livré le 2026-11-21, allumé en âge 3)

- `src/domain/building/tools.ts` : facture (`WEAR_INTERVAL_TICKS = 20`, 1 outil
par poste staffé, ordre canonique, les non-payés reposent ce tick), **démarrage
en âge 3** (`WEAR_START_AGE`), **4 outils par lot** d'atelier
(`TOOLS_PER_WORKSHOP_BATCH`), réserve (`toolReserveTarget`) et
`isRestingForTools`.
- `src/domain/resource/resource.ts` : `tools` dans `ResourceStock` (seul état
nouveau ; l'horloge est le numéro de tick, donc **aucun compteur par bâtiment**
à migrer).
- `src/domain/simulation/tick.ts` : phase d'usure avant toute production.
- `src/domain/production/*` : les quatre producteurs (ferme, puits, camp,
carrière) et l'atelier sautent un poste au repos ; l'atelier réserve les outils
avant les planches.
- `src/domain/building/activity.ts` : raison `no_tools`, distincte de
`no_workers` et d'`insufficient_input`.
- Persistence `v23` : `tools` + `wearEnabled` (absent d'une sauvegarde
antérieure = la loi livrée, donc allumée ; l'âge 1-2 ne facture de toute façon
rien). Le repos est dérivé chaque tick, jamais sauvegardé.
- `tests/wear.test.ts` : 9 tests (facture au bon tick, un outil par poste, pas
de facture pour un poste vide, repos d'un seul tick, **rien avant l'âge 3**,
réserve d'un lot, persistance).

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
