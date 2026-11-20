# D4 — Débouchés monétaires : que fait-on du surplus final ?

Statut : **ouverte** — décision du propriétaire du design (P2 de la roadmap).
Date : 18 novembre 2026.
Voir : `../GAME-DESIGN-ECONOMY-RESOURCES.md` §6 (pistes), `../BALANCE-BASELINE.md` §3.2 et §8.3 (mesures), `D5-endgame.md` (dépense terminale).
Objet : décider à quoi sert la monnaie après l'ouverture, et donc quel type de
dépense créer.

## 1. Constat vérifié

### 1.1 Ce qui entre

| Loi | Valeur | Condition | Source |
|---|---|---|---|
| Taxe | 1/colon/tick | toujours | `economy.ts` |
| Commerce | 2/atelier **connecté**/tick | dès 8 colons | `economy.ts` |
| Bonus de débit | +1/planche produite/tick | — | `economy.ts` |
| Commerce technologique | +1/atelier/tick | `tradeRoutes` | `techs.ts` |
| Grenier | **aucune** vente de nourriture | marché retiré (Step065) | — |

### 1.2 Ce qui sort

| Loi | Valeur | Source |
|---|---|---|
| Entretien | 1/bâtiment **opérationnel**/tick (résidences et centre exemptés) | `economy.ts` |
| Surpopulation | `floor((pop − 10) / 5)` pièces/tick | `economy.ts` |
| Facture d'eau d'urgence | 1/colon **non servi**/tick, à partir de la pression 75 | `water.ts`, `economy.ts` |
| Bâtiment | **matériaux + argent** depuis D3 (20/11) : résidence 1 pl, ferme 1 pl, camp 1 pl, atelier 2 pl + 1 eau, carrière 4 pl, entrepôt 2 pl + 8 pierres, puits 25 $, parc 25 $ ; voir `D3-stone.md` §7.2 | `content/buildings.ts` |
| Technologie | 50 (âge 1), 150 (âge 2), 800 et 1 200 (âge 3) | `content/techs.ts` |

### 1.3 Le déséquilibre est structurel, pas un manque de contenu

Les trois postes de dépense existants (entretien, surpopulation, facture d'eau)
sont des **pénalités**, pas des **choix** : ils punissent la taille et la
pénurie, ils n'offrent rien. Les seuls achats sont les bâtiments et les
technologies, et tous deux saturent vite :

- **les bâtiments coûtent 25 pièces quelle que soit leur importance**, alors que
  la taxe vaut 1/colon/tick. À 86 colons, un seul tick de taxe paie 3,4
  bâtiments. Le vrai plafond de construction n'est pas l'argent : c'est le poste
  de travail, la planche et la place ;
- **le catalogue s'épuise** : 9 bâtiments, 9 technologies ; après 7 technologies
  et un parc immobilier complet, il ne reste rien à acheter.

Autrement dit : la monnaie est calibrée pour une colonie de 10 à 20 colons et le
jeu en produit pour une colonie de 86. Ce n'est pas un trou de contenu, c'est une
échelle de prix fixe face à un revenu proportionnel à la population.

## 2. Mesure

| Mesure | Témoin | Option C, ligne de croissance | Option C, ligne d'âge 3 |
|---|---:|---:|---:|
| trésorerie finale | 57 | **7 968** (8 652 sur `measure-2`) | **5 968** |
| technologies achetées | 4 / 9 | 7 / 9 | **9 / 9** |
| ateliers staffés à la fin | 0 / 4 | 4 / 4 | — |

Les deux colonnes de droite sont la même économie mesurée à deux étages : la
ligne de croissance s'arrête en âge 2 et laisse les deux technologies d'âge 3
(2 000 pièces) sur la table ; la ligne d'âge 3 les achète. 7 968 − 2 000 = 5 968.
Les deux chiffres du dossier sont donc cohérents, et le second est le plus
informatif : **même en achetant tout le catalogue, il reste près de 6 000
pièces**.

Le témoin ne thésaurise pas : il est **pauvre**, parce que sa chaîne ne démarre
jamais. Le surplus n'apparaît que lorsque l'économie fonctionne — c'est donc bien
un symptôme de réussite, pas de blocage, et c'est pour cela qu'il doit être traité
après l'accès à l'industrie.

**Donnée manquante** : le solde net instantané à pop 86 (taxes − entretien −
surpopulation) n'a pas été relevé dans cette passe ; on connaît le stock accumulé,
pas le débit de fin de partie.

## 3. Familles de dépenses comparées

| Famille | Ce qu'elle apporte au joueur | Pourquoi elle serait nécessaire | Quand elle devient pertinente | Coût relatif | Effet sur la progression | Risque |
|---|---|---|---|---|---|---|
| **Infrastructures** (bâtiments, déjà en place) | capacité de production et de logement | c'est le moteur actuel de la croissance | dès l'ouverture | 25 pièces, prix fixe | fort avant 20 colons, nul après | **saturé** : le poste de travail limite avant l'argent |
| **Entretien / amélioration** (niveau par bâtiment, rénovation) | plus de rendement sans plus de postes | le seul levier qui ne consomme pas de main-d'œuvre | âge 2, quand tous les postes sont pris | récurrent, proportionnel au parc | moyen, continu | **taxe déguisée** si mal borné ; interaction avec l'entretien existant (1/bâtiment) |
| **Technologies** (déjà en place) | rendement | déjà le puits principal | âge 1 à 3 | 50 → 1 200, un coup | fort | **saturé** : 7 achats et c'est fini |
| **Projets de progression** (chantier d'âge payant, palier d'infrastructure) | un objectif explicite, un choix de spécialisation | donne un sens à l'accumulation avant l'endgame | âge 2–3 | gros montant unique | fort, c'est un jalon | **artificiel** s'il ne fait qu'encaisser ; **obligatoire** s'il gate un âge |
| **Objectifs de fin de partie** (voir D5) | la destination | sans lui, la partie n'a pas de fin | âge 3 | très gros montant | terminal | **accumulation déguisée** si l'objectif est « avoir N pièces » |

Deux constats transversaux :

- une dépense **récurrente** (entretien/amélioration) est la seule qui absorbe un
  revenu qui croît avec la population ; une dépense **unique** ne fait que
  déplacer le problème d'un palier ;
- toute dépense qui **gate** un âge devient obligatoire et donc une taxe : c'est
  exactement ce que Step070 a retiré (les jalons de trésorerie).

## 4. Options

### A — Dépense récurrente liée au parc (amélioration/entretien par niveau)

Absorbe l'excédent proportionnellement à la taille de la colonie, sans nouveau
système de ressources. Risque principal : doubler l'entretien existant sans
mesure rendrait les colonies précoces insolvables.

### B — Projets de progression (chantiers payants qui ouvrent du contenu)

Donne un objectif intermédiaire entre les technologies et l'endgame. Risque : si
le projet est requis pour avancer, c'est un jalon de trésorerie déguisé — le piège
que Step070 a fermé.

### C — Prix proportionnels (coûts indexés sur la population ou sur le nombre de
bâtiments)

Corrige la cause arithmétique (prix fixe contre revenu croissant). Risque :
illisible pour le joueur, et rend toute mesure antérieure incomparable — les
valeurs du dossier entier deviendraient obsolètes.

### D — Plafonner ou taxer l'accumulation (plafond de trésorerie, impôt progressif)

Le plus simple à mesurer, le plus difficile à justifier : punir l'épargne ne
donne au joueur aucune décision supplémentaire.

### E — Ne rien faire tant que l'accès à l'industrie n'est pas réglé

Cohérent avec la roadmap (P2 « en attente ») : tant que la chaîne ne démarre pas,
le surplus n'existe pas ; le mesurer maintenant revient à équilibrer une économie
qui n'a pas encore de production.

## 5. Recommandation argumentée

**Traiter D4 après D1/D2 (accès à l'industrie) et après D3 (pierre), et retenir en
priorité une dépense récurrente liée au parc (A), avec les projets de progression
(B) comme second levier — jamais un jalon de trésorerie.**

Raisons :

- le surplus est **proportionnel à la population** ; seule une dépense
  proportionnelle le suit. Un achat unique reporte le problème de 500 ticks ;
- les jalons de trésorerie ont déjà été retirés une fois pour de bonnes raisons
  mesurées (Step070) : les réintroduire, même sous le nom de « projet », serait
  une régression déguisée ;
- ne pas toucher aux taxes avant d'avoir défini les usages : l'ordre inverse
  (taxer puis chercher une dépense) est exactement l'erreur que la roadmap
  interdit.

Point d'attention : la dépense doit être **lisible** dans le panneau (un joueur
doit voir ce qu'il achète et pourquoi), sinon elle ne crée pas de choix, seulement
une fuite.

## 6. Données manquantes

1. Le débit monétaire net à pop 86 (voir §2) — condition pour dimensionner une
   dépense récurrente.
2. La courbe de trésorerie tick par tick sur la ligne C : on sait qu'elle finit à
   7 968, pas quand elle décolle.
3. Le seuil de douleur : à partir de quel prix un joueur renonce à un bâtiment ?
   Aucune observation humaine.
4. L'effet d'une dépense récurrente sur les colonies précoces (pop 10–15), qui
   sont déjà à zéro trésorerie : le risque d'assécher la croissance est réel et
   non mesuré.
