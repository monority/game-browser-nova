# W1 — Dotation et allocation de la main-d'œuvre : les faits

Statut : **faits mesurés, décision ouverte.** Aucune loi n'est modifiée par cette
fiche. Elle répond aux livrables 1 à 4 du dossier
`../GAME-DESIGN-WORKFORCE-ALLOCATION.md` §12 et donne au propriétaire de quoi
trancher les modèles A, B et C.

Base : `HEAD = 6e7e593` + arbre de travail (D3 + D6), le 20 novembre 2026.
Fiches liées : `D6-workshop-rate.md` (le débit, inchangé ici), `D1-option-c.md`
(la techno d'eau, retirée du catalogue), `D4-money-sinks.md` (l'argent dormant).

## 1. Méthode

Tout vient de la simulation réelle, jamais d'une valeur écrite à la main. La
sonde des six scénarios a été étendue pour relever, à chaque tick :

```bash
MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run \
  tests/measure-throughput.test.ts
```

Une exécution = 7 lignes JSON, 5 secondes. Les compteurs de main-d'œuvre lisent
l'état du jeu avec **ses propres lois** (`staffingOrder`, `foodPerFarm`,
`waterPerWell`, `plankThroughput`) : aucune constante n'est recopiée dans la
sonde. La sonde reste optionnelle ; sans la variable elle ne mesure rien, donc
aucune porte de régression n'a bougé.

Trois lectures à ne pas confondre :

- **vérifié (code)** : lu dans le dépôt au 20/11 ;
- **mesuré** : observé sur le tick, déterministe, rejouable par la commande
  ci-dessus ;
- **dérivé** : calculé à partir d'une mesure ou d'une loi, pas observé.

L'état est lu **après** le tick : le drapeau `staffed` décrit donc l'affectation
du tick suivant. Le décalage d'un tick est connu et sans effet sur des sommes de
1 500 ticks.

## 2. Cartographie (vérifié code)

Un poste = **un** travailleur, sur les cinq types de bâtiments qui en offrent un.

| Bâtiment | Postes (`jobCapacity`) | Rendement d'un poste staffé | Effet d'une techno |
|---|---:|---|---|
| Ferme | 1 | 2 nourriture/tick | +1 par techno `farmFood` (3 technos livrées) |
| Puits | 1 | 2 eau/tick | +1 par `wellWater` — **hors catalogue** (D1) |
| Bûcheron | 1 | 2 bois/tick (× efficacité logistique) | aucune |
| Carrière | 1 | 2 pierre/tick | +1 par `quarryStone` (2 livrées) |
| Atelier | 1 | 2 planches pour 2 bois/tick (D6) | `workshopCommerce` : +1 commerce |
| Résidence, parc, centre, entrepôt | 0 | — | — |

Règles d'allocation (vérifiées dans `src/domain/jobs/jobs.ts`) :

1. Un poste est **éligible** si le bâtiment est actif (opérationnel, non mis au
   repos), s'il est adjacent à une route, et si sa capacité est > 0.
2. Les colons remplissent les postes dans l'ordre **ferme (0) → puits (1) →
   reste (2)**, et à l'intérieur d'une classe par ordre canonique (y, x, id).
   Le « reste » est **un seul seau** : bûcherons, carrières et ateliers y sont
   rangés ensemble et départagés par la position sur la carte.
3. En bande hydrique grave, une **réserve** passe avant tout : elle réclame
   `ceil(population / waterPerWell)` puits, puis rend la main.
4. **Toute la population travaille** : le pool vaut `state.population`
   (`remaining = state.population`). Il n'existe ni enfants ni vieillards — la
   réponse à la question 2 du dossier est donc 100 %, par construction.
5. L'affectation est la **dernière** phase du tick : un poste qui vient d'ouvrir
   est staffé au tick suivant.
6. Pas de fonctionnement partiel : un poste staffé produit le taux plein, un
   poste vide ne produit rien. (La saison maigre met des fermes au repos, mais
   c'est la saison, pas la main-d'œuvre.)

## 3. L'arithmétique de la survie (dérivé des lois)

Un fermier nourrit **2** colons (2 nourriture contre 1 par colon), un puisatier
abreuve **2** colons (2 eau contre 1 par colon). Le centre donne 1 nourriture
gratuite. Donc, sans aucune techno :

```
fermes nécessaires = ceil((N - 1) / 2)
puits nécessaires  = ceil(N / 2)
somme              = N     (N pair : N/2 + N/2 ; N impair : (N-1)/2 + (N+1)/2)
```

**À l'âge 1 sans techno, nourrir et abreuver N colons coûte exactement N
travailleurs.** La marge industrielle n'est pas faible : elle est nulle, par
construction, et aucun débit d'atelier ne peut la créer.

Trois leviers existent aujourd'hui :

| Levier | Effet sur la marge | État |
|---|---|---|
| Trois technos de ferme (+1/+1/+1) | fermes de `ceil((N-1)/2)` à `ceil((N-1)/5)` : à N=24, 12 → 5 postes | livré, âges 1 à 3 |
| Techno de puits (+1 eau) | puits de `ceil(N/2)` à `ceil(N/3)` : à N=24, 12 → 8 | **retirée du catalogue** (D1), en attente de D2/D4 |
| Rien d'autre | — | — |

L'eau est donc une **taxe permanente de la moitié de la population** : aucune
techno vendue ne la réduit, et c'est le premier poste de dépense de travail dans
tous les scénarios mesurés (11,12 puits en moyenne sur 24 habitants en standard).

## 4. Les six scénarios, mesurés

Moyennes sur 1 500 ticks (3 000 pour la partie longue). « Demande » = postes
éligibles ; « affectés » = postes réellement staffés.

| Scénario | Pop | Demande moy. (ferme + puits + reste) | Affectés moy. (vital + reste) | Sans emploi moy. (ticks) | Fermes sans bras | Puits sans bras |
|---|---:|---|---|---|---:|---:|
| Standard | 24 | 22,60 (6,45 + 11,12 + 5,03) | 20,67 (17,57 + 3,09) | 0,06 (26 ticks) | 0 / 1 500 | 0 / 1 497 |
| Bois contraint | 24 | 22,60 (6,45 + 11,12 + 5,03) | 20,67 (17,57 + 3,09) | 0,06 (26 ticks) | 0 / 1 500 | 0 / 1 497 |
| Main-d'œuvre limitée | 10 | 13,72 (3,39 + 5,20 + 5,13) | 9,90 (8,59 + 1,31) | 0,10 (147 ticks) | 0 / 1 500 | 0 / 1 353 |
| Expansion | 40 | 28,89 (10,09 + 16,41 + 2,39) | 28,43 (26,50 + 1,94) | 4,00 (1 130 ticks) | 0 / 1 500 | 0 / 1 458 |
| Stress hydrique | 10 | 10,01 (5,00 + 5,00 + 0,01) | 10,00 (10,00 + 0,00) | 0,00 (0 tick) | 0 / 1 500 | 0 / 1 500 |
| Partie longue | 40 | 31,72 (11,04 + 18,33 + 2,34) | 31,49 (29,38 + 2,12) | 4,72 (2 630 ticks) | 0 / 3 000 | 0 / 2 905 |

Ce que ça dit, scénario par scénario :

- **Standard / Bois contraint** : aucun besoin vital n'est jamais privé de bras,
  et il ne reste **aucun** travailleur libre (0,06 en moyenne, 26 ticks sur
  1 500). Les 4 ateliers tournent à 3,07 sur 4 en moyenne — l'industrie
  n'est pas privée de travailleurs, elle est privée de bois (§5).
- **Main-d'œuvre limitée** : 10 habitants, mais 5 fermes (3 suffisent) et 6 puits
  (5 suffisent) : la politique de construction garde 3 bras dans des postes
  vitaux en trop. 1,12 atelier staffé sur 4, et c'est le seul scénario où les
  planches montent sans s'arrêter (297).
- **Expansion / Partie longue** : la croissance ouvre 4,00 puis 4,72 travailleurs
  sans emploi — **la marge existe mais reste inutilisée**, parce que les
  ateliers et les entrepôts sont plafonnés par la politique du harnais, pas par
  une loi. Les planches se figent à 48 dès t600.
- **Stress hydrique** : 5 fermes + 5 puits = 10 postes pour 10 habitants. Marge
  nulle, jamais, et aucune techno (0 recherchée : l'âge 2 n'est jamais atteint).
  Les 2 ateliers construits n'ont jamais un seul bras. Le stock d'eau est à 0
  pendant 1 494 ticks sans que personne ne meure (production = consommation),
  mais la colonie ne peut plus rien ouvrir.

## 5. Où part la production industrielle, et pourquoi

| Scénario | Ticks avec atelier | Ticks avec ≥ 1 atelier staffé | Ateliers staffés moy. / construits | Bûcheron staffé moy. | Carrière staffée moy. | Atelier-ticks sans bras | Atelier-ticks sans bois |
|---|---:|---:|---|---:|---:|---:|---:|
| Standard | 1 477 | 1 207 (82 %) | 3,07 / 4 | **0,02** / 1 | **0,00** / 1 | 650 | 4 585 |
| Bois contraint | 1 477 | 1 207 (82 %) | 3,07 / 4 | 0,02 / 1 | 0,00 / 1 | 650 | 4 608 |
| Main-d'œuvre limitée | 1 500 | 1 230 (82 %) | 1,12 / 4 | 0,10 / 1 | 0,10 / 1 | 3 679 | 1 674 |
| Expansion | 1 035 | 765 (74 %) | 1,90 / 4 | 0,03 / 1 | 0,01 / 1 | 650 | 2 817 |
| Stress hydrique | 6 | 0 (0 %) | 0,00 / 2 | — | — | 12 | 0 |
| Partie longue | 1 897 | 1 627 (86 %) | 2,10 / 4 | 0,02 / 1 | 0,01 / 1 | 650 | 6 265 |

Le fait central : **le bûcheron est staffé 2 % du temps, la carrière 0 à 1 %.**
Les ateliers prennent les rares bras libres (3,07 sur 4) et passent l'essentiel de
la partie sans matière. Les planches produites suivent presque exactement le
temps de bûcheron, pas le débit de l'atelier :

| Scénario | Planches fin (produites / dépensées) | Bois dans le sol à la fin | Pierre dans le sol à la fin | Argent dormants |
|---|---:|---:|---:|---:|
| Standard | 47 (52 / 17) | 60 | 57 | 6 109 $ |
| Bois contraint | 5 (16 / 23) | 10 | 57 | 6 067 $ |
| Main-d'œuvre limitée | 297 (294 / 9) | 60 | 0 | 6 286 $ |
| Expansion | 48 (71 / 35) | 60 | 18 | 1 505 $ |
| Stress hydrique | 12 (0 / 0) | 60 | 60 | 112 $ |
| Partie longue | 48 (71 / 35) | 60 | 18 | 3 301 $ |

En standard, les planches se figent à **47 dès t450** et ne bougent plus jusqu'à
t1500, alors que 60 bois dorment dans le sol à deux pas d'un camp qui n'a jamais
son ouvrier. C'est le cercle vicieux, mesuré :

```
ateliers staffés → ils réclament du bois → le bûcheron perd le dernier bras
→ plus de bois → les ateliers ne transforment rien → rien à construire
→ la trésorerie s'accumule sans emploi
```

La cause est l'ordre du seau « reste » (§2, règle 2) : bûcheron et atelier sont
dans le même seau, départagés par la position, et l'atelier est plus près du
centre. **Ce n'est pas le débit de l'atelier, ni la priorité vitale.**

## 6. La variante qui tranche : trois bûcherons au lieu d'un

Même graine, même politique, même budget, seuls les plafonds de construction
changent (`campCap: 3`). Aucune loi touchée.

| | 1 camp | 3 camps |
|---|---:|---:|
| Population finale | 24 | 22 |
| Camp staffé en moyenne | 0,02 / 1 | **0,02 / 3** |
| Ateliers staffés en moyenne | 3,07 / 4 | 3,11 / 4 |
| Planches (produites) | 47 (52) | 39 (42) |
| Atelier-ticks sans bois | 4 585 | 4 658 |
| Argent final | 6 109 $ | 4 413 $ |

Construire plus de camps **n'ajoute pas un seul ouvrier** : les postes
supplémentaires sont créés, éligibles, et restent vides. La ressource rare est le
travailleur, et il est déjà capté ailleurs. Corollaire : **ce n'est pas un
problème de nombre de bâtiments, c'est un problème d'ordre et de choix.**

## 7. Ce que la mesure confirme, et ce qu'elle contredit

**Confirmé**

- « Les fermes et les puits absorbent ensemble environ un travailleur par
  habitant » : exact, et même exactement N sans techno (§3). Mesuré : 17,57
  postes vitaux sur 24 habitants en standard, 26,50 sur 40 en expansion.
- « Les ateliers sans travailleur ne produisent rien » : vérifié (aucune
  production partielle).
- « Le débit supérieur de D6 ne résout pas le problème » : vérifié — 82 % des
  ticks ont un atelier staffé, et la production reste bloquée par le bois.
- « L'inversion de l'ordre ferme → puits → reste coûte la croissance » :
  cohérent avec `ADR-016` et la mesure du 18/11 (86 → 60 colons).

**Contredit ou à corriger**

- « Les ateliers restent sans ouvrier pendant une part importante de la
  simulation » : en standard, **82 % des ticks ont au moins un atelier staffé**
  et 3,07 ateliers sur 4 tournent en moyenne. Les 293 ticks sans atelier staffé
  sont la fenêtre d'ouverture (t271 → t564), pas un état durable.
- « Le problème est la dotation de travail » : le premier blocage mesuré est
  **l'ordre du seau « reste »**, qui envoie le dernier bras à l'atelier au lieu
  du bûcheron. La dotation vitale, elle, est correctement proportionnée : un
  fermier nourrit deux bouches, un puisatier en abreuve deux.
- Le §2.1 dit « les besoins vitaux sont la nourriture et l'eau » : exact, mais
  l'eau coûte **la moitié de la population en travail, définitivement**, faute de
  techno livrée (D1). Ce n'est pas un détail de dotation, c'est un plafond.

## 8. Les trois modèles confrontés aux faits

**Modèle A — optimiser la dotation.** Côté nourriture, la base est déjà
« 1 travailleur = 2 bouches » : descendre en dessous rendrait la survie quasi
gratuite, exactement le risque que le dossier nomme. Côté eau, le seul levier
est la techno de puits, c'est-à-dire l'option C **déjà mesurée et retirée** par
D1 (un poste libéré, ~6 000 pièces sans emploi). Et surtout : libérer des bras
ne produit rien de plus tant que le bois manque (§5). **A seul ne débloque pas
l'industrie** ; il augmente le nombre d'ateliers vides.

**Modèle B — efficacité par la progression.** Déjà présent et déjà décisif : les
trois technos de ferme font passer les besoins en fermes de 12 à 5-6 postes à
N=24, soit les 6 bras que l'industrie occupe en standard. Mais il arrive tard
(âge 2 à t321, âge 3 plus tard) et ne dit rien de l'eau. **B marche, ne suffit
pas, et ne peut pas être la seule réponse** — ce que le dossier prévoyait.

**Modèle C — organisation.** C'est le seul dont la cible est le blocage mesuré :
un seau unique où l'atelier passe avant le bûcheron. Deux mises en œuvre
possibles, aucune décidée :

1. une règle d'allocation plus fine (« on ne staffe pas un atelier qu'on ne peut
   pas nourrir en bois ») — c'est une règle de jeu, donc une décision ;
2. un comportement de joueur : mettre au repos les ateliers qu'on ne peut pas
   alimenter, ce qui rend le bras au bûcheron — aucune loi à changer, mais rien
   dans l'interface ne l'explique aujourd'hui.

Attention à ne pas confondre avec R3 : « camp classé avant les ateliers » a été
**mesuré négatif** (86 → 60 colons) et reste rejeté. Une règle conditionnelle
n'est pas cette inversion-là, mais elle n'a jamais été mesurée.

## 9. Les dix questions du dossier (§10)

| # | Question | Réponse |
|---|---|---|
| 1 | Coût en travailleurs par bâtiment | 1 poste : ferme, puits, bûcheron, carrière, atelier ; 0 : résidence, parc, centre, entrepôt (§2) |
| 2 | Part de la population qui peut travailler | **100 %** : le pool vaut la population entière, par construction |
| 3 | Besoins vitaux surdimensionnés ? | Non en rendement (1 fermier = 2 bouches, 1 puisatier = 2 verres). Oui en **quantité construite** : 7 fermes pour 6 nécessaires, 13 puits pour 12, 5 fermes pour 3 en petit scénario |
| 4 | Le travail est-il attribué par bâtiment, activité ou production ? | Par **bâtiment**, un poste par bâtiment, dans l'ordre ferme → puits → reste |
| 5 | Fonctionnement partiel ? | **Non** : plein taux ou rien |
| 6 | Les bâtiments vitaux mobilisent-ils tous leurs effectifs ? | Oui (1 poste chacun, plein taux). La saison maigre repose des fermes, ce n'est pas du staffing |
| 7 | Efficacité dès le début ou par la progression ? | **Décision du propriétaire** ; les faits disent que la marge initiale est nulle sans techno, et que B existe déjà |
| 8 | Quel niveau de disponibilité industrielle pour une colonie standard ? | Mesuré aujourd'hui : 82 % des ticks avec ≥ 1 atelier staffé, mais une production arrêtée faute de bois. Aucune cible n'est fixée |
| 9 | Quelle difficulté pour une colonie limitée ? | **Ouverte** : le petit scénario produit le plus de planches (297) parce que ses ateliers laissent un bras au bûcheron |
| 10 | Comment afficher la marge de travail ? | **Ouverte** ; l'inspecteur sait déjà dire « pas d'ouvrier » (même source que la phase, `staffingOrder`), pas encore « pas de matière » |

## 10. Livrables du dossier (§12)

| Livrable | État |
|---|---|
| Cartographie réelle des besoins | **fait** (§2) |
| Mesure des travailleurs disponibles et affectés | **fait** (§4) |
| Vérification des règles d'allocation | **fait** (§2, lu dans le code) |
| Analyse des six scénarios | **fait** (§4, §5) |
| Comparaison des trois modèles | **faite, adossée aux mesures** (§8) — ne vaut pas proposition retenue |
| Proposition de modèle retenu | **non** : décision du propriétaire |
| Critères d'acceptation définitifs | à écrire après le choix |
| Décision explicite | **non** |

## 11. Ce qui n'est pas mesuré

- Aucune **recette/dépense** par tick n'est relevée ici (seules les trésoreries
  finales) : c'est le sujet de D4, pas de cette fiche.
- Aucun relevé du **bois produit** par tick : la sonde lit le bois restant au
  sol et les postes staffés, pas le flux. Le lien camp → planches est donc
  cohérent mais pas instrumenté tick par tick.
- Les scénarios décrivent **une** politique de construction (celle du harnais :
  1 camp, 4 ateliers, fermes = `ceil(pop/2)+1`). Un joueur humain peut placer
  autrement et bâtir davantage : la mesure prouve que **la loi le permet**, pas
  qu'un joueur tombe toujours dans le piège.
- Aucun test humain (lisibilité, douleur, compréhension de l'écran) : question 10.
- Aucune variante de dotation n'a été simulée (rendement de base 3 au lieu de 2) :
  ce serait une modification de loi, donc une décision.

## 12. Ce que je proposerais de mesurer ensuite, sans rien décider

1. ~~**La règle conditionnelle du modèle C**~~ — **faite le 20/11** sur accord
   du propriétaire : `W1-conditional-allocation-experiment.md`. Verdict
   **REVISE** : le mécanisme corrige bien le blocage (bûcheron 2 % → 74 % des
   ticks, zéro atelier sans bois, planches ×19 en standard) sans toucher la
   survie, mais il refuse un bras sans le dire, plafonne l'industrie au bois
   disponible et ne règle pas l'expansion (camp construit trop tard).
2. **La dotation de base** (ferme 2 → 3, puits 2 → 3) : combien de colons et de
   planches en plus, et est-ce que la survie devient trop facile. C'est
   exactement l'hypothèse du modèle A, actuellement non testée.

## 13. Effet sur les décisions voisines

- **D4 (argent)** : les 6 109 $ dormants du scénario standard ne viennent pas
  d'un manque de dépenses à inventer, mais d'une **chaîne de matériaux arrêtée**.
  Dimensionner une dépense récurrente avant de rouvrir le bois calibrerait une
  fuite sur une économie qui ne produit plus rien. L'ordre utile est : bois →
  industrie → dépense.
- **O5 (besoin non vital)** : la marge de travail existe (4,72 bras libres en
  partie longue) mais elle est déjà absorbée par des ateliers qui ne produisent
  pas. Un besoin supplémentaire aujourd'hui punirait la survie sans rien créer.
- **D5 (fin de partie)** : une partie qui se fige à t450 ne peut pas porter un
  objectif de développement ; la condition préalable est que la boucle matérielle
  tourne.
