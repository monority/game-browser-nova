# W1-C1 — Expérience : allocation conditionnelle bûcheron / atelier

Statut : **expérience isolée, mesurée le 20 novembre 2026.** Conservée telle
quelle comme preuve historique du comportement validé.

> **Depuis le 20 novembre 2026, la règle est LIVRÉE** : voir
> [`W1-conditional-workforce-allocation.md`](W1-conditional-workforce-allocation.md).
> Les chiffres de ce rapport n'ont pas été réécrits : les six scénarios officiels
> les reproduisent à l'identique, et la sonde le vérifie maintenant elle-même
> (`tests/measure-throughput.test.ts`, comparaison `-c1` / `-official`).

Décision demandée au propriétaire au §10 (tranchée : option **a**, la loi). Aucun commit, aucun changement de D6,
de rendement, de priorité vitale, de sauvegarde ni de règle de production hors
de la branche expérimentale.

Base : `HEAD = 6e7e593` + arbre de travail (D3 + D6). Dossier :
`../GAME-DESIGN-WORKFORCE-ALLOCATION.md`. Faits de référence :
`W1-workforce-allocation.md`.

## 1. Ordre des phases — vérifié dans le code

Lu dans `src/domain/simulation/tick.ts` (`stepSimulation`), pas supposé :

| # | Phase | Ce qui compte pour l'expérience |
|---|---|---|
| 1 | `advanceConstruction` | un bâtiment fini devient opérationnel ici |
| 2 | `produceFood` / `produceWater` | lisent l'affectation du tick **précédent** |
| 3 | `produceWood` / `produceStone` | **le bois entre** (extraction, gisement fini, × logistique) |
| 4 | `producePlanks` | **le bois sort** : `floor(bois / 2)` ateliers transforment, 2 bois → 2 planches |
| 5a–6 | spoilage, `consumeFood` / `consumeWater`, `clampStorage` | nourriture et eau seulement |
| 7 | `updatePopulation`, jauge hydrique, départs | la population peut baisser **avant** l'affectation |
| 8 | `updateEnvironment` | pollution + **repousse du bois par les parcs** (1/parc/tick) |
| 9 | `assignJobs` | **l'affectation du tick suivant** est écrite ici |
| 10–11 | revenus, entretien, événements | l'argent ne touche pas au bois |

Conséquences, toutes vérifiées et non déduites :

- **Le bois n'est produit et consommé qu'aux phases 3 et 4, avant l'affectation.**
  Au moment où `assignJobs` décide, le stock de bois est donc le **résidu
  d'après-transformation**. Rien d'autre que la transformation ne consomme du
  bois : aucun bâtiment n'a de coût en bois (ils coûtent en planches et en
  pierre, `src/content/buildings.ts`).
- **Un contrôle sur le seul stock serait faux.** Le tick suivant produit
  (phase 3) *avant* de transformer (phase 4) : avec un résidu de 0 ou 1, un
  atelier serait refusé à jamais alors que le camp qu'on vient de staffer va
  livrer 2 bois. C'est pourquoi la règle projette la coupe du camp.
- **Le camp peut produire moins de 2** : `applyLogistics` applique un plafond de
  60 % au-delà du rayon libre de 12 sauts, et `extractAdjacent` borne la prise au
  gisement adjacent restant (qui inclut la repousse des parcs).
- **Plusieurs ateliers se partagent le même bois** : `transformingWorkshops`
  trie les ateliers staffés dans l'ordre canonique et n'en garde que
  `floor(bois / 2)`. Aucun ne peut consommer deux fois le même lot.

## 2. La politique expérimentale, exactement

`IndustryAllocationPolicy = "baseline" | "conditional-wood"`, défaut
`"baseline"`. La branche expérimentale ne change **ni l'ordre, ni les groupes,
ni la réserve hydrique** — une seule condition s'ajoute au passage :

```
budget ← stock de bois (résidu du tick)
pour chaque poste dans l'ordre habituel (ferme, puis puits, puis « reste » par y,x,id) :
    si le poste est un atelier et que budget < 2 :  on SAUTE l'atelier (il ne prend pas de bras)
    si le poste est un atelier et que budget ≥ 2 :  budget -= 2, on le staffe
    sinon : on staffe
    si le poste est un bûcheron staffé :  budget += coupe projetée du camp
```

Points de conception :

- **Le camp n'est jamais prioritaire.** Il n'est pas déplacé dans la file : il
  ajoute son bois quand son tour arrive. C'est la différence avec R3 (« camp
  classé avant les ateliers »), mesuré négatif (86 → 60 colons) et toujours
  rejeté.
- **Conséquence assumée : un tick de retard la première fois.** Si l'atelier
  passe avant le camp dans l'ordre canonique, il est sauté, le camp prend le
  bras, et l'atelier est staffé au tick suivant. Aucune boucle, aucun blocage.
- **Coupe projetée** (`projectedCampWood`) : `min(part logistique, gisement
  adjacent restant)`, lue sans rien écrire. Même loi que `produceWood` ; deux
  camps sur le même gisement peuvent surestimer légèrement, ce qui ne crée
  jamais de bois (la phase 4 revérifie le stock).
- **Aucun seuil inventé, aucun bonus, aucun état caché.** Le seul nombre est
  `WOOD_PER_PLANK_BATCH`, la constante du jeu.
- **La réserve hydrique passe toujours avant** : elle est appliquée avant la
  boucle, donc l'eau reste prioritaire.

## 3. Fichiers modifiés

| Fichier | Modification | Portée |
|---|---|---|
| `src/domain/jobs/jobs.ts` | type `IndustryAllocationPolicy`, `projectedCampWood` (privé), branche `conditional-wood` dans la deuxième passe, `assignJobs(state, policy = "baseline")` | la branche n'est atteinte que si l'appelant la demande |
| `src/domain/simulation/tick.ts` | `TickFlows` + 3 flux (bois produit, bois consommé, planches produites), `stepSimulation`/`stepTicks` acceptent la politique, capture des flux quand l'appelant les demande | instrumentation ; aucun changement de règle |
| `tests/selfplay.governor.ts` | paramètres `policy` et `flows` (défauts : politique livrée, pas de flux) | harnais de mesure |
| `tests/measure-throughput.test.ts` | six scénarios `-c1`, compteurs de main-d'œuvre et de flux | sonde opt-in (`MEASURE_THROUGHPUT=1`) |

Aucun autre fichier touché. Aucun état persisté, aucune constante de production,
aucune migration : **v22 inchangée**.

## 4. Résultats — six scénarios, mêmes graines, mêmes plafonds

Une seule exécution produit la référence et l'expérience (13 lignes JSON,
~25 s) :

```bash
MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run \
  tests/measure-throughput.test.ts
```

« Planches produites » et « bois produit / consommé » sont des **flux lus sur le
tick** (`TickFlows`), jamais déduits des stocks.

| Scénario | Pop (min/fin) | Planches produites | Planches fin | Bois produit | Bois consommé | Bois au sol | Camp staffé | Ateliers staffés | At.-ticks sans bois | At.-ticks sans bras | Trésorerie |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| standard | 10/24 → **10/24** | 60 → **1166** | 47 → **1149** | 60 → **1167** | 60 → **1166** | 60 → **60** | 0,02 → **0,74** | 3,07 → **0,39** | 4 585 → **0** | 650 → **2 957** | 6 109 $ → **3 166 $** |
| bois-contraint | 10/24 → **10/24** | 18 → **1 356** | 5 → **1 339** | 18 → **1 358** | 18 → **1 356** | 10 → **2** | 0,02 → **0,76** | 3,07 → **0,45** | 4 608 → **0** | 650 → **2 861** | 6 067 $ → **3 356 $** |
| main-d'œuvre limitée | 10/10 → **10/10** | 294 → **1 272** | 297 → **1 275** | 294 → **1 272** | 294 → **1 272** | 60 → **60** | 0,10 → **0,42** | 1,12 → **0,42** | 1 674 → **0** | 3 679 → **4 717** | 6 286 $ → **7 264 $** |
| expansion | 10/40 → **10/40** | 90 → **136** | 48 → **94** | 90 → **136** | 90 → **136** | 60 → **60** | 0,03 → **0,05** | 1,90 → **0,05** | 2 817 → **0** | 650 → **3 340** | 1 505 $ → **1 324 $** |
| stress hydrique | 10/10 → **10/10** | 0 → **0** | 12 → **12** | 0 → **0** | 0 → **0** | 60 → **60** | 0,00 → **0,00** | 0,00 → **0,00** | 0 → **0** | 12 → **12** | 112 $ → **112 $** |
| partie longue (3 000 t.) | 10/40 → **10/40** | 90 → **136** | 48 → **94** | 90 → **136** | 90 → **136** | 60 → **60** | 0,02 → **0,02** | 2,10 → **0,02** | 6 265 → **0** | 650 → **6 796** | 3 301 $ → **3 142 $** |

Survie, identique dans les deux variantes (mesuré) : nourriture minimale 22 dans
tous les scénarios peuplés, famine 0, colons sans eau 0 — sauf le scénario
stress hydrique, inchangé par construction (0 atelier staffé dans les deux
variantes, 1 494 ticks avec un stock d'eau nul, aucune techno, âge 1).
Population **minimale et finale identiques** partout : 10/24, 10/24, 10/10,
10/40, 10/10, 10/40.

Bâtiments (mesuré) : seuls écarts — standard et bois contraint gagnent
**+2 entrepôts** (les planches le permettent), tout le reste est identique.

Détail des bûcherons (mesuré) : dans « standard » le camp est éligible 1 170
ticks, dont **1 140 sans bras** en référence et **55** en C1. Dans « expansion »
et « partie longue », le camp n'est éligible que **73 / 76 ticks sur 1 500** :
il n'existe pas avant la fin de la partie, la règle n'a donc presque rien à
répartir.

## 5. Écarts et régressions

**Ce que la règle répare (mesuré)**

- Le bûcheron passe de 2 % à 74-76 % de présence (standard, bois contraint) et
  de 10 % à 42 % (main-d'œuvre limitée).
- **Zéro atelier-ticks sans bois** dans les six scénarios (4 585 → 0 en
  standard) : plus aucun atelier n'est payé à ne rien faire.
- Le bois coule : 60 → 1 167 en standard, 18 → 1 358 en bois contraint.
- Planches produites : ×19 en standard, ×75 en bois contraint, ×4,3 en
  main-d'œuvre limitée. Le stock final ne s'écoule plus : 1 149 en standard.

**Ce que la règle ne répare pas (mesuré)**

- **Expansion et partie longue : +46 planches seulement** (48 → 94). Cause
  mesurée : le camp n'est éligible que 76 ticks sur 1 500 — il est construit
  trop tard (politique de construction du harnais, pas la loi). La règle ne peut
  pas répartir un bois que personne ne peut couper.
- **Un atelier staffé en moins** : 3,07 → 0,39 en standard. C'est le but (mieux
  vaut un atelier qui tourne que trois qui attendent), mais l'industrie se
  retrouve plafonnée par le camp : 2 bois/tick + la repousse des parcs nourrit
  environ **1 planche par tick**, pas 8.
- **Trésorerie en baisse** dans 4 scénarios sur 6 (6 109 → 3 166 $ en standard,
  6 067 → 3 356 $, 1 505 → 1 324 $, 3 301 → 3 142 $), en hausse dans un
  (6 286 → 7 264 $). Mécanismes observés, non isolés : **+2 entrepôts**
  (entretien en plus) et **ateliers mis au repos par le gouverneur** quand la
  citerne passe sous la population (`manageMothballs`, 7 bâtiments au repos à
  t900 en C1 contre 0 en référence), ce qui coupe le commerce de connexion.
  L'argent n'est pas le critère de cette expérience (c'est D4) : le chiffre est
  rapporté, pas interprété comme un gain ou une perte de design.
- **Le stock d'eau descend plus bas** en cours de partie (minimum 5 au lieu de
  11 en standard) sans qu'aucun colon ne soit privé d'eau ; en fin de partie il
  est **plus haut** (102 au lieu de 80). Écart de trajectoire de construction,
  pas une régression de survie.

**Régression à surveiller (hypothèse, non mesurée)** : l'atelier refuse
silencieusement un bras. Un joueur qui voit « 1 atelier sur 4 » sans explication
perd la lisibilité que le critère E du dossier exige. Aucune interface n'a été
touchée ici.

## 6. Déterminisme

Deux exécutions complètes consécutives, mêmes graines, **13 lignes JSON
identiques octet pour octet** (`diff` vide). Aucun tirage aléatoire n'a été
ajouté : la condition est une fonction pure de l'état (stock, gisements,
logistique, ordre canonique). La projection ne lit ni n'écrit autre chose que
des champs déterministes.

## 7. Interprétation

La mesure confirme l'hypothèse de la mission : **le blocage n'était pas la
dotation de travail mais l'allocation du dernier bras.** Là où un camp existe,
la règle le remplit (0,74 sur 1), supprime la famine de bois des ateliers
(4 585 → 0 atelier-ticks sans bois) et multiplie la production par 4 à 75,
sans toucher à la survie, à la population, à la priorité vitale ni au débit D6.

Elle montre aussi ses limites, et elles sont instructives :

1. **Le bois est la ressource physique qui borne l'industrie**, pas le travail.
   Avec 2 bois/tick par camp et la repousse des parcs, la colonie plafonne
   autour de 1 planche/tick. La règle rend ce plafond visible au lieu de le
   masquer par quatre ateliers staffés qui ne produisent rien.
2. **La règle ne peut rien là où le camp n'existe pas** (expansion, partie
   longue). Ce n'est pas un défaut de la règle, c'est la politique de
   construction du harnais : ces deux scénarios n'ont pas de bûcheron avant la
   fin. Les traiter demande une décision sur la construction des camps, pas sur
   l'allocation.
3. **Le scénario « bois contraint » cesse d'être contraint** dès que quelqu'un
   coupe : avec 3 parcs qui repoussent 1 bois chacun par tick, le bois est
   renouvelable. Le nom du scénario décrit la référence, pas la loi.
4. **La trésorerie baisse** alors que la production explose : c'est le premier
   signe que D4 (dépense) devient le sujet une fois le bois rouvert. Une
   économie qui produit sans dépense accumule des planches, pas de l'argent.

## 8. Limites et effets non mesurés

- **Une seule politique de construction** (harnais) : 1 camp, 4 ateliers,
  fermes `ceil(pop/2)+1`. Un joueur humain place autrement ; la mesure prouve
  que la loi le permet, pas qu'un joueur tombera toujours dans le piège.
- **Les flux sont instrumentés** (bois produit/consommé, planches produites)
  mais **les planches consommées** restent une valeur dérivée (delta de stock,
  `totalSpentPlanks`), pas un compteur de la phase de construction.
- **Aucun relevé du bois par tick** : les flux sont des sommes de partie.
- **Pas de test humain** : la lisibilité de « l'atelier refuse un bras » n'est
  pas évaluée (question 10 du dossier).
- **Le commerce n'est pas isolé** : l'écart de trésorerie mêle entretien,
  commerces de connexion et mise au repos, sans décomposition tick par tick.
- **La réserve hydrique lit l'ordre de référence**, pas la variante :
  `ordinaryWellStaffing` (le contre-factuel du loquet) appelle `staffingOrder`
  sans la condition. En bande grave l'armement et le relâchement peuvent donc
  différer légèrement de ce que la politique ferait ; aucun scénario n'a montré
  d'écart de population, mais ce n'est pas instrumenté.
- Les durées de la suite complète ont été mesurées pendant qu'un processus
  externe occupait 3 cœurs : elles ne sont pas un indicateur de performance ici.

## 9. Recommandation : **REVISE** (mécanisme validé, adoption non demandée)

La cible est la bonne : c'est bien l'allocation du dernier bras qui bloquait, et
la règle le corrige sans dégrader la survie. Mais elle n'est pas adoptable en
l'état, pour quatre raisons mesurées ou dérivées :

1. **Elle refuse un bras sans le dire.** Le critère E du dossier exige que le
   joueur comprenne ; il faut un motif affiché (« sans bois ») à côté du motif
   « sans ouvrier » qui existe déjà.
2. **Elle plafonne l'industrie à la chaîne du bois** (1 planche/tick) : c'est
   physiquement juste, mais il faut décider si c'est le rythme voulu, ou si les
   camps doivent pouvoir se multiplier (ce que le harnais interdit aujourd'hui).
3. **Elle ne traite pas l'expansion** : camp inexistant avant la fin. Sujet
   distinct (construction / accessibilité), à ne pas mélanger avec
   l'allocation.
4. **Elle change la trajectoire économique** (trésorerie en baisse, +2
   entrepôts) : à calibrer avec D4, pas avant.

## 10. Décision exacte demandée au propriétaire

Une seule question, trois réponses possibles :

**(a) Règle de jeu** — « un atelier ne prend un bras que si le bois disponible
couvre son lot » devient une loi, avec le motif affiché dans l'inspecteur.
→ alors : écrire la fiche de décision, l'interface, les tests unitaires de la
règle, et rejouer les six scénarios comme porte de sortie.

**(b) Action de joueur** — la loi d'allocation ne change pas ; c'est la mise au
repos des ateliers non alimentés (manuelle aujourd'hui, éventuellement
automatique) qui rend le bras au bûcheron.
→ alors : mesurer la variante « repos automatique » avant tout code livré.

**(c) Rejeter** — et traiter d'abord les camps de l'expansion, puis revenir.

Dans les trois cas : **D6 ne bouge pas**, la priorité ferme → puits → reste ne
bouge pas, et rien n'est commité.
