# D6 — Débit de production de l'atelier

Statut : **décision du propriétaire, appliquée le 20 novembre 2026.**
Validation multi-scénarios : **faite** (§4), mais la sortie est **partielle** (§5) :
deux critères de l'ADR dépendent de D4 et O5, pas du débit.

Base : `HEAD = 6e7e593` + arbre D3. Fiche liée : `D3-stone.md` §7.8.

## 1. La décision

Chaque atelier **staffé, opérationnel et connecté** produit **2 planches par
tick**, pour **2 bois** (la recette devient `2 bois → 2 planches`).

La décision ne touche à rien d'autre :

| Ce qui ne change pas | Preuve |
|---|---|
| Affectation de la main-d'œuvre | `jobs.ts`, ordre ferme 0 → puits 1 → reste 2 : inchangé |
| Coût de construction de l'atelier | 2 planches + 1 eau (`buildings.ts`) : inchangé |
| Coût en bois d'un lot | `WOOD_PER_PLANK_BATCH = 2` : inchangé |
| Stockage | capacité de planches : inchangée |
| Lois de consommation | nourriture/eau : inchangées |
| Déterminisme / sauvegardes | v22, aucune migration |
| Circulation | aucune planche sans bois, sans ouvrier ou hors activité |

## 2. Ce que le code porte

- `src/domain/production/transformation.ts` : `PLANKS_PER_WORKSHOP_PER_TICK = 2`
  (seule valeur de loi modifiée).
- `tests/transformation.test.ts` : recette attendue passée de `[2, 1]` à `[2, 2]`,
  +2 planches par atelier, un lot de 2 bois ne nourrit toujours qu'**un** atelier.
- `src/app/details.ts` : libellé de l'atelier mis à jour.
- `tests/selfplay.governor.ts` : budget de ticks rendu paramétrable (défaut
  inchangé) pour jouer la partie longue ; aucune règle du jeu touchée.

## 3. Effet indirect mesuré (à trancher avec D4, pas ici)

Le commerce suit déjà une règle existante : **+1 pièce par planche réellement
produite** (`economy.ts`, `COMMERCE_PER_PLANK_PRODUCED_PER_TICK`). Doubler le
débit double ce bonus par atelier en activité. La règle n'a pas été touchée ;
l'effet est mesuré ci-dessous et appartient à la fiche D4 (revenus et dépenses).

## 4. La grille de validation

Sonde : `tests/measure-throughput.test.ts`, qui rejoue le **gouverneur de
self-play** — la vraie simulation, aucune loi réécrite — sur les six scénarios de
l'ADR, au débit lu dans la constante du jeu. Deux exécutions, même graine, même
politique : une avant le changement (1 planche), une après (2 planches).

```bash
MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run \
  tests/measure-throughput.test.ts
```

| Scénario (1 500 ticks sauf mention) | Pop. 1 → 2 | Planches produites 1 → 2 | Ticks sans atelier staffé 1 → 2 | Argent final 1 → 2 |
|---|---|---|---|---|
| Développement standard | 24 → 24 | 14 → 52 | 287 → 293 | 8 901 → 6 109 |
| Bois contraint (gisement 10) | 22 → 24 | 5 → 16 | 287 → 293 | 8 924 → 6 067 |
| Main-d'œuvre limitée (plafond 10) | 10 → 10 | 147 → 294 | 270 → 270 | 6 139 → 6 286 |
| Expansion (plafond 40) | 28 → **40** | 14 → 71 | 287 → 735 | 8 843 → 1 505 |
| Stress hydrique (aléas fréquents) | 10 → 10 | 0 → 0 | 1 500 → 1 500 | 112 → 112 |
| Longue partie (3 000 ticks) | 28 → **40** | 14 → 71 | 287 → 1 373 | 20 837 → 3 301 |

Lecture, sans habillage :

1. **Le plafond des planches est levé.** À bois égal, la colonie produit 3,7 fois
   plus de planches au scénario standard, et l'atelier reste alimenté plus
   longtemps quand le gisement est maigre (5 → 16 planches).
2. **La population gagne dès que le logement est ouvert** : 28 → 40 au plafond
   d'expansion, identique sur la partie longue. Au scénario standard, la
   population reste à 24 **parce que le plafond de logement du gouverneur est
   24** : ce scénario ne mesure pas le débit, il mesure son propre plafond.
   La ligne de croissance du self-play (logement 240) passe de **28 à 78**
   colons — c'est le chiffre que les tests de parcours lisent.
3. **La marge de travailleurs n'apparaît pas.** Les ticks sans atelier staffé ne
   baissent pas (287 → 293) et explosent à l'expansion (287 → 735) : les puits
   et les fermes absorbent les bras dès que la population monte. Le débit lève le
   plafond des **planches**, pas celui de la **main-d'œuvre**.
4. **Le scénario hydrique est identique aux deux débits** : la colonie s'arrête à
   10 colons, eau 0, âge 1, dans les deux cas. Le facteur limitant est l'eau,
   pas les planches — cet échec est explicable et récupérable (il précède D6).
5. **La surproduction existe dans une colonie qui ne grandit pas** : à plafond 10,
   le stock finit à 150 planches (1/tick) puis 297 (2/tick) sans aucun usage.
   C'est borné par le stockage, donc pas « incontrôlé », mais sans conséquence
   stratégique : c'est le symptôme que D4 et O5 doivent traiter.
6. **L'argent ne s'envole pas** : la trésorerie baisse partout (8 901 → 6 109 au
   standard, 20 837 → 3 301 sur la partie longue). Vérifié : l'écart vient des
   bâtiments que le gouverneur met au repos (2 à 5 au débit 1, aucun au débit 2),
   qui ne paient plus d'entretien — pas d'une règle de production. Il reste
   **3 301 pièces** dormantes en fin de partie longue : P1-2 est intacte.

## 5. Sortie face aux critères de l'ADR

| Groupe | Sortie | Preuve |
|---|---|---|
| **A. Fonctionnement** | **satisfait** | 2 planches exactement par atelier staffé ; 0 sans ouvrier ; 0 sans lot de bois ; aucune planche créée sans matière ; runs identiques à graine égale |
| **B. Main-d'œuvre** | **partiel** | survie toujours prioritaire (ordre inchangé) et croissance rétablie (28 → 40, 78 sur la ligne de croissance) ; mais **aucune marge dégagée** : les ateliers restent sans ouvrier 287 → 293 ticks |
| **C. Matériaux** | **satisfait, une réserve** | bois toujours demandé (2 par lot, gisement épuisé dans tous les scénarios) ; planches absorbées par le logement ; **réserve** : stock mort de 297 planches sans croissance |
| **D. Multi-scénarios** | **partiel** | standard, expansion et partie longue s'améliorent ; bois contraint reste jouable ; hydrique inchangé ; **aucun scénario sacrifié** ; surproduction bornée mais sans conséquence |
| **E. Régression** | **satisfait, 3 rouges attendus** | 190/193 verts ; les 3 rouges (Step084 pop 78 vs 86, Step087 trésorerie 2 839, Step085 1 353 vs 347) **ne bougent pas de nature** : ils attendent D4 et O5, pas le débit |

**Conclusion.** Le débit est le bon levier pour le plafond industriel : il est
appliqué. Il ne suffit pas à lui seul à valider l'ADR, et c'est normal : deux de
ses critères (marge de travailleurs, surplus sans conséquence) décrivent des
systèmes que le débit ne touche pas.

## 6. Ce que la décision laisse ouvert

1. **D4 — dépense récurrente.** 3 301 pièces dormantes sur 3 000 ticks ; le bonus
   de commerce par planche amplifie désormais les revenus d'industrie.
2. **O5 — premier besoin non vital.** Le stock de planches sans usage est le
   signe qu'il n'existe pas de puits de matière en fin de partie.
3. **La main-d'œuvre.** Les puits et les fermes consomment un ouvrier par
   habitant à eux deux : la marge viendra d'un changement de dotation, pas du
   débit. C'est une nouvelle fiche, pas un effet de D6.
4. **Le bois.** Un camp alimente quatre ateliers en théorie ; en pratique le
   gisement s'épuise et les ateliers tournent au ralenti. À traiter avec O5.

## 7. Comment refaire la mesure

Même commande, même graine, même politique : les six lignes du tableau §4 se
reproduisent à l'identique. La sonde ne s'exécute que si `MEASURE_THROUGHPUT=1`,
pour ne pas peser sur la suite de tests.
