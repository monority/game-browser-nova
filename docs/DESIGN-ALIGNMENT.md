# NOVA — Alignement de design

> **Rôle.** Ce document ne crée aucune règle et ne fixe aucune valeur. Il répond à
> une seule question : *quel jeu NOVA cherche-t-il à devenir, et où le build en
> est-il ?* L'intention vit dans le vault, l'état vit dans `STATE.md`, l'ordre du
> travail dans `REALIGNMENT-PLAN.md`, la traçabilité ligne à ligne dans
> `GAMEPLAY-TRACEABILITY.md`, les arbitrages dans `DESIGN-DECISIONS.md`.
>
> Audit du 2026-11-20, sans aucun changement de gameplay. Base : `HEAD = 6e7e593`
> plus l'arbre de travail non commité (modèle de coût D3, voir `STATE.md`).

## 1. Hiérarchie des sources (et les noms qui n'existent pas)

| Niveau | Source | Date | Ce qu'elle possède |
|---|---|---|---|
| Intention | vault `05-Projects/nova/product/01`–`11` | `updated` 2026-11-19/20 | ce que le jeu doit être, les décisions du propriétaire |
| Direction | `docs/game/00-GAME-DESIGN-CONTRACT.md` | matrice vérifiée 2026-11-13 | les piliers, la matrice KEEP/IMPROVE/EXPAND/DEFER |
| État par système | `docs/game/01`–`11` | annotés jusqu'au 20/11 | ce que le build fait, section « implemented » |
| Arbitrages mesurés | `docs/rebalance/v0.1/**` + fiches D1–D5 | 18–20/11 | ce qui a été mesuré, ce qui reste à trancher |
| Registre MVP | `docs/MVP-REFERENCE.md` | 20/11 | les 13 critères et leur état |
| Dépôt | `docs/STATE.md` | 20/11 | la seule source des faits de dépôt |

**Correspondance avec les noms cités dans la mission.** Le dépôt n'a jamais
contenu `02-game-design.md`, `03-core-loop.md`, `07-population.md`,
`08-economy.md`, `09-economy-foundation.md`, `10-technology.md`, `20-strategy.md`,
`21-simulation-progression.md`, `25-mvp.md`, `26-roadmap.md`,
`29-design-rules.md`, `30-architecture-foundation.md`,
`31-determinism-and-verification.md`. Les documents réels et leurs équivalents :

| Cité | Réel |
|---|---|
| `01-product-vision.md` | `01-product-vision.md` (identique) |
| `02-game-design.md`, `03-core-loop.md` | `02-mvp.md` (§4 systèmes, §12 scénario) + `01` §4 (boucle) |
| `07-population.md` | `05-simulation.md` §4–§7 + `01` §7–§8 |
| `08-economy.md`, `09-economy-foundation.md` | `08-resources.md` + `01` §10 + `05` §11 |
| `10-technology.md` | `07-progression.md` §5–§6 |
| `20-strategy.md`, `21-simulation-progression.md` | `11-roadmap.md` + `05-simulation.md` |
| `25-mvp.md`, `26-roadmap.md` | `02-mvp.md`, `11-roadmap.md` |
| `29-design-rules.md` | `03-design-rules.md` |
| `30-architecture-foundation.md` | `04-architecture.md` + `docs/CODE-STRUCTURE.md` |
| `31-determinism-and-verification.md` | `ADR-002` + `docs/VALIDATION.md` + `docs/TESTING.md` |

Aucun contenu n'est perdu : c'est un problème de nommage, pas de documentation
manquante. Il est consigné ici pour qu'un agent ne cherche plus ces fichiers.

**Version concurrentes.** Le vault et `docs/game/` ne sont pas deux copies : le
vault porte l'intention (et la décision datée), `docs/game/` porte l'état réel
(sections « implemented »). Là où les deux divergent, c'est `docs/game/` qui
ment le plus souvent — voir §5.5. Quand `docs/game/` est en retard sur le code,
c'est le code qui a raison et le document qui doit être corrigé.

## 2. La vision reconstituée

**Nature.** Un city-builder systémique à progression de civilisation, sur une
planète procédurale : une métropole principale, des âges qui la transforment, un
monde qui fournit ressources et tensions. Pas un RTS : le joueur *conçoit des
systèmes*, les agents exécutent (`01` §1, §3).

**Boucle principale** (`01` §4, `02` §2) :

```text
construire → produire → stocker → distribuer → consommer → observer
→ nommer le goulot → optimiser → grandir → jalon → âge suivant
```

Elle est **diagnostique** : une décision doit se relier à un résultat observé.
La boucle n'est pas « cliquer plus vite », c'est « comprendre mieux ».

**Construction.** Grille, cellules entières, routes cellule par cellule ; le
placement est libre *dans* la grille, jamais un point arbitraire ; pas de puzzle
d'adjacence imposé (`01` §6). Le bâti se paie en matériaux produits par la
colonie ; l'argent arbitre l'infrastructure et le civique (décision D3, 20/11).

**Workforce.** Agrégée, jamais individuelle. Le joueur ne place pas chaque
citoyen : le travail flexible remplit construction, transport, production et
services de base ; l'éducation débloque ensuite des rôles spécialisés
(`01` §7, `05` §6, `02` §4 Population).

**Ressources.** Ensemble volontairement court au MVP, chaînes directes ou
courtes ; une ressource survit aux âges par substitution ou usage nouveau, pas
par obsolescence (`01` §9, `02` §5). Chaque ressource doit avoir une fonction
(règle 9), pas seulement un stock qui monte.

**Économie.** Trois couches : physique (ressources, main-d'œuvre, transport),
marché (plus tard), finances publiques (taxes, dépenses). Une monnaie
principale, un budget public ; l'argent doit **toujours** avoir un usage
(`01` §10, `02` §4 Economy).

**Technologie.** Petite sélection, effets systémiques nommés ; pas d'arbre, pas
de « +10 % partout ». Elle doit changer une méthode, pas seulement un chiffre
(`01` §13, `07` §6).

**Âges.** Un âge est un chapitre, pas un habillage : nouveaux problèmes,
nouveaux systèmes, nouvelle infrastructure, transformation visuelle. Jalons
multi-dimensions, transition déclenchée par le joueur (`07` §2–§4).

**Profondeur recherchée.** Le plaisir vient de l'optimisation et de la
compréhension : « j'ai trouvé le goulot », « mon nouveau tracé a changé le
résultat » (`01` §2). La difficulté est la lisibilité des arbitrages, pas la
punition (`03` §6, contrat §7).

**Destination d'une partie.** Le vault ne définit **aucune** condition de
victoire ni de défaite (`grep -i "victory|defeat|endgame" product/*.md` : vide).
C'est un manque d'intention, pas un oubli d'implémentation : la fiche D5
compare les destinations possibles et recommande un objectif de développement
multicritère, avec un état terminal à population 0 pour seul échec.

## 3. Principes directeurs (non négociables)

1. Le joueur optimise, il ne microgère pas (règle 1) ; le travail automatisable
   est automatisé (règle 2).
2. Le jeu expose des causes, pas des solutions (règle 3, `03` §4).
3. La complexité vient des interactions, pas des corvées (règle 4) ; toute
   mécanique doit consommer un budget de complexité justifié (`03` §5).
4. Une mécanique nouvelle exige une décision du joueur (règle 8).
5. Une ressource nouvelle exige une justification de jeu (règle 9).
6. La simulation est la vérité, le rendu une couche de présentation (règles
   11–12, ADR-001) ; tick fixe et déterministe (ADR-002).
7. Aucune compensation croisée entre ressources : on ne corrige pas un problème
   de main-d'œuvre en gonflant la nourriture (`03` §6, roadmap §5).
8. Aucune valeur de balance sans mesure ; aucune dépense artificielle pour vider
   une trésorerie (`03` §5, D4 §3).

## 4. État réel, système par système

Résumé ; chaque ligne a sa preuve et son écart détaillé dans
`GAMEPLAY-TRACEABILITY.md`.

| Système | Intention | Livré | Écart de fond |
|---|---|---|---|
| Boucle | diagnostique | complète (construire → jalon → âge) | la boucle tourne, mais son moteur de croissance est étroit |
| Construction | grille, matériaux | grille + planches/pierre/argent (D3) | coûts mesurés, mais une seule chaîne de matériaux |
| Workforce | agrégée, flexible | staffée par le tick, ordre unique (ADR-016) | **aucune marge** : l'industrie n'ouvre qu'au 13e colon |
| Besoins | catégories, satisfaction progressive | nourriture + eau, binaire | **biens et services absents** ; pas de satisfaction graduée |
| Ressources | courtes, toutes utiles | bois → planches, pierre, eau, nourriture, argent | pierre désormais utile ; aucune ressource de biens |
| Économie | argent toujours utile | taxes, commerce, entretien, surpopulation | **trésorerie finale sans emploi** (D4 ouverte) |
| Bâtiments | couvrir la boucle | 9 types | marché, école, santé, pêcherie absents ; entrepôt sans décision |
| Logistique | distance, capacité, congestion | rayon de route + efficacité d'extraction | ni congestion, ni priorité de flux |
| Progression | âges = chapitres | 3 âges, jalons factuels, 8 technos livrées | **aucun bâtiment n'est gaté par l'âge** ; âge 3 terminal par les données |
| Technologie | méthodes, pas de % | 8 technos, effets nommés additifs | 7 sur 8 sont un « +1 par bâtiment » |
| Endgame | destination | **aucune** | ni victoire, ni défaite, ni fin |
| UX | causes lisibles | prévisions, alertes, inspecteur | marge de travailleurs et pertes non exposées |

## 5. Écarts majeurs, classés

Aucun **P0** n'est retenu : le build démarre, joue, sauvegarde et ne présente
aucun softlock reproductible connu. Un risque conditionnel est consigné en
§5.6.

### P1 — rupture de la boucle ou économie incohérente

**P1-1. La marge de main-d'œuvre n'existe pas : le débit est levé, la dotation reste.**
Les 10 postes de survie absorbent les 10 colons du jour 0 ; le 11e ouvre un
atelier, le 13e le camp. Le débit de l'atelier a été tranché par le propriétaire
le 20/11 (**D6** : 2 planches pour 2 bois) : la ligne de croissance passe de
**28 à 78 colons** (cible ~100, `02` §4), donc ce n'était pas un plafond de place
ni d'argent, c'était un plafond de débit.

La marge, elle, n'est **pas** dégagée : sur six scénarios joués aux deux débits,
les ateliers restent sans ouvrier aussi souvent (287 → 293 ticks sans atelier
staffé, 735 à l'expansion), parce que puits et fermes prennent un bras par
habitant à eux deux (D6 §4). L'écart restant est une question de **dotation de
travail**, pas de production. Source : `01` §7, `02` §4, `05` §6.

**P1-2. L'argent a cessé d'être une décision.** La trésorerie finit entre
**2 839 et 8 843** pièces sans achat possible ; même en achetant les 9
technologies il reste ~5 968 pièces (D4 §1–§2). Or `02` §4 exige que l'argent
ait *toujours* un usage. Source : `01` §10, `02` §4 Economy, `05` §11.

**P1-3. Les besoins du MVP ne sont qu'à moitié livrés.** Nourriture et eau
seulement ; aucune catégorie de biens, aucun service de base, satisfaction
binaire (on est nourri ou on perd un colon par tick). C'est le seul écart qui
touche **la boucle entière** et pas un bâtiment : critère 7 sur 13, partiel par
construction. Preuve : `src/domain/production/production.ts` ne consomme que
`food` et `water` ; `src/domain/population/population.ts` ne connaît que
faim/soif/logement/qualité de l'air.

### P2 — système incomplet ou contenu sans fonction

**P2-1. Les âges ne changent pas les possibilités.** `requiredAge` existe dans
le modèle (`src/content/buildings.ts:40`) et est lu par le placement, la palette
et `boot.ts` — mais **aucune définition ne le renseigne** : les 9 bâtiments sont
disponibles à l'âge 1. Seules les technologies sont gatées. Un âge est donc,
aujourd'hui, un nom et un jeu de jalons, pas un chapitre (`07` §2).

**P2-2. La technologie reste un bonus de production.** 8 technos livrées : 7
sont « +1 par bâtiment staffé » (ferme, carrière, atelier), 1 élargit le rayon
logistique. Aucune n'ouvre une méthode, une substitution ou un bâtiment
(`01` §13, `07` §6).

**P2-3. L'entrepôt achète de la capacité sans décision.** Il coûte 2 planches +
8 pierres et 0 poste de travail ; il ne fait que déplacer un plafond de stock
(`03` règle 8, audit F16, MVP-REFERENCE §6).

**P2-4. L'endgame n'existe pas.** Ni victoire, ni défaite, ni score, ni
continuité assumée : la colonie peut tomber à 0 sans que la partie le dise, et
l'âge 4 est un état fantôme (`AGE_NAMES` n'a que 1–3). Source : `01` §12,
D5 §1.

**P2-5. La logistique n'a ni congestion ni priorité.** La distance n'agit que
par le rayon de route et l'efficacité d'extraction ; `02` §4 demande
« distance/congestion effects », `01` §5 liste congestion et priorités comme
espace d'optimisation.

**P2-6. Quatre familles de bâtiments du MVP manquent** : marché, école, santé,
pêcherie (`02` §6). Elles ne valent d'être ajoutées qu'après P1-3, sinon elles
n'ont rien à satisfaire.

### P3 — profondeur stratégique

**P3-1. Une seule chaîne de transformation** (bois → planches). `02` §5 demande
« basic goods/materials » ; le contrat classe l'extraction/transformation en
EXPAND.

**P3-2. Aucune spécialisation** : pas de choix durable, pas de projet d'âge,
pas de substitut de ressource (`07` §7, §9).

### P4 — lisibilité et confort

**P4-1. La marge de travailleurs n'est pas exposée** : la surface montre
`rang/total · staffed|idle`, pas le nombre de travailleurs libres
(GAME-DESIGN-WORKFORCE §10.6).

**P4-2. Les pertes ne sont pas exposées** : conservation et dégradation
existent, mais l'inspecteur ne montre pas « produit / stocké / consommé / perdu »
(`05` §9) ; le contrat note « surplus and equilibrium autonomy are unreadable ».

### 5.5 Écarts documentaires (à corriger, pas à décider)

Un document qui décrit un état faux est un écart de cohérence au même titre
qu'un système manquant, et il coûte plus cher : il fait prendre de mauvaises
décisions. Constatés le 20/11 :

| Document | Affirmation | Réalité |
|---|---|---|
| `docs/game/07-PROGRESSION.md` §10.1 | jalons d'âge avec trésorerie 200 / 600 / 1 500 | Step070 a **supprimé** les jalons de trésorerie ; les jalons sont pop/bâtiments/nourriture/technos (`src/content/progression.ts`) |
| `docs/game/07-PROGRESSION.md` §10.1 | âge 2 = pop 15, 14 bâtiments, trésorerie 600, 5 technos | âge 2 = pop 15, 14 bâtiments, **nourriture 60**, 5 technos |
| `docs/game/07-PROGRESSION.md` §10.2 | « six technologies » | **huit livrées** (deux technos d'âge 3, Step070, 800 et 1 200 pièces) |
| `docs/game/07-PROGRESSION.md` §10 | « save v18 » | `SAVE_VERSION = 22` |
| `docs/game/00-GAME-DESIGN-CONTRACT.md` §11 | « Technology : 6 entries », « Persistence : version 19 » | 8 livrées, v22 |
| `docs/rebalance/v0.1/GAME-DESIGN-ECONOMY-RESOURCES.md` §9 | résidences payées en monnaie, carrière 5 planches, « 1 planche/tick » | D3 : résidence 1 planche, carrière 4 planches, entrepôt 2 planches + 8 pierres |
| `docs/rebalance/v0.1/decisions/D4-money-sinks.md` §1.2 | bâtiment 25 pièces pour tous les types | D3 : matériaux + argent selon le type |
| `docs/MVP-REFERENCE.md` §3–§6 | corrigé le 20/11 (pierre morte, plafond 60, technos à 50) | — |

Ces lignes sont corrigées au fil de l'eau quand elles sont fausses ; les valeurs
historiques restent dans les sections datées. Ne jamais réécrire une mesure
passée : ajouter une section datée.

### 5.6 Risque conditionnel (P0 potentiel, non mesuré)

Le jour 0 livre **12 planches** et **aucun camp de bûcherons** ; les 2 ateliers
gratuits n'ont de bois que par la collecte du centre, qui exige un gisement
adjacent. Si aucun gisement n'est adjacent au centre sur la graine par défaut,
les 12 planches sont un **stock fini** : les dépenser toutes en logements rend
la boucle industrielle inaccessible pour de bon (pas de camp, donc pas de bois,
donc pas de planche), tandis que la population continue de croître tant que le
logement est vacant. Ce n'est pas un game over, c'est une partie devenue
industriellement morte sans que rien ne le dise.

Statut : **hypothèse à mesurer**, pas un défaut constaté. Mesure à faire :
gisement adjacent au centre sur la graine par défaut, puis partie « tout en
logements » de 1 500 ticks.

## 6. Décisions structurantes

Voir `DESIGN-DECISIONS.md` : ce qui est adopté et ne se rouvre pas sans preuve
(D1, D2, D3, ADR-016, Step065/070/083), ce qui est rejeté (jalons de
trésorerie, marché d'âge 2, dépenses artificielles, option C livrée), ce qui est
ouvert (D4, D5, débit de l'atelier), ce qui est expérimental (option C en
prototype, taux de conservation, événements désactivés par défaut).

## 7. Ce que NOVA cherche à devenir, en une page

NOVA est un city-builder où **comprendre est le jeu**. Le joueur installe une
colonie qui doit tenir sur ses propres chaînes, découvre le goulot qui la
bloque, le corrige, et voit la ville grandir — puis change d'âge et affronte un
problème d'une autre nature.

Ce qui est déjà conforme : la **boucle diagnostique** existe et se mesure (le
tick est déterministe, l'inspecteur nomme des causes, les jalons lisent des
faits canoniques), la **construction** se paie en matériaux, la **main-d'œuvre**
est agrégée et déterministe, la **pierre** a enfin un usage, les **crises
hydriques** sont graduelles et récupérables.

Ce qui ne l'est pas, dans l'ordre où ça bloque :

1. la colonie n'a **pas de marge de travail**, donc pas d'industrie, donc pas de
   croissance au-delà de ~30 colons ;
2. l'**argent** s'accumule sans acheter de décision ;
3. les **besoins** s'arrêtent à manger et boire : pas de biens, pas de services,
   pas de satisfaction graduée — c'est l'écart le plus lourd du MVP ;
4. les **âges** ne débloquent rien et la **technologie** ne change pas de
   méthode ;
5. la partie n'a **pas de destination**.

Un développeur qui reprend le projet doit pouvoir dire, après avoir lu ces cinq
lignes : la mécanique est saine, le contenu et les débouchés manquent. C'est
exactement le diagnostic.
