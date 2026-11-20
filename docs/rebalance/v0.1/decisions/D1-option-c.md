# D1 — Sort de l'option C : une technologie qui améliore le puits

Statut : **TRANCHÉE le 19 novembre 2026** — la technologie reste hors du
catalogue livré jusqu'à D2 et D4 (décision du propriétaire du design, appliquée
le même jour : voir §9).
Date : 18 novembre 2026 (dossier), 19 novembre 2026 (décision).
Voir : `../GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8 (mesures de l'option C), `D2-well-build-policy.md` (le levier qui convertit la réserve en travail), `D4-money-sinks.md` (le surplus qu'elle laisse).
Objet : décider si le levier « +1 eau par puits » reste dans le jeu, et sous
quelle forme.

## 1. Ce qui est dans le dépôt aujourd'hui (vérifié)

| Élément | Valeur actuelle | Fichier |
|---|---|---|
| Technologie | `wellShafts` / « Well Shafts », `cost: 50`, `age: 1`, `effect: "wellWater"` | `src/content/techs.ts` |
| Loi de production | `waterPerWell = 2 + techLevel("wellWater") − (sécheresse ? 1 : 0)` | `src/domain/production/production.ts` |
| Catalogue | 9 définitions, **8 livrées** : `wellShafts` porte `shipped: false` depuis le 19/11 (§9) | `src/content/techs.ts` |
| Politique du harnais | techno **retirée** de `TECH_ORDER` le 19/11 (la ligne de référence redevient le témoin) | `tests/selfplay.governor.ts` |
| État Git | **non commité** (HEAD `f654b25`), 6 fichiers modifiés | — |

Conséquences factuelles de cet état (mesuré le 18/11, avant la décision) :

- la technologie était alors **visible et achetable** dans le panneau de
  progression : c'est exactement ce que la décision du 19/11 a retiré (§9) ;
- aucune valeur existante ne change sans achat — un puits reste à 2/tick, et la
  sécheresse reste un retrait **plat** (3 → 2), ce qui préserve la règle actée ;
- deux gardes du harnais ont été re-mesurées et ré-épinglées (Step085 : ateliers
  981 ticks, parcs 409, repos des puits 8 ; Step087 : trésorerie finale 5 968 au
  lieu de moins de 100). Elles ne sont ni supprimées ni affaiblies.

## 2. Défaut de cohérence trouvé (vérifié, non corrigé)

`waterWorkerReserve` (`src/domain/jobs/jobs.ts`) renvoie `ceil(population / 2)`
avec pour justification « deux eau par puits servent deux colons ». La loi de
production, elle, lit `waterPerWell` : les deux voisines du même fichier ne
s'appuient plus sur la même hypothèse (`ordinaryWaterCapacity` utilise bien
`waterPerWell`, `waterWorkerReserve` non).

Effet : en bande grave, une colonie équipée réserve **plus de puits que
nécessaire** — à pop 12, 6 puits réservés là où 4 suffisent à 3 eau/tick. La
réserve reste bornée et sûre ; elle est simplement mal dimensionnée dès que la
technologie existe.

**Corrigé le 18 novembre 2026** (décision explicite du propriétaire, avant tout
arbitrage de balance) : `waterWorkerReserve` vaut maintenant
`ceil(population / max(1, waterPerWell(state)))`, avec un test qui verrouille les
trois cas (12 colons ⇒ 6 sans technologie, 4 avec, 6 sous sécheresse). C'était une
correction de cohérence, pas de balance : hors technologie les deux formules
coïncident, donc aucune mesure du dossier n'est invalidée (192 tests verts, dont
les gardes Step085/Step087 inchangées).

## 3. Mesures disponibles

Protocole : `playGame(-1, false, 240, 86)` — ligne de croissance, plafond de
logement 240, croissance plafonnée à 86, 1 500 ticks, seed `selfplay` sauf
mention. La seule variable est la présence de `wellShafts` dans l'ordre d'achat
du gouverneur (retirée à l'exécution pour le témoin) : même code, même seed,
même politique.

### 3.1 À l'échelle de la question (premier tick à pop 12 puis 13)

| Mesure | Témoin | Avec C |
|---|---:|---:|
| pop 12 atteinte à | t=328 | **t=320** |
| puits construits / staffés / nécessaires | 7 / 6 / **6** | 7 / 6 / **4** |
| eau en stock (production) | 28 (12/t) | 34 (**18/t**) |
| fermes staffées | 3 / 5 | 5 / 5 |
| ateliers staffés | **3 / 4** | **1 / 4** |
| travailleurs libres | **0** | **0** |
| trésorerie | 89 | 175 |

À pop 13 : puits 7/7/7 contre 7/7/5, eau 30 (14/t) contre 49 (21/t), ateliers
staffés 2/4 contre 1/4, travailleurs libres 0 dans les deux cas.

Lecture : la réserve hydrique supplémentaire **existe** (6 eau/t de surplus dès
pop 12, 7 à pop 13, puis un réservoir qui plafonne à 240) mais elle ne devient
**jamais** un travailleur, parce que (a) la loi de staffing sert tous les puits
construits avant le reste et (b) le plan continue de bâtir `ceil(N/2)+1` puits.
L'écart des ateliers staffés à pop 12 (3 → 1) est mesuré mais **inexpliqué** :
c'est un instantané unique, sur un tour où la trésorerie diffère (175 contre 89)
donc où l'ordre de construction diverge. Ne rien en conclure sans trace
instrumentée tick par tick.

### 3.2 En fin de ligne (t = 1 500)

| Mesure | Témoin | Avec C |
|---|---:|---:|
| population (86 atteinte à) | 86 (t=1 497) | 86 (**t≈887**) |
| puits staffés / nécessaires | 43 / 43 | 33 / 29 |
| eau en stock | 1 | 240 (plafond) |
| nourriture | 32 | 235 |
| planches | 1 | 14 |
| ateliers staffés | 0 / 4 | **4 / 4** |
| pollution | 37 | 57 |
| technologies | 4 | 7 |
| trésorerie | 57 | **7 968** |
| `canAdvanceAge` (âge 2 → 3) | non | **oui** |

Réconciliation des deux chiffres de trésorerie qui circulent dans le dossier :
cette ligne reste en **âge 2** et n'achète donc que 7 technologies ; les deux
technologies d'âge 3 (800 + 1 200 = 2 000 pièces) ne sont pas achetées.
7 968 − 2 000 = **5 968**, exactement le chiffre épinglé par la garde Step087,
qui joue une ligne atteignant l'âge 3 et achète les neuf. Les deux mesures disent
la même chose : le surplus est identique, à l'achat des deux dernières
technologies près.

### 3.3 Robustesse aux seeds

5 seeds testées (`selfplay`, `measure-2`, `d2-a`, `d2-b`, `d2-c`) : **tous les
indicateurs sont identiques** sauf la trésorerie finale (7 968 ; 8 652 sur
`measure-2`). La trajectoire du gouverneur est donc insensible au terrain sur ces
seeds. Trois seeds supplémentaires (`alpha`, `beta`, `gamma`) n'ont pas pu être
jouées : `createInitialState` lève « world has no room for D2 roads ». **Donnée
manquante** : la robustesse hors des seeds compatibles avec la colonie de départ
n'est pas mesurable avec ce harnais.

## 4. Options

### A — Garder C telle quelle (50 pièces, âge 1, +1/puits)

- Survie : inchangée sans achat ; meilleure une fois la techno payée.
- Croissance : 86 colons à t≈887 au lieu de t=1 497 (mesuré).
- Travailleurs disponibles : aucun gain (mesuré : 0 libre aux deux échelles).
- Industrie avant 13 colons : **non résolue** (1/4 ateliers staffés à pop 12).
- Stocks : eau plafonnée à 240 dès la mi-partie, nourriture 235, planches 14.
- Progression : l'accès à l'âge 3 devient satisfaisable (60 nourriture + 5 techs).
- Monnaie : 7 968 pièces sans emploi — le symptôme s'aggrave.
- Complexité : faible (une techno, une ligne de loi) ; risque d'équilibrage : le
  puits devient un achat quasi obligatoire avant toute croissance.
- Aucune valeur existante ne change : c'est son principal mérite.

### B — Garder C et changer la politique de construction des puits

Même techno, plus un plan qui dimensionne les puits sur le besoin
(`ceil(pop / yield)`, voir D2). C'est la seule variante qui **convertit** la
réserve en travail, donc la seule qui pourrait répondre à la question d'origine.

- Effet attendu à pop 12 (dérivé, non mesuré) : 4 puits staffés au lieu de 6 →
  2 postes rendus → ateliers staffés 3/4 au lieu de 1/4.
- Risque : sous sécheresse (3 → 2/tick) la marge disparaît ; la réserve grave et
  le plafond de stock doivent absorber le choc. **Non mesuré** à ce jour.
- Coût : la politique vit dans le harnais (gouverneur) aujourd'hui ; la porter
  dans le jeu suppose une notion de « plan de construction », qui n'existe pas.
  Complexité réelle : ce n'est pas une ligne de code, c'est un système.

### C — Garder C et convertir autrement la réserve hydrique en capacité productive

Variantes possibles, toutes des **hypothèses** : un puits peut-il être mis au
repos automatiquement au-delà du besoin (libérer le poste) ? la réserve grave
peut-elle rendre un poste plutôt que d'en figer six ? faut-il une second œuvre
qui consomme l'eau excédentaire (brasserie, atelier hydraulique) ?

- Avantage : traite la cause (l'eau n'a pas de second usage) au lieu du symptôme.
- Risque : invente un système dont aucun document du dossier n'a mesuré le coût ;
  peut transformer un excédent en obligation (l'usine à eau qu'on doit nourrir).
- Donnée manquante : aucun consommateur d'eau n'existe aujourd'hui ; en créer un
  est une décision de contenu, pas d'équilibrage.

### D — Retirer C

- Retour exact au comportement mesuré du témoin (2/tick, croissance à t=1 497,
  âge 3 hors d'atteinte).
- Coût : annule 6 fichiers non commités ; les deux gardes re-mesurées reviennent
  à leurs valeurs d'origine (347/345/353 et moins de 100 pièces).
- Honnêteté : c'est la seule option qui ne laisse aucune valeur nouvelle dans le
  jeu livré.

## 5. Hypothèses à tester, pas décisions

| Hypothèse | Pourquoi elle est suspecte |
|---|---|
| Prix 50 pièces | copié sur `cropRotation` par symétrie, sans mesure : 50 est ~1 tour de taxe à pop 12, donc quasi gratuit au moment où il compte |
| Déblocage à l'âge 1 | plausible (c'est là que le problème se pose) mais jamais comparé à un déblocage à l'âge 2, où le goulot est ailleurs |
| Effet +1 fixe | un seul palier ; deux paliers (+1 puis +1) changeraient la courbe sans changer la loi |
| Techno plutôt que puits plus fort | décision de forme déjà prise (aucune valeur existante ne bouge) et cohérente avec le catalogue |

## 6. Ce qui manque pour trancher

1. **Le sort de la trésorerie** (D4) : 7 968 pièces restantes est le symptôme le
   plus net ; adopter C sans débouché revient à imprimer de la monnaie.
2. **La mesure de la variante B** : impossible sans modifier la politique du
   harnais — donc sans décision explicite, puisque c'est du code.
3. **Le coût de la techno rapporté au revenu réel** : personne n'a mesuré le
   revenu cumulé entre t=320 et t=887 ; 50 pièces n'a de sens que là.
4. **La crise hydrique sous C** : non mesurée. La réserve à `ceil(N/2)` et le
   plafond de 240 rendent la sécheresse probablement indolore ; « probablement »
   n'est pas une mesure.
5. **Un joueur humain** : tout ceci est une politique scriptée unique.

## 7. Recommandation argumentée

**Ne pas adopter C en l'état, et ne pas la retirer encore : la garder comme
prototype documenté, mais la sortir du catalogue livré tant que D2 et D4 ne sont
pas tranchées.**

Raisons :

- C **améliore deux choses** (croissance, franchissement de l'âge 3) et **n'en
  résout aucune** de celles qui ont motivé l'étude : l'industrie reste
  inaccessible avant 13 colons, et la trésorerie finale triple.
- La valeur ajoutée mesurée vient du **stock d'eau**, pas du **travail** : le jeu
  n'a aucune loi qui transforme un stock en poste, donc C ne peut pas répondre
  seule à la question posée. D2 est le vrai levier ; C n'en est que la condition.
- Laisser la techno achetable sans trancher revient à livrer une valeur de
  balance non décidée — exactement ce que le dossier interdit.

Si le propriétaire veut avancer vite : adopter **A + le correctif de réserve du
§2** (cohérence, sans effet de balance visible), et traiter D2 comme la décision
suivante. Si le coût de la trésorerie est jugé rédhibitoire : **D**, et l'on
revient au témoin mesuré.

## 8. Ce qui ferait changer cette recommandation

- Une mesure de B à pop 10–13 montrant 3/4 ateliers staffés **sans** famine ni
  perte de population : C deviendrait la bonne première marche.
- Un débouché monétaire crédible absorbant plusieurs milliers de pièces : le
  principal argument contre A tomberait.
- Une mesure de crise hydrique sous C montrant que la réserve à `ceil(N/2)`
  protège effectivement la colonie : la techno deviendrait un achat défensif
  légitime au lieu d'un accélérateur.

## 9. Décision appliquée — 19 novembre 2026

**Décision : C ne sort pas du dépôt, elle sort du catalogue livré.** Le levier
reste défini et mesurable, mais le joueur ne peut ni le voir ni l'acheter tant que
D2 (politique de construction des puits) et D4 (débouchés monétaires) ne sont pas
tranchées.

Ce que cela change dans le dépôt (vérifié) :

| Élément | Avant | Après |
|---|---|---|
| `techs.ts` | `wellShafts` dans le catalogue | même définition + `shipped: false` |
| `applyResearchTech` | achetable | refus `techNotAvailable` (contrôlé dans la commande, pas seulement dans l'UI) |
| `boot.ts` | listé au panneau | filtré hors de `availableTechs` |
| `waterPerWell` | 2 + niveaux | **inchangé** : un chargement qui porte déjà la techno produit toujours 3/tick |
| Harnais | techno en 2ᵉ position | retirée de `TECH_ORDER` |
| Gardes Step085 / Step087 | ré-épinglées sur C | **revenues au témoin** (347/1/323 et < 100 pièces) |

Ce que la décision ne fait pas :

- elle ne tranche **aucune** valeur de balance : ni le prix (50), ni le gain
  (+1/puits), ni le rendement de base (2). Le puits reste à 2/tick, la sécheresse
  reste un retrait plat, la réserve grave continue de lire `waterPerWell` (§2) ;
- elle ne préjuge pas D2 : la ligne de référence redevient le témoin, donc le
  plafond industriel mesuré reste celui du jeu livré ;
- elle n'invalide aucune mesure : toutes les mesures de §3 et de
  `../GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8 ont été faites avec la techno
  achetée, et restent reproductibles en la réactivant (`shipped: true` + une
  entrée dans `TECH_ORDER`).

Conditions de réouverture (les mêmes que §8, resserrées) :

1. **D2 tranchée** — mesurée le 19/11 : sans C, la variante `ceil(N/rendement)+1`
   coûte sans rendre (D2 §5), donc la doctrine livrée reste `ceil(N/2)+1`. Si la
   doctrine de construction cesse de viser ce chiffre, la question « C
   libère-t-elle un poste ? » redevient mesurable sur la ligne de référence ;
2. **D4 tranchée** — la trésorerie de 5 968 pièces n'est plus un défaut à côté
   d'une dépense récurrente, elle en devient l'entrée ;
3. dans les deux cas, une **mesure de sortie** sur le tick réel avec la techno
   réactivée, pas une extrapolation des chiffres ci-dessus.

Coût assumé de la décision : le jeu livré garde un plafond industriel avant
13 colons et un âge 3 non franchissable en self-play — c'est un état **connu et
documenté**, préféré à une valeur de balance livrée sans arbitrage.
