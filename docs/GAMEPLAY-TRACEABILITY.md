# NOVA — Traçabilité du gameplay

> **Rôle.** Pour chaque intention du design : où elle est écrite, comment elle
> est implémentée, quelle preuve on en a, et quel est l'écart. Une ligne sans
> preuve n'a pas sa place ici. Les statuts sont : **conforme**, **partiel**,
> **absent**, **contredit par les faits**.
>
> Audit du 2026-11-20. Code : `HEAD = 6e7e593` + arbre de travail (D3 non
> commité). Mesures : `docs/rebalance/v0.1/**`, `tests/selfplay.test.ts`.
> Chemin des sources d'intention : vault `product/01`–`11` ; l'état projet est
> dans `docs/game/` à la même numérotation.

## 0. Légende des preuves

- **code** : fichier et fonction lisibles dans l'arbre de travail.
- **mesure** : scénario rejoué sur le tick réel, chiffres consignés.
- **test** : assertion qui échoue si la loi change.

## 1. Boucle et construction

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Boucle construire → produire → stocker → distribuer → consommer → analyser → progresser | `01` §4, `02` §2 | tick en 14 phases (`docs/game/05-SIMULATION.md` §3), commandes + tick | code : `src/domain/simulation/tick.ts` | conforme | — |
| Placement libre sur grille, cellules entières | `01` §6 | `placement.ts` (empreinte 1 cellule, validation terrain/dépôt/route) | code | conforme | — |
| Routes cellule par cellule | `01` §6 | `state.roads`, `createRoad`, adjacence (`network.ts:isAdjacentToRoad`) | code | conforme | — |
| Suppression et cycle de vie | `02` §4 | `removeBuilding`, `deactivateBuilding`, reconstruction 2 ticks | tests `removal`, `deactivation` | conforme | — |
| Coût de construction en matériaux produits par la colonie | `02` §4 (décision D3 20/11) | `plankCost` + `stoneCost` + `moneyCost` par type ; déduction atomique | code : `commands.ts`, `placement.ts`, `resource.ts` | conforme | barème mesuré, voir D3 §7.2 |
| L'argent paie l'infrastructure et le civique | D3 §7 | puits 25 $, parc 25 $, route 5 $/cellule, entretien, recherche | code : `buildings.ts` | conforme | — |
| La carrière ne demande jamais de pierre | D3 §7 | `quarry.stoneCost = 0`, `plankCost = 4` | code + test `buildings.test.ts` | conforme | — |

## 2. Population et main-d'œuvre

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Population agrégée, jamais individuelle | `05` §4, ADR-004 | `state.population` (nombre) | code | conforme | — |
| Croissance par logement vacant + nourriture + eau + air | `05` §5 | `updatePopulation` : +1/tick si logement libre, `food > 0`, eau servie ≥ pop, qualité ≥ seuil | code : `population.ts:49-62` | conforme | aucune notion de qualité de vie, d'éducation ou de santé |
| Famine graduelle, jamais un effacement | `03` §6, doctrine écrite | −1 colon/tick non nourri | code | conforme | — |
| Départs hydriques bornés (plancher 2) | crise hydrique validée | 10 ticks consécutifs à pression 100, plancher 2 | tests `water-crisis` (46) | conforme | — |
| Le joueur n'assigne pas chaque citoyen | `01` §3, `05` §6 | `assignJobs` en dernière phase du tick | code : `jobs.ts` | conforme | — |
| Ordre d'affectation unique et déterministe | ADR-016 | `staffingOrder` : ferme (0) → puits (1) → autres (2), puis `y`, `x`, `id` | code + `tests/staffing.test.ts` | conforme | — |
| Le tick et l'interface lisent la même règle | ADR-016 | `queries/staffing.ts` importe l'ordre du domaine | code | conforme | — |
| Marge de main-d'œuvre permettant l'industrie | `05` §6, GAME-DESIGN-WORKFORCE §10.4 | aucune : 10 postes de survie absorbent 10 colons, 1 poste libre par colon au-delà | mesure D6 §4 (six scénarios, deux débits) : 287 → 293 ticks sans atelier staffé, 735 à l'expansion ; population 28 → 78 sur la ligne de croissance | **partiel** | P1-1 : le débit est levé (D6), la dotation ne l'est pas |
| Causes d'inactivité lisibles | `03` §3, `05` §9 | `reason: "no-workers" / "no-road" / "mothballed" / "under-construction"` | code : `queries/staffing.ts:25` | conforme | le **nombre de travailleurs libres** n'est pas exposé (P4-1) |
| Qualification / éducation | `01` §7, `02` §4 | rien | `grep education src` : vide | **absent** | P2, hors boucle courte |

## 3. Besoins

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Nourriture | `02` §4 | 1/colon/tick, perte 3 % (`conservation.ts:15`) | code + tests | conforme | — |
| Eau | `02` §4 | 1/colon/tick, `waterServed` = min(stock + prod, besoin) | code | conforme | — |
| Logement comme capacité | `02` §4 | `housingCapacity` = résidences actives × 1 | code | conforme | — |
| **Une catégorie de biens** | `02` §4, `01` §8 | **rien** : aucune ressource de biens | `grep` ressources : food, water, wood, planks, stone, money | **absent** | P1-3, l'écart le plus lourd du MVP |
| **Services de base** (école, santé, culture) | `02` §4, `01` §8 | **rien** | 9 bâtiments, aucun de service | **absent** | P1-3 + P2-6 |
| Satisfaction **progressive** (bandes 90/70/50/25) | `01` §8, `05` §7 | binaire : nourri / −1 colon ; pression hydrique a, elle, 4 bandes | code : `population.ts` ; `water.ts` | **contredit par les faits** | P1-3 : seule l'eau est graduée |
| Besoins hiérarchiques par catégorie | `01` §8 | aucune structure de catégories | — | **absent** | conséquence de P1-3 |

## 4. Ressources et production

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Nourriture : ferme 2/tick, centre +1 | `02` §5 | `production.ts` | code | conforme | — |
| Eau : puits 2/tick | `02` §5, D2 | `production.ts`, `waterPerWell()` | code + `tests/water.test.ts` | conforme | — |
| Bois : camp 2/tick (gisement adjacent), centre +1 | `02` §5 | `extraction.ts` | code | conforme | — |
| Planches : atelier 2/tick contre 2 bois | D6 (20/11), Step006 | `transformation.ts` | code + `tests/transformation.test.ts` + grille D6 | conforme | le plafond industriel est levé ; la dotation reste le verrou (P1-1) |
| Pierre : carrière 2/tick | `02` §5 | `extraction.ts` | code | conforme | — |
| Chaque ressource a une fonction | `03` règle 9 | planches → bâtiments ; pierre → entrepôt ; eau → atelier + boisson | code : `buildings.ts`, `commands.ts` | conforme (depuis le 20/11) | la pierre n'a qu'**un** consommateur : 8 par entrepôt |
| Stockage : plafonds distincts, entrepôt | `02` §4, `05` §9 | grenier 180 (+60/entrepôt), eau 80 (+40/entrepôt) | code : `storage.ts:25-28` | conforme | l'entrepôt ne demande ni poste ni décision (P2-3) |
| Distinguer produit / stocké / consommé / perdu | `05` §9 | pertes calculées (`clampStorage`, spoilage) mais non exposées | code | **partiel** | P4-2 |
| Chaînes courtes, pas de Factorio | `01` §9 | 1 transformation (bois → planches) | code | conforme | trop court pour nourrir un âge 2 (P3-1) |

## 5. Économie

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Taxe par habitant | `01` §10 | 1/colon/tick | `economy.ts:30` | conforme | — |
| Commerce lié à une activité réelle | GAME-DESIGN-ECONOMY §4 | 2/atelier **connecté**/tick dès 8 colons + 1/planche produite | `economy.ts:31-45` | **partiel** | le revenu d'atelier ne dépend ni du staffing ni de la production |
| Entretien par bâtiment | `02` §4 | 1/bâtiment opérationnel/tick, résidences et centre exemptés | `economy.ts:50,125` | conforme | — |
| Coût de croissance lisible | roadmap §3 | surpopulation `floor((pop−10)/5)`/tick | `economy.ts:177` | conforme | — |
| L'argent a **toujours** un usage | `02` §4 Economy | routes, puits, parcs, entretien, technos (50 → 1 200) | mesure : 2 839–8 843 pièces en fin de partie, ~5 968 après tout le catalogue | **contredit par les faits** | P1-2, D4 ouverte |
| Impasse budgétaire signalée | roadmap §3, `03` §3 | alerte « Treasury: frozen at 0 · net …/tick » | `analysis.ts:350` | conforme | signal sans action garantie |
| Pas de dette ni de revenu implicite | GAME-DESIGN-ECONOMY §5 | trésorerie bornée à 0, aucun crédit | code | conforme | — |
| Marché régional, prix dynamiques | `01` §10 (long terme) | **rien** (marché âge 2 retiré, Step065) | `grep market src` : vide | **absent** | hors périmètre MVP (`02` §10) |

## 6. Bâtiments

| Bâtiment | Source | Coût (D3) | Postes | Fonction livrée | Statut | Écart |
|---|---|---|---|---|---|---|
| Logement | `02` §6 | 1 planche | 0 | +1 capacité | conforme | — |
| Ferme | `02` §6 | 1 planche | 1 | 2 nourriture/tick | conforme | — |
| Puits | `02` §6 | 25 $ | 1 | 2 eau/tick | conforme | le puits est une **infrastructure payée en argent** (mesure D3 §7.8) |
| Bûcheron | `02` §6 | 1 planche | 1 | 2 bois/tick (gisement) | conforme | 1 camp alimente 1 atelier (mesure §9.3) |
| Atelier | `02` §6 | 2 planches + 1 eau | 1 | 2 planches/tick (−2 bois) + commerce | conforme (D6, 20/11) | sert aussi de « commerce » : le marché n'existe pas (P2-6) |
| Carrière | `02` §6 | 4 planches | 1 | 2 pierre/tick | conforme | — |
| Entrepôt | `02` §6 | 2 planches + 8 pierres | 0 | capacité de stock | **contredit par les faits** | règle 8 : aucune décision, aucun poste (P2-3) |
| Parc | `02` §6 | 25 $ | 0 | absorption de pollution | conforme | — |
| Centre de colonie | `02` §6 | 0 | 0 | +1 nourriture, ancre réseau | conforme | — |
| Marché | `02` §6 | — | — | **rien** | **absent** | P2-6 |
| École | `02` §6 | — | — | **rien** | **absent** | P2-6 |
| Santé | `02` §6 | — | — | **rien** | **absent** | P2-6 |
| Pêcherie | `02` §6 | — | — | **rien** | **absent** | P2-6 (liste « par exemple », non bloquant) |
| Bâtiment gaté par l'âge | `07` §2 | `requiredAge` lu par le placement et la palette | **aucun bâtiment ne le renseigne** | code : `buildings.ts:40`, `placement.ts:41`, `boot.ts:83` | **contredit par les faits** | P2-1 : un âge ne débloque rien |

## 7. Logistique

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Distribution automatisée | `02` §4 | agrégée, sans coursier | code | conforme | — |
| Proximité = variable d'optimisation, pas prérequis | `01` §5, règle 6 | rayon de route gratuit (`wheelbarrow` +6), efficacité d'extraction par distance | `network.ts`, `extraction.ts` | conforme | — |
| Congestion | `01` §5, `02` §4 | **rien** | `grep congestion src` : vide | **absent** | P2-5 |
| Priorités de flux | `01` §5 | **rien** | — | **absent** | P2-5 |
| Le joueur peut améliorer un flux et le mesurer | `02` §4 | oui, via le rayon et le placement | tests `roads` | conforme | — |

## 8. Progression

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Jalons multi-dimensions, faits canoniques | `05` §13, `07` §3 | pop / bâtiments / nourriture / technos | `progression.ts:AGE_MILESTONES` | conforme | — |
| Transition déclenchée par le joueur | `07` §4 | commande `advanceAge`, aucun timer | `commands.ts:153` | conforme | — |
| Tous les jalons de l'âge requis | `07` §3 | `canAdvanceAge` = tous | `progression.ts:78` | conforme | — |
| Un âge change les possibilités | `07` §2 | âges 1–3, seules les technos sont gatées | `AGE_NAMES`, `TECH_DEFINITIONS.age` | **partiel** | P2-1 |
| Âge terminal borné | contrat §6.4 | pas de jalons au-delà de 3 ; `applyAdvanceAge` incrémente sans garde | `commands.ts:153-158` | **partiel** | état fantôme « âge 4 » (P2-4) |
| Technologie = méthode, pas « +1 » | `01` §13, `07` §6 | 8 livrées : 7 × « +1/bâtiment », 1 × rayon logistique | `techs.ts` | **contredit par les faits** | P2-2 |
| Choix technologique significatif | `07` §5 | 3 technos âge 1 à 50, puis 3 âge 2 à 150, puis 2 âge 3 (800/1 200) | `techs.ts` | **partiel** | aucun arbitrage durable : tout est achetable |
| Spécialisation, projets d'âge | `07` §7, §9 | **rien** | — | **absent** | P3-2 |

## 9. Endgame

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Une partie a une destination | `01` §12 (implicite), D5 | **aucune** victoire, aucun score, aucun état terminal | `grep victory|defeat src` : vide | **absent** | P2-4, D5 ouverte |
| Défaite prévisible et compréhensible | `03` §6, D5 §4 | population peut tomber à 0 sans fin de partie | code | **absent** | D5 recommande l'état terminal à pop 0 |
| Continuation assumée | D5 option D | le sandbox continue indéfiniment | code | **partiel** | non assumé dans l'interface |
| Cohérence avec l'économie | D5 §2 | l'objectif « N pièces » est exclu (surplus mesuré) | D4 §2 | conforme (intention) | dépend de D4 |

## 10. UX et lisibilité

| Intention | Source | Implémentation | Preuve | Statut | Écart |
|---|---|---|---|---|---|
| Comprendre une pénurie | `02` §9, `03` §4 | alertes nourriture/eau/stock/air/budget/workplaces | `analysis.ts:230-410` | conforme | — |
| Lisibilité des prévisions | `05` §13 | `netPerTick`, ticks de réserve, prévision du cockpit | code + tests `cockpit-forecast` | conforme | — |
| Causes d'inactivité | `03` §3 | `no-workers`, `no-road`, `mothballed`, `under-construction` | `queries/staffing.ts` | conforme | marge non exposée (P4-1) |
| Conséquences des décisions | `01` §2 | rapports avant/après, inspecteur | code | **partiel** | pertes non exposées (P4-2) |
| Compréhension de la progression | `07` §3 | chaque jalon affiche requis / actuel / restant | `boot.ts:99`, inspecteur | conforme | les jalons ne disent pas ce qu'un âge **apporte** |
| Actions suggérées réalisables | roadmap §3 | aucune action imposée, seulement des causes | `analysis.ts` | conforme | — |
| Accessibilité clavier | `09` §11 | audit à refaire (non mesuré ici) | — | **inconnu** | donnée manquante |

## 11. Invariants techniques (vérifiés)

| Invariant | Preuve | Statut |
|---|---|---|
| Simulation indépendante du rendu | ADR-001, aucune importation `renderer` depuis `domain` | conforme |
| Tick fixe et déterministe | ADR-002, `tick.ts`, replay de test | conforme |
| Une seule source de vérité par loi | `waterPerWell`, `staffingOrder`, capacités dérivées de `D2_*` | conforme |
| Sauvegarde versionnée + migrations | `SAVE_VERSION = 22`, `MIGRATABLE_SAVE_VERSION = 13` | conforme |
| Aucune valeur de balance sans mesure | les 3 tests de parcours rouges sont **conservés rouges** | conforme (par discipline) |
