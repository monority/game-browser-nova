# Step050 — Logistique avancée : cadrage

**Type : cadrage produit. Aucune implémentation.** Baseline `4050def`
(MVP complet + événements tunés, CI verte). La logistique est le seul
système PARTIAL de STATE.md (« no distance/congestion/capacity
effects »). Toute implémentation attend le GO du propriétaire sur les
décisions L1–L5 ci-dessous.

---

## 1. Contrats existants (immuables)

- **01-PRODUCT-VISION §5** : flux canonique `Production → Storage →
  Road Network → Transport → Consumer`, livraison automatisée.
  **La proximité est une variable d'optimisation, pas une exigence
  dure** — « un producteur distant peut servir la ville si la
  logistique le soutient ». Espace d'optimisation joueur : placement
  des entrepôts, topologie du réseau, hiérarchie des routes,
  capacité, congestion, technologie de transport, priorités.
- **02-MVP §Logistics** : réseau routier, flux agrégé, livraison
  automatisée, capacité, effets distance/congestion.
- **ADR-003** : flux agrégés, zéro agent individuel (pas de
  pathfinding par coursier).
- **05-SIMULATION §3, phase 6** : « resolve logistics/flows » existe
  dans le tick canonique entre les inventaires (5) et la consommation
  (7) — le tick réel (11 phases) n'a pas de phase logistique.
- **STATE, Known Issues** : la couverture d'eau est un stock global —
  « revisit if water logistics design lands ».
- Leçon Step049 : **aucun système ne doit gonfler un taux de
  production** — une perte d'efficacité logistique est une réduction
  (même famille que la sécheresse) : sûre par conception.

## 2. L'écart réel

Aujourd'hui la route est un **interrupteur binaire** : un bâtiment
adjacent à une route est 100 % servi, sinon 0 %. Ni la distance, ni la
topologie du chemin, ni le placement des entrepôts ne créent de
décision. Le joueur ne peut pas « organiser la logistique » — le mot
de la vision §5 n'a pas de correspondant mécanique.

## 3. Décisions proposées L1–L5

### L1 — Quel effet d'abord : l'**efficacité par distance** (recommandé)

Trois familles possibles :

| Option | Effet | Coût | Verdict |
|---|---|---|---|
| **a. Efficacité par distance** | La production des producteurs décroît avec la distance-réseau au hub le plus proche | Modéré — fonctions pures + cache dérivé | **Recommandé Slice 1** |
| b. Stockage/consommation par réseau | Les stocks (nourriture/eau) deviennent des pools par réseau routier | Lourd — SAVE_VERSION 19, réécriture des gates d'admission, self-play à refondre | Reporté (voir L5) |
| c. Congestion/capacité | Débit par cellule de route, charges concurrentes | Très lourd — simulation de flux | Reporté (hors MVP) |

L'option (a) transforme littéralement la proximité en « variable
d'optimisation » (§5) sans toucher aux pools de stockage : un
producteur distant produit MOINS, il ne produit pas zéro — le contrat
« pas d'exigence dure » est respecté par construction.

### L2 — La référence de distance : **l'entrepôt ou le Centre** (hub)

Distance = **plus court chemin à travers le graphe routier** (BFS,
poids 1/cellule) depuis le bâtiment producteur jusqu'au hub le plus
proche : un entrepôt opérationnel, sinon le Colony Center (hub
implicite, existe toujours). Pourquoi le chemin réseau et pas la
distance à vol d'oiseau : la topologie est citée dans l'espace
d'optimisation §5 ; un cul-de-sac coûte, un contournement aussi.

Coût calcul : BFS recalculé **uniquement quand routes/bâtiments
changent** (commandes), pas par tick — cache dérivé dans la couche
application, jamais persisté (reconstruit au load, comme les
statistiques dérivées).

### L3 — La courbe d'efficacité (bornée, chiffrable)

`effet = 100 %` dans un rayon gratuit de **8 cellules-réseau** du hub,
puis décroissance linéaire jusqu'à un **plancher 50 %** à 20 cellules
(au-delà : plancher). Producteurs concernés : ferme, puits, camp,
carrière, atelier. Jamais en dessous de 50 % (§5 : pas d'exigence
dure). Ces nombres sont des **hypothèses de départ** à valider par le
harnais Step048 (la doctrine « mesurer avant de tuner » s'applique).

Accompagnement technologique (L3b) : une tech d'Âge 2/3
(« wheelbarrow », proposition de nom) élargit le rayon gratuit de +6 —
la « transport technology » de §5, un levier de plus pour la
progression.

### L4 — Présentation et garde-fous

- **Overlay « logistics »** (le 8e de la liste UI-UX §6) : teinte par
  palier d'efficacité ; légende states-only.
- **Inspection** : ligne `logistics · 100% · hub: warehouse-3 · 5 cells`
  (états, jamais d'instructions).
- **Forecasts exacts gratuitement** : `foodPerFarm`/`waterPerWell`
  consultent l'efficacité, donc forecasts et alertes restent justes
  (pattern Step028/Step047).
- **Aucune migration** : la distance est dérivée, SAVE_VERSION 18
  inchangé ; round-trips et continuation déterministe intacts.
- **Garde-fou self-play** : la grille Step048 (off→frequent × 2 seeds)
  doit rester pop 24 partout — une efficacité par distance ne doit pas
  casser les lignes prouvées ; c'est le critère de réglage des
  constantes L3.

### L5 — Reportés explicites

- **Stockage par réseau** (option b) : le gain gameplay est réel mais
  le coût (pools multiples, gates d'admission, migrations, refonte des
  tests self-play) le place après la preuve de valeur de (a). À
  recadrer séparément si (a) crée la demande.
- **Congestion/capacité** (option c) : simulation de flux, hors MVP
  (ADR-003 n'exige que l'agrégat).
- **Hiérarchie de routes, priorités, districts spécialisés** : la
  vision les liste, aucun n'a de mécanique aujourd'hui — chaque ajout
  est un nouveau scope.

## 4. Périmètre proposé (slice unique)

1. **Domain** — `src/domain/logistics/` : graphe routier (BFS
   multi-source depuis hubs), `logisticsEfficiency(state, building)`
   pure, intégration dans `foodPerFarm`/`waterPerWell`/production
   extraction/atelier ; constantes L3 + tech L3b dans `content/`.
2. **Application** — cache du graphe invalidé par commandes
   route/bâtiment ; stats/forecasts automatiques.
3. **UI/Renderer** — overlay logistics + ligne d'inspection + palette
   tech.
4. **Tests** — BFS déterminisme, courbe d'efficacité, exemption hub,
   tech, garde-fous self-play × 4, E2E overlay.
5. **Validation** — tsc/lint/vitest/build/E2E/CI ; captures overlay ;
   grille Step048 re-mesurée avant/après pour calibrer L3.

Estimation : 1 à 2 slices. Aucune migration de sauvegarde.

## 5. Décisions attendues du propriétaire

| # | Question | Recommandation |
|---|---|---|
| L1 | Effet logistique MVP | Efficacité par distance (a) ; b et c reportés |
| L2 | Référence de distance | Plus court chemin réseau au hub le plus proche (entrepôt sinon Centre) |
| L3 | Courbe | 100 % ≤ 8 cells, plancher 50 % à 20 ; tech « wheelbarrow » +6 (nombres de départ, calibrés au harnais) |
| L4 | Présentation | Overlay logistics + inspection ; aucune migration |
| L5 | Reportés | Stockage par réseau, congestion, hiérarchie |

**GO = approbation du tableau L1–L5** (chaque ligne modifiable avant
engagement).
