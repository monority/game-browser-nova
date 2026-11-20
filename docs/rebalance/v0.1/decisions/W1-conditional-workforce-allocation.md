# W1 — Allocation conditionnelle de la main-d'œuvre (règle officielle)

> **Statut : adoptée et livrée le 20 novembre 2026.**
> Référence comportementale : [`W1-conditional-allocation-experiment.md`](W1-conditional-allocation-experiment.md)
> (expérience C1, conservée telle quelle comme preuve historique).
> Faits de départ : [`W1-workforce-allocation.md`](W1-workforce-allocation.md).
> Mission : « NOVA — W1 Finalization: Conditional Workforce Allocation ».

En une phrase : **un atelier ne prend plus un bras s'il n'a pas le bois de son
lot.** Le bûcheron n'est pas prioritaire pour autant ; il reste dans son ordre
habituel. C'est la seule chose qui change.

---

## 1. La règle officielle

Un bâtiment industriel ne capte un travailleur que s'il peut faire son
prochain cycle de production avec les ressources et la logistique réelles de la
simulation.

Ce qui NE change pas :

- l'ordre des priorités : **ferme → puits → le reste** (le reste est un seul
  seau trié par cellule) ;
- la réserve hydrique et son loquet ;
- la recette de l'atelier : **2 bois → 2 planches par tick** (D6) ;
- **un travailleur par poste** ;
- les rendements, les coûts, les technologies, les ressources, la sauvegarde
  v22 et les migrations.

Ce qui change :

- dans le seau « reste », un **atelier** est sauté (pas déplacé) quand le bois
  disponible ne couvre pas son lot de 2 ;
- le bûcheron n'est **jamais** prioritaire : il prend son bras quand son tour
  arrive, et c'est à ce moment que sa coupe entre dans le budget.

## 2. L'algorithme exact

```text
ordre  = postes éligibles (bâtiment actif, capacité > 0, route adjacente)
         triés par classe (ferme=0, puits=1, reste=2) puis (y, x, id)
bras   = population
budget = stock de bois actuel          # jamais écrit dans l'état, jamais sauvé

# 1er passage — réserve hydrique (INCHANGÉE)
si le loquet est armé :
    réserver ceil(pop / eauParPuits) puits, borné par les bras et les puits existants

# 2e passage — l'ordre habituel
pour chaque poste de `ordre` :
    si déjà doté                       : suivant
    si bras == 0                       : refus "no-workers", suivant
    si poste est un atelier :
        si budget < 2                  : refus "no-input", suivant
        budget -= 2                    # le lot est réservé, une seule fois
    doter le poste ; bras -= 1
    si poste est un bûcheron :
        budget += min(part logistique × 2, gisement adjacent restant)
```

Deux détails qui comptent :

- **Pourquoi une projection et pas le seul stock.** L'affectation est la
  dernière phase du tick : le stock lu est le résidu d'après-transformation. Or
  le tick suivant coupe (phase 3) **avant** de transformer (phase 4). Un
  contrôle sur le seul stock refuserait tous les ateliers à jamais, alors que le
  camp qu'on vient de doter va livrer. Le budget ajoute donc la coupe du camp au
  moment où il reçoit son bras, bornée par la logistique et par le gisement
  adjacent restant (`projectedExtraction`, une seule maison pour cette borne,
  partagée avec le statut de la carrière).
- **Le budget est débité, pas copié.** Chaque atelier doté retire son lot : deux
  ateliers ne peuvent pas se voir promettre le même bois. Rien n'est persisté,
  donc aucune ressource fantôme ne survit au tick.

## 3. L'ordre des phases

Inchangé, et c'est lui qui impose la forme de la règle :

1. `advanceConstruction`
2. `produceFood` / `produceWater` (dotations du tick précédent)
3. `produceWood` / `produceStone` (gisements finis)
4. `producePlanks` (ateliers dotés, 2 bois → 2 planches)
5. `applyFoodSpoilage` puis `consumeFood` / `consumeWater`
6. `clampStorage`
7. `updatePopulation`, jauge hydrique, `updateWaterCrisis`, `updateWaterReserveLatch`
8. `updateEnvironment` (pollution + repousse des parcs)
9. **`assignJobs`** ← la décision de ce document
10. `collectRevenue` → `payMaintenance` → `payWaterEmergency` → `payCrowding`
11. `resolveEvents`

Conséquence : la dotation décidée au tick *n* produit au tick *n+1*. Un atelier
qui reçoit du bois ne transforme donc pas dans le même tick — c'est le contrat
de décalage déjà en place pour les fermes et les puits.

## 4. Concurrence et réservation du bois

- **Même ordre que la consommation.** L'affectation trie les ateliers par
  (y, x, id) ; la phase 4 consomme dans ce même ordre. L'atelier doté en premier
  est celui qui transforme en premier : la promesse et la consommation ne
  peuvent pas se contredire.
- **Le bois n'est promis qu'une fois.** Le budget est débité à chaque dotation.
  Mesuré : 2 ateliers, 2 bois, 2 bras → un seul est doté, l'autre est refusé
  (`no-input`), et la phase 4 ne sort qu'une planche. (test `activity.test.ts`)
- **Le camp ne passe pas devant.** Un atelier situé avant le camp dans l'ordre
  canonique ne peut pas être financé par la coupe de ce camp : il attend un
  tick. C'est le prix de ne pas introduire de priorité bûcheron — et c'est ce
  qui a été validé en C1.
- **Borne haute assumée.** Deux camps sur le même gisement peuvent tous deux
  compter le même reste : le budget peut surestimer. La phase 4 ne consomme que
  ce qui existe, donc il n'y a jamais de production fantôme — seulement un
  atelier doté qui ne transforme pas. Non observé dans les six scénarios.

## 5. Les causes d'inactivité

Une seule fonction décide, `buildingActivity` (`src/domain/building/activity.ts`),
et elle lit la décision d'affectation telle qu'elle a été prise.

| Raison interne | Libellé joueur | Sens |
|---|---|---|
| `no_workers` | Aucun travailleur disponible | le seau de bras était vide à son tour |
| `insufficient_input` | Matière première insuffisante | atelier sans budget bois pour son lot, ou chantier sans gisement à portée |
| `disconnected` | Connexion logistique manquante | aucun accès routier : jamais éligible |
| `inactive` | Bâtiment au repos | mis au repos par le joueur (`active: false`) |
| `operational` | Opérationnel | doté et rien ne manque |
| `under_construction` | En construction | le chantier n'est pas fini (cause ajoutée : ce n'est pas un repos) |

Ces causes ne se confondent pas : un bâtiment sans bras n'est pas forcément
sans matière, un bâtiment sans bois n'est pas forcément déconnecté, et un
bâtiment au repos n'est pas bloqué.

## 6. Comportement de l'inspecteur

- La ligne apparaît dans le panneau d'inspection existant, **juste après** la
  ligne d'effectif, avec `data-activity="<id du bâtiment>"`.
- Sa source : `getStaffingOverview().activityLine`, qui vient de
  `buildingActivity`, qui vient de `staffingDecision`. L'interface ne calcule
  **aucune** cause elle-même : elle affiche le verdict de la phase.
- Elle se met à jour à chaque clic sur le bâtiment (aucun état persisté, aucune
  version de sauvegarde touchée).
- Aucun nouveau panneau, aucune animation, aucun indicateur ajouté.

## 7. Invariants vérifiés

| Invariant | Statut |
|---|---|
| Ferme → puits → reste | conservé (test : ferme et puits dotés avant tout atelier) |
| Réserve hydrique et son loquet | inchangés (aucun code touché) |
| D6 : 2 bois → 2 planches | inchangé |
| Un travailleur par poste | inchangé |
| Ordre déterministe (classe puis y, x, id) | inchangé |
| Aucune ressource créée, aucune double réservation | testé (2 ateliers / 1 lot) |
| Sauvegarde v22 / migrations | inchangées (aucun champ ajouté) |
| Déterminisme | deux exécutions identiques (19 lignes de mesure, `diff` vide) |

## 8. Scénarios et résultats

Commande (opt-in) :

```bash
MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run tests/measure-throughput.test.ts
```

La sonde mesure maintenant **19 lignes** : six références sous l'ancienne loi
(`-baseline` implicite), six sous la loi officielle par le **défaut livré**
(`-official`), six sous la politique nommée comme en C1 (`-c1`), et la variante
3 camps. Le test compare ligne à ligne `-c1` et `-official` : **toute**
divergence échoue, ce qui prouve que le chemin joueur reproduit exactement
l'expérience validée.

| Scénario | Pop (min/fin) | Planches produites | At.-ticks sans bois | Camp staffé | Ateliers staffés | Trésorerie |
|---|---:|---:|---:|---:|---:|---:|
| standard | 10/24 → 10/24 | 60 → **1 166** | 4 585 → **0** | 0,02 → **0,74** | 3,07 → **0,39** | 6 109 $ → **3 166 $** |
| bois contraint | 10/24 → 10/24 | 18 → **1 356** | 4 608 → **0** | 0,02 → **0,76** | 3,07 → **0,45** | 6 067 $ → **3 356 $** |
| main-d'œuvre limitée | 10/10 → 10/10 | 294 → **1 272** | 1 674 → **0** | 0,10 → **0,42** | 1,12 → **0,42** | 6 286 $ → **7 264 $** |
| expansion | 10/40 → 10/40 | 90 → **136** | 2 817 → **0** | 0,03 → **0,05** | 1,90 → **0,05** | 1 505 $ → **1 324 $** |
| stress hydrique | 10/10 → 10/10 | 0 → **0** | 0 → **0** | 0,00 → **0,00** | 0,00 → **0,00** | 112 $ → **112 $** |
| partie longue (3 000 t.) | 10/40 → 10/40 | 90 → **136** | 6 265 → **0** | 0,02 → **0,02** | 2,10 → **0,02** | 3 301 $ → **3 142 $** |

Ratios « staffé » = somme des ticks staffés / ticks de la partie. Toutes les
valeurs `-official` sont **identiques** à celles du rapport C1.

Survie, identique : population minimale et finale inchangée partout, famine 0,
colons sans eau 0 — sauf le stress hydrique, inchangé par construction (aucun
atelier doté dans les deux lois). Aucun décès, âge et technologies identiques.

Ce qui se voit à l'écran : les ateliers tournent (planches ×19 en standard), le
bûcheron travaille (0,02 → 0,74), et les ateliers-ticks « sans bois » tombent à
zéro — sans qu'un seul colon de plus soit consommé.

## 9. Limites connues

- **L'industrie plafonne au bois.** 2 bois/tick par camp + 1/parc/tick ≈
  **1 planche/tick** en régime, pas 8. Ce n'est pas un défaut de la règle : le
  bois est la ressource rare.
- **Expansion et partie longue ne bougent presque pas** (+46 planches) : le camp
  n'y est éligible que **76 ticks sur 1 500** (il est construit trop tard). La
  règle ne peut pas répartir un bois que personne ne coupe.
- **La trésorerie baisse** dans quatre scénarios sur six (6 109 → 3 166 $ en
  standard) : plus d'entretien (3 ateliers qui tournent au lieu de 0) et des
  mises au repos dictées par la citerne, qui coupent le commerce de connexion.
  Elle monte quand la main-d'œuvre est la contrainte (6 286 → 7 264 $).
  C'est un sujet D4, pas un effet de cette règle.
- **Un atelier doté peut ne pas transformer** si le budget a été surestimé
  (deux camps sur un même gisement) ou si un atelier plus tôt dans l'ordre a
  consommé le stock : la ligne dit alors « Opérationnel » sur la décision
  d'affectation, pas sur un stock instantané.
- **La réserve hydrique lit encore l'ordre de référence** (sans la condition) :
  en bande grave, l'armement du loquet peut donc différer légèrement de ce que
  la loi ferait. Non instrumenté, aucun écart de population observé.
- **Les libellés sont en français** alors que le reste du panneau est en anglais
  (voir 10.3).
- **Trois tests E2E d'interaction étaient rouges** le jour de la livraison :
  ils attendaient un coût de placement en argent (`money − 25`), alors que D3
  facture en planches. Antérieur à W1 et hors de son périmètre ; corrigé ensuite
  (voir la note de validation ci-dessous), sans toucher à la loi.
- **Pas de test humain** : la lisibilité des libellés n'est pas évaluée.

### Note de validation (après livraison)

Les trois E2E d'interaction ont été remis en phase avec D3 : les attentes
`money − 25` sont devenues des assertions sur les **planches** (carrière 4,
ferme 1, résidence 1) et sur l'**argent inchangé**, chaque test amorçant le
stock nécessaire puis restant en pause, pour que les débits vérifiés soient
exacts. Rien n'a été retiré : le prix payé, l'absence de remboursement et la
réutilisation de la cellule restent vérifiés, aux valeurs de la règle en
vigueur. Mesure : `e2e/interaction.spec.ts` = **6 verts, 0 rouge, 1,2 min** ;
suite unitaire inchangée (199 verts, 1 ignoré).

## 10. Décisions restantes

1. **D4** — que faire de la trésorerie : c'est la question principale que ces
   mesures laissent ouverte.
2. **Le camp sans gisement** garde aujourd'hui son bras et affiche « matière
   première insuffisante » (la règle C1 ne le saute pas). Faut-il l'étendre pour
   qu'il ne capte plus de travailleur inutile ?
3. **La langue des libellés** : garder le français dans un panneau anglais, ou
   basculer tout le panneau.
4. **L'expansion** : traiter la construction tardive du camp (sujet séparé, déjà
   identifié en C1).
5. **La carrière** (pierre) n'est pas concernée par la loi : elle peut être dotée
   sans gisement et affiche alors « matière première insuffisante ».
