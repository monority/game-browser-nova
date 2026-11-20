# Step078 — D1 : conséquences d'une crise hydrique prolongée

**Statut :** fiche de conception, aucun code modifié.
**Base :** `d348d6c` (`feat(nova): add persistent water pressure system`), sauvegarde v20.
**Loi existante, non renégociée ici :** `src/domain/water/water.ts`.

---

## 1. État technique existant et faits vérifiés

Chaque affirmation ci-dessous a été lue dans le code de `d348d6c`.

### 1.1 Jauge hydrique (existant, figé)

- Accumulation seulement sous 75 % : `ΔH = max(1, round(4G))`, `G = (3C − 4S) / 3C`.
- Maintien entre 75 % et moins de 100 %, récupération de 1 point/tick à 100 %.
- Bornes 0–100, entier, persisté (`SAVE_VERSION = 20`, `migrateV19ToV20`).
- Bandes : `< 25` normal, `≥ 25` tension, `≥ 50` crise, `≥ 75` grave, `= 100` critique.
- Alerte dès 25 (`info` en tension, `warning` au-delà) ; `AlertSeverity = "info" | "warning"` : **il n'existe pas de niveau `critical` dans l'UI**. Toute conséquence « critique » devra donc se dire avec `warning`.

### 1.2 Population et admission (`src/domain/population/population.ts`)

- Une seule perte de population existe : `STARVATION_LOSS_PER_TICK = 1` quand `fedColonists < population` (famine, jamais soif).
- Admission : `+1`/tick si logement libre **et** `food > 0` **et** `servedWater >= population` **et** qualité de l'air suffisante. La porte hydrique est binaire : soit 100 %, soit bloquée.
- **Aucun système de moral, stabilité, satisfaction ou bonheur n'existe** (grep vide sur tout `src/`). Aucun état de défaite ni de victoire non plus.

### 1.3 Travail et bâtiments

- `jobCapacity = 1` pour ferme, puits, atelier, camp, carrière ; `assignJobs` remplit en priorité **fermes → puits → reste**, ordre canonique pour le surplus.
- Puits : 2 eau/tick **par puits actif et staffé**. Une perte de population désaffecte donc d'abord les ateliers, ensuite les puits, et les fermes en dernier.
- État d'un bâtiment : `status` (`underConstruction`/`operational`), `staffed`, `active`. **Aucune notion de rendement, d'usure ou de efficacité par bâtiment.**

### 1.4 Économie (`src/domain/economy/economy.ts`)

- Revenus : `1` argent/habitant/tick (taxes) + `2` par atelier relié à une route (à partir de 10 habitants) + `1` par planche produite.
- Dépenses : `1` par bâtiment opérationnel actif (maintenance), `floor((pop − 10) / 5)` (surpeuplement).
- L'argent est **clampé à 0** : `payMaintenance` et `payCrowding` ne créent jamais de dette.
- Dépenses discrétionnaires réelles : bâtiment 25 argent + 2 ticks de chantier ; route ; recherche. **Réactiver un bâtiment désactivé est gratuit.**
- La phase économique est la dernière du tick : `collectRevenue → payMaintenance → payCrowding`, juste avant `resolveEvents`.

### 1.5 Ressources et secours existants

- Ferme : 2 nourriture/tick staffée ; un colonien mange 1/tick ; le Centre de colonie fournit **1 nourriture/tick non staffée**, ce qui re-sème l'admission après une famine totale.
- Eau : 1 par colon servi, consommation limitée au stock, aucun dégât.

### 1.6 Précédent d'interface utile

`collectRevenue(state, planksProducedThisTick)` montre qu'une quantité calculée dans le tick est passée explicitement à la phase économique. Une conséquence économique hydrique pourra suivre exactement ce contrat, sans nouvel état persistant.

---

## 2. Problème gameplay à résoudre

Aujourd'hui, une crise hydrique totale ne coûte **rien** : elle bloque la croissance et affiche une alerte qui monte, mais le joueur peut la laisser durer indéfiniment sans perdre un colon, un bâtiment ou un argent. La jauge est décorative dès qu'on cesse d'espérer une croissance.

Ce qu'il faut : rendre la crise **coûteuse et lisible**, sans jamais transformer un oubli en partie perdue, et sans ajouter de système qui n'existe pas.

---

## 3. Comparaison des modèles étudiés

| Modèle | Lisibilité | Intérêt stratégique | Cohérence avec l'existant | Coût | Spirale | Récupération |
|---|---|---|---|---|---|---|
| 1. Pression sociale (moral/stabilité) | moyenne | forte | **nulle** : le concept n'existe pas | élevé (état + UI + sauvegarde) | possible | lente |
| 2. Pression démographique (départs) | forte | forte | bonne : même chemin que la famine | faible | **auto-limitée** par la baisse du besoin | immédiate dès 100 % |
| 3. Pression économique (coût d'urgence) | forte | moyenne | bonne : branche `money` existante | très faible | **impossible** (clamp à 0, borné par les taxes) | instantanée |
| 4. Pression productive (bâtiments) | faible | moyenne | **nulle** : aucun rendement par bâtiment | élevé | forte (moins d'eau → moins de rendement) | lente |
| 5. Hybride minimal : 3 puis 2 | forte | forte | bonne | faible | faible et bornée | immédiate + progressive |

Rejets motivés :

- **Modèle 1** exigerait d'inventer un système entier (valeur, affichage, sauvegarde, effets) pour un seul usage : contraire à « aucune nouvelle mécanique sans justification ».
- **Modèle 4** toucherait au rendement des puits — interdit ici — ou créerait une efficacité par bâtiment qui n'existe nulle part ; le risque de spirale (moins d'eau → moins de production → moins d'eau) est le plus élevé des cinq.
- **Modèle 2 seul** est trop lent à mordre : à +1/tick il faut 100 ticks pour atteindre 100, et un joueur peut perdre patience avant de voir une conséquence. **Modèle 3 seul** est ignorable par une colonie riche.

---

## 4. Modèle recommandé

**Hybride minimal : facture d'eau d'urgence à partir de 75, départs à 100.**

Deux conséquences, deux systèmes existants, deux seuils distincts :

1. **À partir de 75 (grave) — facture d'eau d'urgence.** Chaque colon non servi coûte 1 argent par tick. C'est le prix de l'eau achetée à l'extérieur. Lisible (le joueur voit un chiffre), proportionnel à la soif, instantanément annulé au retour à 100 %.
2. **À 100 (critique) — départs.** Un colon quitte la colonie tous les 10 ticks tant que la pression reste à 100, avec un plancher de 2 habitants. Annoncé par une alerte distincte.

Justification :

- Aucun nouveau système : l'argent et la population existent, avec leurs invariants.
- La pression accumule déjà la durée : pas de second compteur, pas de migration (v20 inchangée).
- Les deux conséquences sont **bornées par construction** : le coût ne peut pas dépasser les taxes (un colon non servi = au plus 1 argent/habitant), et les départs s'arrêtent quand le besoin baisse.
- La récupération ne demande aucune réparation : l'argent cesse de partir dès que la couverture revient, et les départs s'arrêtent une tick après.
- Le joueur conserve ses leviers : réactiver un puits (gratuit), en construire un (25 argent), désactiver un bâtiment pour économiser sa maintenance.

---

## 5. Seuils et conséquences exactes

| Pression | Bande | Conséquence | Alerte |
|---:|---|---|---|
| 0–24 | normal | aucune | aucune |
| 25–49 | tension | aucune (avertissement seul) | `info` |
| 50–74 | crise | aucune (dernier avertissement) | `warning` |
| 75–99 | grave | **1 argent/tick par colon non servi** | `warning` + montant |
| 100 | critique | coût ci-dessus **+ 1 départ tous les 10 ticks** | `warning` + prochain départ |

Règles de seuil :

- Les conséquences ne commencent **pas** à 50 : à +1/tick, 50 est atteint 25 ticks (12,5 s) après le début d'une pénurie sévère, soit trop tôt pour être autre chose qu'un avertissement.
- Elles ne commencent **pas** seulement à 100 : 100 ticks (50 s) de pénurie à seuil seraient ignorables, et la jauge resterait décorative.
- **Pas de combinatoire pression × durée** : la pression est déjà l'intégrale de la durée ; elle monte sous 75 %, se fige entre 75 et 100 %, redescend à 100 %. Une colonie qui enchaîne des crises courtes repart de plus bas qu'une colonie en pénurie continue, sans compteur supplémentaire.
- **Pas de conséquence en dessous de 75 même après une crise passée** : une colonie qui a touché 74 et s'est rétablie ne subit rien. C'est le comportement voulu (« une pénurie légère ne doit pas être transformée en crise grave »).

---

## 6. Formules et transitions d'état

```
besoin   C = population (avant admission, comme la jauge)
servis   S = min(stock + production, C)          // déjà calculé par consumeWater
non servis U = C − S

coût d'urgence (argent/tick) =
    0                       si H < 75
    U                       si H ≥ 75

départ =
    −1 colon                si H = 100 et state.tick % 10 = 0 et population > 2
    0                       sinon

H' = updateWaterPressure(H, S, C)                // loi committée, inchangée
```

Propriétés :

- `U ≤ C`, donc le coût d'urgence est toujours **inférieur ou égal aux taxes** du tick : il peut annuler le revenu, jamais créer une dette (l'argent est de toute façon clampé à 0).
- Le coût ne dépend pas de `H` au-delà du seuil : c'est la soif qui fixe le montant, la jauge ne fait qu'autoriser. Conséquence : dès que la couverture revient à 100 %, `U = 0` et la facture s'arrête **au tick même**, même si `H` met 25 ticks à redescendre sous 75.
- Le départ utilise `state.tick` comme horloge : aucun champ persistant nouveau, sauvegarde v20 intacte, cadence déterministe et identique après un rechargement.

---

## 7. Règles de récupération

| Effet | Cesse quand | Immédiateté |
|---|---|---|
| Blocage de croissance | couverture = 100 % | immédiat (existant) |
| Facture d'urgence | `U = 0` (couverture 100 %) | **au tick même** |
| Départs | `H < 100` (dès le premier tick à 100 % de couverture) | 1 tick |
| Pression elle-même | `−1/tick` à 100 % | 100 ticks pour revenir à 0 (50 s à 1×) |

- **Rien n'est à réparer** : pas de bâtiment endommagé, pas de dette, pas de buff négatif persistant. La seule trace durable est la population perdue et l'argent dépensé.
- **Aucun effet différé** : la sortie de crise est plus rapide que l'entrée, ce qui respecte « la récupération ne doit pas être plus difficile que la prévention ».
- Les départs déjà survenus ne sont pas rendus : c'est la seule séquelle, et elle est volontairement irréversible pour que la crise compte.

---

## 8. Scénarios chiffrés

Convention : 1 tick = 500 ms (`BASE_TICK_MS`), donc 120 ticks/min. Les pressions marquées **(mesuré)** proviennent des passages cockpit du chantier précédent ; les autres sont des **calculs** sur la formule committée, pas des simulations exécutées.

### A. Déficit léger prolongé à 80 % (pop 10, 8 servis)

- État `light` : `ΔH = 0`. Pression **figée** à sa valeur d'entrée (mesuré : 41 maintenu sur 20 ticks).
- Conséquences : **aucune** (`H < 75`). Croissance bloquée.
- Cas particulier : si la colonie est déjà à ≥ 75 (séquelle d'une crise antérieure), la facture continue à 2 argent/tick sans fin. C'est voulu : 80 % n'est pas une guérison.

### B. Déficit sévère proche du seuil à 74,42 % (pop 86, 64 servis)

- `4G = 0,031` → arrondi 0 → plancher **+1/tick**. Modèle `severe` conservé malgré une gravité quasi nulle.
- 0 → 75 en **75 ticks** (37,5 s), 75 → 100 en **25 ticks** de plus (12,5 s).
- Facture à partir de `H = 75` : **22 argent/tick** (22 non servis, soit ~26 % des taxes de 86/tick), soit **550 argent** sur les 25 ticks menant à 100.
- Départs à 100 : 1 par 10 ticks, plancher 2.

### C. Déficit sévère moyen à 60 % (pop 10, 6 servis)

- **+1/tick** (mesuré : 40 ticks → pression 40).
- Facture à `H = 75` (tick 75) : 4 argent/tick → **100 argent** jusqu'à 100.
- Départs à partir de `H = 100` (tick 100), 1 par 10 ticks. Chaque départ réduit le besoin : 6/9 puis 6/8… la couverture finit par atteindre 100 % **sans intervention** à population 6, ce qui arrête les départs : l'attrition est auto-limitée par le nombre de colons réellement servis.

### D. Arrêt total de production (pop 10, 0 servi)

- **+4/tick** : 0 → 75 en 19 ticks (9,5 s), 100 en 25 ticks (12,5 s) (mesuré : 22 → 100 en 20 ticks).
- Facture : 10 argent/tick dès le tick 19 (~60 argent jusqu'à 100), puis 10/tick tant que dure le blackout — supérieure au revenu net, la trésorerie fond en ~15 ticks.
- Départs : 1 par 10 ticks à partir de 100 ; plancher 2 atteint après 80 ticks de criticité (40 s) si rien n'est fait.
- Aucune mort : le plancher empêche la colonie de disparaître par la soif.

### E. Crise sévère puis rétablissement (pop 10)

- 40 ticks à 60 % → `H = 40` (mesuré), retour à 100 % → **−1/tick** (mesuré : 41 → 22 en 20 ticks).
- `H` n'ayant jamais atteint 75 : **aucune conséquence**, ni argent ni départ. Fenêtre d'anticipation de 75 ticks à +1/tick, 19 ticks à +4/tick.

### F. Crises intermittentes

- 10 ticks à 60 % (+10) puis 10 ticks à 100 % (−10) : retour à 0, **aucune conséquence**, indéfiniment.
- Cycle 20 ticks sévères / 10 ticks de repos : +10 net par cycle → 75 atteint au 8ᵉ cycle (240 ticks), 100 au 11ᵉ. La colonie paie alors sans avoir jamais subi 100 ticks continus de pénurie — la pression joue bien son rôle de mémoire, sans second compteur.

### Retour à l'état normal

Dans tous les cas : couverture 100 % → facture stoppée au tick même, départs stoppés au tick suivant, `H` redescend de 1/tick et repasse sous 25 au bout de 75 ticks. Aucune action de réparation.

---

## 9. Risques d'équilibrage et cas limites

1. **La facture bloque l'achat du puits.** À 10 argent/tick de blackout avec 25 argent de coût de construction, une trésorerie vide interdit la construction. Mitigation déjà présente : **réactiver un puits désactivé est gratuit**, et la maintenance d'un bâtiment inutile peut être coupée par désactivation. À vérifier en jeu : une colonie sans puits de réserve n'a que la construction, donc l'argent.
2. **Le coût d'urgence et la maintenance se cumulent.** Au blackout, la colonie perd la taxe et paie 10/tick : ordre de grandeur d'un doublement du déficit. Acceptable, mais c'est le paramètre à calibrer en premier (1 argent/colon non servi vs 1 argent pour 2 colons).
3. **Le seuil de 75 est inatteignable exactement** pour la plupart des populations (75 % exige un multiple de 4). En pratique les franchissements se font à 74,42 % / 76,74 %. Sans effet sur la loi, mais à ne pas documenter comme un seuil « propre ».
4. **Pressions figées à 80 % après une crise.** La facture persiste hors crise aiguë. C'est volontaire, mais l'alerte doit dire le montant, sinon le joueur cherche un bug.
5. **Attrition auto-limitée = crise qui se « résout » en perdant des gens.** À 60 %, la colonie descend à 6 colons et les départs s'arrêtent (couverture 100 %). Ce n'est pas une spirale, mais c'est une perte silencieuse : chaque départ doit être annoncé.
6. **Ordre de staffing.** Les puits sont staffés après les fermes : une population qui fond désaffecte d'abord les ateliers, ce qui protège la production d'eau et évite la spirale eau → population → eau. À préserver lors de toute évolution de `assignJobs`.
7. **Double peine famine + soif.** À 100, la famine (`−1/tick`) et les départs (`−0,1/tick`) se cumulent. Borné, mais une colonie qui meurt de faim ET de soif perd vite. Ne pas augmenter la cadence des départs.
8. **Sauvegarde en cours de crise.** Recharger reprend `H` exactement ; la cadence de départ est dérivée de `state.tick`, donc une sauvegarde rechargée ne peut pas « gagner » de départs ni en perdre.
9. **Lisibilité de l'alerte.** `AlertSeverity` ne propose que `info` et `warning` : la conséquence critique s'affichera comme un avertissement. Ajouter un niveau `critical` serait une modification d'UI hors périmètre.

---

## 10. Critères d'acceptation

1. En dessous de 75, l'évolution de l'argent est **identique** à aujourd'hui (aucune ligne de coût supplémentaire).
2. À partir de 75, la trésorerie perd exactement `U` argent par tick, et `U ≤ population`.
3. Le coût tombe à 0 **au tick** où la couverture revient à 100 %, quel que soit `H`.
4. À 100, exactement un colon part tous les 10 ticks, jamais en dessous de 2 habitants, et chaque départ produit une alerte.
5. À 99, aucun départ.
6. La sauvegarde reste en version 20 : aucun champ ajouté, aucune migration.
7. Recharger une sauvegarde en pleine crise reprend `H` et la cadence à l'identique (déterminisme octet pour octet sur deux exécutions).
8. Aucune modification de la loi hydrique, des rendements, de la consommation, de l'alimentation ou des seuils de progression.
9. La loi hydrique, la famine, l'admission et l'économie existantes conservent leurs tests verts.
10. Les cas A à F du §8 sont reproductibles en test et, pour au moins C, D et E, retrouvés au cockpit.

---

## 11. Fichiers et systèmes concernés par une future implémentation

| Fichier | Rôle prévu |
|---|---|
| `src/domain/water/water.ts` | constante du seuil de facture (75) et de la cadence de départ (10), helper pur `waterEmergencyCost(unserved)` |
| `src/domain/economy/economy.ts` | `payWaterEmergency(state, unserved)`, inséré après `payMaintenance`, avant `payCrowding` (survie avant confort) |
| `src/domain/simulation/tick.ts` | capture de `U = C − S` comme `planksProduced`, passage à la phase économique ; appel des départs après `updatePopulation` |
| `src/domain/population/population.ts` | `applyWaterDepartures(state)` : `H = 100`, `tick % 10 = 0`, plancher 2, distinct de la famine |
| `src/application/queries/analysis.ts` | alerte de grave enrichie du montant ; alerte de départ |
| `src/application/queries/stats.ts` | exposer `waterEmergencyCostPerTick` et `waterDepartureDue` dans `ColonyStats` |
| `src/app/ui/statsPanel.ts` | une ligne de coût sous la jauge (optionnel mais recommandé) |
| `tests/water.test.ts`, `tests/population.test.ts`, `tests/economy.test.ts` (ou équivalent), `tests/persistence.test.ts` | seuils, coût, plancher, cadence, rechargement |
| `src/application/persistence/save.ts` | **aucune modification** (v20 conservée) |

---

## 12. Plan d'implémentation

1. **Constantes et fonction pure** : seuil 75, cadence 10, plancher 2, `waterEmergencyCost(unserved)` ; tests unitaires de la fonction seule.
2. **Coût dans le tick** : capture de `U`, appel `payWaterEmergency` après la maintenance ; test « 60 % → 4 argent/tick à partir de 75 » et « retour à 100 % → 0 au tick même ».
3. **Départs** : `applyWaterDepartures` avec plancher, branchée après `updatePopulation` ; tests plancher, cadence (`tick % 10`), pas de départ à 99.
4. **Alertes et stats** : copie des deux alertes avec montant et prochain départ, exposition dans `ColonyStats`.
5. **Cockpit** : afficher coût et prochain départ pour rejouer les scénarios C, D, E ; vérifier la lecture.
6. **Documentation** : mettre à jour `docs/roadmap/Step077-water-deficit-design.md` §H et la fiche Step078 une fois les chiffres validés en jeu.

Chaque étape reste sous 2 minutes de validation ciblée (fichier de test unique, pas de suite complète avant la fin).

---

## Recommandation unique

**Adopter l'hybride minimal du §4 : facture d'eau d'urgence de 1 argent par colon non servi à partir de 75, et un départ tous les 10 ticks à 100 avec plancher de 2 habitants.** Aucun nouveau système, aucun champ sauvegardé, aucune modification de la loi hydrique, récupération immédiate côté argent et quasi immédiate côté population.

## Décisions à verrouiller avant implémentation

1. **Le montant** : 1 argent par colon non servi (recommandé, borné par les taxes) ou 1 argent pour 2 colons non servis (deux fois plus doux).
2. **Le plancher** : 2 habitants (plus petite colonie capable de staffer une ferme et un puits) ou 3 (marge de sécurité).
3. **La cadence** : 1 départ tous les 10 ticks (recommandé, 5 s à 1×) ou tous les 20 ticks (plus lent, risque d'être ignoré).
4. **Le plancher de la facture** : autoriser la facture à pousser la trésorerie à 0 (recommandé, pas de dette) ou la plafonner à la moitié des taxes pour laisser de quoi construire.
5. **L'affichage du coût dans le panneau** : ligne dédiée (recommandé) ou mention dans l'alerte seule.
