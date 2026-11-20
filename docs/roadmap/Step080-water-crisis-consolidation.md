# Step080 — Consolidation du modèle de crise hydrique

**Statut :** conception seulement. Aucun fichier de code modifié dans cette étape.
**Base :** HEAD `d348d6c`, working tree portant l'implémentation Step079 (non commitée, préservée intacte).
**Ne change pas ici :** la loi hydrique (accumulation, maintien, récupération), les rendements, la consommation, la compensation économique à 75, le plancher de population.

---

## 1. État de référence — faits vérifiés

Lus dans le code de Step079, et mesurés au cockpit lors de cette étape.

### 1.1 Cadence actuelle (fait)

`src/domain/population/population.ts`, `waterDepartureDue` :

```
pression >= 100  ET  tick % 10 === 0  ET  population > 2
```

Aucun état dédié : la cadence est lue sur l'horloge globale. Mesure Step079 (cockpit, `init` D2) :

| tick | pression | population | événement |
|---:|---:|---:|---|
| 35 | 100 | 10 | crise critique installée, « departs in 5 » |
| 39 | 97 | 10 | rétablissement (puits réactivés), compteur implicite perdu |
| 40 | 96 | 10 | multiple de 10 franchi sans départ ✔ |
| 48 | 100 | 10 | nouvelle crise, « departs in 2 » |
| 49 | 100 | 10 | pas de départ (pas multiple de 10) |
| 50 | 100 | 9 | **départ après 2 ticks de crise seulement** |

Le comportement est déterministe mais ne représente pas « dix ticks consécutifs de crise » : la crise de t48 n'a que deux ticks d'ancienneté au moment du départ.

### 1.2 Attribution des travailleurs (fait, `src/domain/jobs/jobs.ts`)

- `assignJobs` recalcule tout à chaque tick : remise à zéro de `staffed`, puis parcours glouton trié.
- Tri : `staffPriority` → **ferme 0, puits 1, tout le reste 2**, puis ordre canonique `y/x/id`.
- Éligibilité : bâtiment actif (opérationnel **et** non désactivé), `jobCapacity > 0`, **adjacent à une route**.
- `jobCapacity = 1` pour ferme et puits (`src/content/buildings.ts`), coût 25 argent, 2 ticks de chantier.
- Production : 2 eau/tick par puits actif **et staffé** ; 2 nourriture par ferme staffée ; le Centre de colonie donne 1 nourriture/tick non staffée.
- Contrat de timing : `assignJobs` est la dernière phase du tick, la production lit le staffing du tick précédent.

### 1.3 Le cas mesuré de la spirale (fait)

Scénario cockpit Step079, pop 8, **7 fermes**, **3 puits** :

| population | fermes staffées | puits staffés | eau produite | couverture |
|---:|---:|---:|---:|---:|
| 8 | 7 | 1 | 2 | 25 % |
| 6 | 6 | 0 | 0 | 0 % |

Chaque départ libère un travailleur… que la ferme suivante capte avant les puits. La population fond jusqu'au plancher 2, et l'eau ne revient pas : c'est exactement le blocage décrit dans la demande.

### 1.4 La marge de la colonie D2 (fait, calculé)

Ouverture D2 : pop 10, 5 fermes, 5 puits → **10 postes pour 10 colons, marge nulle**. Toute ferme ou tout atelier ajouté prend un travailleur, et le prend aux puits puisque les fermes passent avant. Mesuré au cockpit de Step079 : deux fermes construites en plus ont fait tomber la couverture de 100 % à 60 % puis 25 % à mesure que la population baissait.

### 1.5 Minimum viable (calculé sur les lois existantes)

Un colon boit 1/tick, un puits donne 2/tick → **puits requis = ⌈pop / 2⌉**.
Un colon mange 1/tick, une ferme donne 2/tick, le Centre donne 1/tick → **fermes requises = ⌈(pop − 1) / 2⌉**.

| pop | puits requis | fermes requises | travailleurs | eau | nourriture |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 0 | 1 | 2 | 1 |
| 2 | 1 | 1 | 2 | 2 | 3 |
| 3 | 2 | 1 | 3 | 4 | 3 |
| 4 | 2 | 2 | 4 | 4 | 5 |
| 5 | 3 | 2 | 5 | 6 | 5 |
| 6 | 3 | 3 | 6 | 6 | 7 |
| 8 | 4 | 4 | 8 | 8 | 9 |
| 10 | 5 | 5 | 10 | 10 | 11 |
| 12 | 6 | 6 | 12 | 12 | 13 |
| 16 | 8 | 8 | 16 | 16 | 17 |
| 24 | 12 | 12 | 24 | 24 | 25 |

Propriété remarquable : `⌈pop/2⌉ + ⌈(pop−1)/2⌉ = pop` pour tout entier. **Toute population est auto-suffisante si les puits et les fermes requis sont staffés, et il ne reste jamais un travailleur libre.** La colonie D2 est donc pile à l'équilibre, sans aucun mou.

---

## 2. Problème A — la cadence des départs

### 2.1 Les deux modèles

**Modèle A (actuel)** — un départ à chaque multiple de dix ticks globaux si la pression vaut 100.
Aucun état, aucune migration, mais la cadence dépend de l'heure à laquelle la crise commence, et une crise interrompue reprend avec un départ quasi immédiat (mesuré : 2 ticks).

**Modèle B (proposé)** — un départ après **dix ticks consécutifs** à pression 100.
Le temps de crise est une propriété de la crise, pas du calendrier. Coût : un entier persistant et une migration v21.

### 2.2 Comparaison

| Critère | Modèle A | Modèle B |
|---|---|---|
| Fidélité à la règle gameplay | faible (mesuré : départ à +2 ticks) | exacte |
| État persistant | aucun | 1 entier (0–10) |
| Migration | aucune | v20 → v21, défaut 0 |
| Comportement au rechargement | dépend de `tick` | dépend du compteur, donc de la crise réelle |
| Crise intermittent | repart sur l'horloge globale | repart de zéro, 10 ticks pleins |
| Déterminisme | total | total (même compteur ⇒ même suite) |

Le seul avantage de A est l'absence de migration — un critère d'implémentation, pas de gameplay. **Modèle B retenu.**

### 2.3 Cycle de vie du compteur

Champ : `waterCrisisTicks: number`, entier 0–10, dans `GameState`.

- **Initialisation** : 0 (`createInitialState`).
- **Incrément** : une fois par tick, dans une seule fonction appelée à un seul endroit du tick, après la mise à jour de la jauge : si `waterPressure >= 100` alors `+1`, sinon **remise à zéro immédiate**.
- **Départ** : quand `waterCrisisTicks >= 10` **et** `population > 2` → un colon part, compteur remis à 0. Une seule exécution par tick (l'appel unique garantit l'absence de double départ).
- **Plancher** : si `population <= 2`, le compteur est **gelé à 10** et aucun départ n'a lieu. Il ne peut pas « mûrir » ailleurs : la population ne peut croître qu'à couverture 100 %, où le compteur est déjà remis à zéro.
- **Récupération** : dès que la pression repasse sous 100, compteur = 0. Aucun départ programmé, aucune perte différée.

Le compteur n'est **pas** encodé dans `waterPressure` : la jauge garde sa loi (accumulation, maintien, décroissance) et le compteur ne fait que compter les ticks où elle est déjà au maximum.

### 2.4 Persistance et migration

- `SAVE_VERSION` 20 → **21** ; `MIGRATABLE_SAVE_VERSION` reste 13.
- `serialize` écrit `waterCrisisTicks` ; la validation le lit comme entier 0–`WATER_DEPARTURE_INTERVAL_TICKS`, rejette négatif, flottant et > 10.
- `migrateV20ToV21` : `waterCrisisTicks: 0`.
  Valeur préservante au sens strict : une sauvegarde Step079 n'a jamais compté de ticks de crise, l'inventer avancerait un départ. Effet assumé : une sauvegarde prise en pleine crise repart pour 10 ticks.
- Sauvegarde au milieu d'une cadence : compteur 7 → rechargement → 3 ticks critiques → départ. Aucun décalage, aucune perte du compteur.

---

## 3. Problème B — la spirale du staffing

### 3.1 Ce que le code fait, et pourquoi

La priorité « fermes d'abord » est documentée et défendue (Step070) : l'ordre de placement décidait qui obtenait les ouvriers, et une ferme inoccupée à côté d'un puits affamait la colonie. Ce raisonnement reste valable **en régime normal**. Il devient faux **en crise** : la ressource qui manque est l'eau, et l'ordre canonique protège celle qui ne manque pas.

### 3.2 Les quatre options

**Option 1 — Ne rien changer.** Le joueur peut désactiver (gratuitement) des fermes pour libérer des travailleurs, et réactiver un puits.
*Cohérence* moyenne, *complexité* nulle, *déterminisme* total, *coût* nul, *spirale* **élevée** (mesurée : pop 8 → 2), *alimentaire* intact, *lisibilité* faible (rien n'explique pourquoi les puits sont vides), *récupération* possible mais non guidée.
Verdict : laisse le piège en place. Le joueur doit deviner une règle interne pour survivre.

**Option 2 — Priorité hydrique temporaire (puits d'abord, sans plafond) dès pression ≥ 75.**
*Cohérence* bonne, *complexité* faible, *déterminisme* total, *coût* faible, *spirale* corrigée, *alimentaire* **dégradé** (à pop 5, cinq puits prendraient tous les ouvriers et affameraient la colonie), *lisibilité* bonne, *récupération* bonne.
Verdict : corrige la soif en créant la faim, et gaspille de l'eau au-delà du besoin.

**Option 3 — Réserve de travailleurs pour l'eau, bornée par le besoin.**
Pression ≥ 75 : réserver aux puits actifs **⌈pop / 2⌉** travailleurs au maximum — le nombre exact qui sert toute la colonie — puis laisser l'ordre normal (fermes, puits restants, autres).
*Cohérence* très bonne (on ne staffe jamais plus de puits que nécessaire), *complexité* faible (une passe de réservation avant la boucle existante), *déterminisme* total, *coût* faible, *spirale* corrigée, *alimentaire* préservé (la réserve laisse toujours `pop − ⌈pop/2⌉` = `⌈(pop−1)/2⌉` travailleurs, soit exactement les fermes requises du §1.5), *lisibilité* à construire (alerte), *récupération* démontrée (§4).
Verdict : la seule option qui satisfasse eau **et** nourriture à toute population.

**Option 4 — Réactivation manuelle et arbitrage explicite.**
Conserver les priorités, rendre visible ce que produit chaque puits et pourquoi il est vide ; laisser le joueur arbitrer.
*Cohérence* bonne (le joueur garde la main), *complexité* nulle, *déterminisme* total, *coût* nul, *spirale* **non corrigée**, *alimentaire* intact, *lisibilité* bonne, *récupération* dépend entièrement du joueur.
Verdict : nécessaire mais insuffisant — la lisibilité seule ne sort pas une colonie de 2 habitants d'un blocage, et elle laisse le piège se refermer avant que le joueur comprenne.

### 3.3 Décision

**Option 3, avec la visibilité de l'option 4.** Règle exacte :

```
si waterPressure >= 75 :
    réservés = min( nb de puits actifs éligibles, ⌈population / 2⌉ )
    staffer ces puits (ordre canonique) avant tout le reste
    then la boucle actuelle (fermes → puits → autres) avec les travailleurs restants
sinon :
    ordre actuel inchangé (fermes → puits → autres)
```

- Le seuil est celui de la compensation économique (75) : une seule notion de « crise grave » dans tout le système.
- Seuls les puits **actifs, opérationnels et reliés** comptent : un puits désactivé ne réserve rien, donc **désactiver un puits rend un travailleur aux fermes** — le joueur garde un arbitrage réel eau/nourriture.
- En dessous de 75, rien ne change : l'économie normale garde sa priorité fermière, et un déficit léger (75–99 %) reste une décision du joueur, pas une réaffectation automatique.
- Aucun état, aucune migration : `assignJobs` lit `state.waterPressure`, déjà mis à jour avant cette phase.

### 3.4 Effet attendu sur le cas mesuré (calcul, non simulé)

pop 8, 7 fermes, 3 puits, pression 100 :

| population | puits requis | puits actifs | staffés | eau | fermes staffées | nourriture | couverture |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 8 | 4 | 3 | 3 | 6 | 5 | 10 | 75 % (léger) |
| 7 | 4 | 3 | 3 | 6 | 4 | 9 | 86 % (léger) |
| 6 | 3 | 3 | 3 | 6 | 3 | 7 | 100 % → récupération |

Deux départs, puis la pression redescend de 1/tick. Sans changement : la population tombait à 2 avec 0 % de couverture.

---

## 4. Une récupération réellement possible

### 4.1 Condition de sortie

Une colonie sort de la crise par l'eau, pas par la mort :

1. **Couverture 100 %** — puits actifs éligibles ≥ `⌈pop/2⌉` (ou stock suffisant pour le tick) ;
2. alors la jauge décroît de 1/tick, les départs cessent dès le premier tick sous 100, et la facture cesse dès que plus personne n'est non servi ;
3. la nourriture doit tenir : fermes staffées ≥ `⌈(pop−1)/2⌉`, ce qui est garanti par la réserve (§1.5 : `⌈pop/2⌉ + ⌈(pop−1)/2⌉ = pop`).

### 4.2 Ce que la règle ne fait pas

- Elle ne produit pas d'eau : sans puits actif, rien ne change, la crise continue jusqu'au plancher. La récupération exige un **levier du joueur** : réactiver un puits (gratuit), en construire un (25 argent), ou désactiver un puits inutile pour nourrir les fermes.
- Elle ne raccourcit pas la décroissance : 100 ticks (50 s à 1×) pour revenir de 100 à 0.
- Elle ne sort pas la colonie du plancher : à 2 habitants, il faut 1 puits et 1 ferme staffés pour repartir.

### 4.3 Leviers conservés

| Levier | Coût | Effet |
|---|---|---|
| Réactiver un puits | gratuit | +2 eau/tick dès qu'il est staffé (1 tick de décalage de staffing) |
| Construire un puits | 25 argent, 2 ticks | capacité hydrique durable |
| Désactiver un puits excédentaire | gratuit | rend un travailleur aux fermes |
| Désactiver une ferme | gratuit | rend un travailleur aux puits (arbitrage inverse) |
| Trésorerie | — | la facture s'arrête à 0 tant que personne n'est servi |

---

## 5. Scénarios chiffrés

Tous **calculés** sur les lois existantes ; aucun n'a été simulé dans cette étape (aucun code modifié). Les valeurs marquées *(mesuré Step079)* viennent du cockpit de l'étape précédente.

### A. Crise interrompue puis reprise — modèle A vs B

Séquence mesurée : critique à t35, rétablissement t39, nouvelle critique t48.
- **A** : départ à t50, soit **2 ticks** de crise réelle.
- **B** : compteur 4 à t39 (35→39), remis à 0 ; nouvelle crise t48 → compteur 1 à t48, départ à **t58**, soit 10 ticks pleins. Aucun départ entre t48 et t57.

### B. Blackout continu — les deux modèles coïncident

Crise dès t1, pression 100 à t25 : A et B donnent tous deux un premier départ à t35 (25+10), puis t45, t55… La divergence n'apparaît que sur les crises interrompues, ce qui est précisément le défaut corrigé.

### C. Spirale mesurée, avec la réserve

Voir §3.4 : pop 8 → 7 → 6, deux départs, couverture 100 % à pop 6, puis 100 ticks de décroissance. Sans la réserve *(mesuré Step079)* : 0 % de couverture, population jusqu'à 2.

### D. Colonie D2 à marge nulle

Pop 10, 5 fermes, 5 puits : la réserve demande ⌈10/2⌉ = 5 puits, soit tous → **aucun changement** en régime normal comme en crise. Construire une 6ᵉ ferme sans puits ni logement fait tomber la couverture à 8/10 = 80 % (léger) : la jauge se fige, la facture n'apparaît qu'à 75, la croissance reste bloquée. C'est le comportement attendu : la colonie D2 n'a aucune marge, et la réserve ne peut pas en inventer.

### E. Pénurie sans puits — la réserve ne sauve pas

Pop 10, tous les puits désactivés, pression 100 : réserve = 0 puits éligibles, couverture 0 %, départs tous les 10 ticks jusqu'à 2. Seule une réactivation ou une construction sort la colonie. C'est le garde-fou contre un sauvetage automatique.

### F. Sauvegarde au milieu d'une cadence

Compteur 7, sauvegarde, rechargement, 3 ticks à 100 → départ exactement au 3ᵉ tick. Deux rechargements successifs ne peuvent ni avancer ni retarder le départ.

---

## 6. Risques et cas limites

1. **Changement de comportement des sauvegardes Step079** : la migration remet le compteur à 0, donc une crise en cours repart pour 10 ticks. Effet retardateur uniquement, jamais accélérateur.
2. **Sécheresse (événement)** : un puits ne donne plus que 1 eau/tick ; `⌈pop/2⌉` puits ne suffisent alors plus (il en faudrait `pop`). La réserve staffe ce qu'elle peut, la crise continue : cohérent, mais à ne pas confondre avec un bug.
3. **Technologies agricoles** (`cropRotation`, `irrigation`) : une ferme peut produire 3–4 nourriture, donc les fermes requises baissent et la réserve laisse plus de marge. La formule de réserve ne change pas (elle ne dépend que de la population).
4. **Saison maigre** : des fermes sont mises au repos ; la nourriture produite baisse sans que la réserve hydrique change. Un blocage faim+soif reste possible — deux ressources, deux crises, volontairement non fusionnées.
5. **Colonies à puits excédentaires** : au-dessus de 75, les puits au-delà de `⌈pop/2⌉` restent non staffés (l'ordre normal les reprend après les fermes, mais avec `⌈pop/2⌉ + ⌈(pop−1)/2⌉ = pop` il n'y a plus de travailleur libre). Aucune eau gaspillée, mais le joueur peut voir des puits vides : l'alerte doit le dire.
6. **Plancher 2** : la colonie peut rester indéfiniment à 2 en crise si le joueur n'agit pas. C'est le comportement voulu (pas de défaite subie), mais l'alerte doit nommer le plancher et le levier.
7. **Événement `tradeClosure`/`drought`** : `drought` réduit l'eau, ce qui rend la récupération plus lente sans la bloquer.
8. **Tests Step079 à réécrire** : les cas de cadence s'appuient sur `tick % 10`. Ils doivent être réécrits sur le compteur ; ce n'est pas un contournement, c'est le changement de règle.

---

## 7. Critères d'acceptation

1. Un départ n'a lieu qu'après **10 ticks consécutifs** à pression 100 ; une crise de 2 ticks après un rétablissement ne produit aucun départ.
2. Une interruption (pression < 100) remet le compteur à zéro, et aucun départ différé ne subsiste.
3. Le compteur est persistant, borné 0–10, validé au chargement, migré à 0 depuis la v20.
4. Une sauvegarde prise à compteur 7 produit un départ après 3 ticks de crise, ni avant ni après.
5. Aucun double départ sur un même tick.
6. À pression ≥ 75, les puits éligibles sont staffés en priorité **dans la limite de ⌈pop/2⌉** ; au-delà, l'ordre fermes → puits → autres est inchangé.
7. À pression < 75, l'ordre de staffing est strictement identique à aujourd'hui (aucune régression de la priorité fermière).
8. Le cas mesuré (pop 8, 7 fermes, 3 puits) atteint 100 % de couverture à population 6 sans intervention du joueur.
9. Sans puits actif, aucune récupération automatique : la crise va au plancher.
10. La loi hydrique, les rendements, la consommation, la facture à 75 et le plancher restent inchangés.

---

## 8. Fichiers concernés et plan

| Fichier | Changement prévu |
|---|---|
| `src/domain/simulation/state.ts` | `waterCrisisTicks: number`, init 0 |
| `src/application/persistence/save.ts` | version 21, sérialisation, validation 0–10, `migrateV20ToV21` |
| `src/domain/water/water.ts` | constante d'intervalle déjà là ; helper `waterCrisisStep(counter, pressure)` pur |
| `src/domain/population/population.ts` | `applyWaterDepartures` remplacé par une version pilotée par le compteur |
| `src/domain/simulation/tick.ts` | appel unique après la jauge, mise à jour du compteur et départ dans la même fonction |
| `src/domain/jobs/jobs.ts` | passe de réservation bornée, conditionnée à `waterPressure >= 75` |
| `src/application/queries/stats.ts` | `waterCrisisTicks`, `waterDepartureTicksAway = 10 − compteur` |
| `src/application/queries/analysis.ts` | alerte critique : ticks de crise consommés, puits non staffés, plancher |
| `tools/agent/play.ts` | afficher compteur et priorité hydrique |
| `tests/water-crisis.test.ts`, `tests/persistence.test.ts`, `tests/staffing.test.ts` | compteur, migration, cadence, réserve, non-régression à froid |

Plan : (1) compteur + migration + tests de persistance ; (2) cadence pilotée par le compteur + réécriture des tests de cadence ; (3) réserve de staffing + tests de non-régression à pression < 75 ; (4) stats et alertes ; (5) cockpit et scénarios ; (6) suite complète et build.

---

## Recommandation unique

**Modèle B (dix ticks consécutifs, compteur persistant, migration v21) et option 3 (réserve de ⌈pop/2⌉ travailleurs pour les puits actifs, activée à pression ≥ 75), avec la lisibilité de l'option 4.** Les deux corrections se complètent : le compteur rend la crise lisible dans le temps, la réserve rend la sortie possible sans jamais créer d'eau ni affamer la colonie.

## Décisions à verrouiller avant implémentation

1. **Compteur** : persistant (recommandé, fidèle à la règle) ou dérivé d'une autre horloge (moins cher, mais rejouer la crise à la reprise).
2. **Remise à zéro** : sur interruption seulement, ou aussi à chaque départ (recommandé : départ = 0, la cadence reste stricte).
3. **Compteur au plancher** : gelé à 10 (recommandé) ou maintenu à 0 tant que la population est à 2.
4. **Périmètre de la réserve** : ⌈pop/2⌉ (recommandé, exactement le besoin) ou marge d'un puits supplémentaire.
5. **Seuil de la réserve** : 75, partagé avec la facture (recommandé), ou activation dès que la couverture tombe sous 100 %.
6. **Puits désactivés** : exclus de la réserve (recommandé : le joueur garde l'arbitrage eau/nourriture) ou comptés comme éligibles.
