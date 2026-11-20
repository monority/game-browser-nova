# NOVA — Game design : workforce

Version : 0.1  
Statut : cadrage à arbitrer, aucune formule nouvelle validée

## 1. Problème à résoudre

Dans le build mesuré, les postes nécessaires à la production alimentaire et hydrique absorbent exactement la population disponible :

`farms(N) + wells(N) = N`

Les ateliers et les bâtiments industriels restent donc sans personnel, même lorsqu'ils sont construits et accessibles.

Le problème n'est pas simplement un manque de bâtiments ou de ressources. C'est une contrainte structurelle du modèle de main-d'œuvre : la survie consomme toute la capacité de travail.

## 2. Objectif de design

Faire de la main-d'œuvre une ressource stratégique avec :
- une capacité de production essentielle suffisante pour éviter une microgestion permanente ;
- une marge de travailleurs permettant de développer une industrie ;
- des arbitrages visibles entre besoins, confort, industrie et expansion ;
- des conséquences compréhensibles lorsqu'un bâtiment manque de personnel.

La marge de travail doit être une décision de progression et de planification, pas un bonus caché qui rend l'industrie automatiquement active.

## 3. Principes

1. **Survie avant industrie**, mais pas au prix d'une impossibilité structurelle d'industrialiser.
2. **Staffing explicite** : un bâtiment construit n'est pas nécessairement opérationnel.
3. **Causalité visible** : le joueur doit savoir si un bâtiment est inactif faute de travailleurs, de route, de ressource ou d'un autre prérequis.
4. **Allocation déterministe** : à état identique, même attribution et même résultat.
5. **Pas de travailleurs fictifs** : toute capacité supplémentaire doit avoir une origine lisible dans les règles.
6. **Pas de correction locale qui masque le problème global** : ajouter un bonus arbitraire à chaque bâtiment ne constitue pas un modèle de workforce.

## 4. Modèles à comparer

Ces modèles sont des options de conception, pas des décisions déjà prises.

### Option A — Capacité de travail supérieure à la population

La population génère une capacité de travail supérieure à `N`, via un coefficient ou une capacité de base.

Avantages :
- simple à comprendre et à équilibrer ;
- permet une marge productive stable ;
- peu de friction pour les premières chaînes industrielles.

Risques :
- peut rendre la population trop productive ;
- un coefficient global peut masquer les coûts de certains bâtiments ;
- la marge peut devenir trop généreuse en fin de partie.

### Option B — Productivité des besoins essentiels

Les fermes et puits peuvent couvrir les besoins avec moins de travailleurs, par exemple grâce à des améliorations, à la technologie ou à l'efficacité.

Avantages :
- la progression libère progressivement de la main-d'œuvre ;
- relie l'optimisation de la survie à l'industrialisation.

Risques :
- l'industrie est bloquée au début si aucune marge initiale n'existe ;
- peut transformer les technologies en passage obligé ;
- risque de rendre les bâtiments essentiels obsolètes.

### Option C — Workforce différenciée

Distinguer population totale, travailleurs actifs et capacité productive, avec éventuellement des rôles ou niveaux de qualification.

Avantages :
- modèle plus expressif ;
- permet des arbitrages entre secteurs.

Risques :
- complexité de simulation et d'interface plus élevée ;
- risque de microgestion ;
- coût de maintenance et d'équilibrage supérieur.

## 5. Direction recommandée pour le prototypage

Tester d'abord un modèle simple de capacité de travail supérieure à la population, sans introduire immédiatement des classes de travailleurs.

Ce choix est un **axe de prototypage**, pas une valeur de balance validée. Le prototype doit comparer plusieurs marges et vérifier :
- qu'une partie peut staffer ses besoins essentiels ;
- qu'elle peut ouvrir une première chaîne industrielle sans sacrifier immédiatement la survie ;
- que l'expansion démographique n'accorde pas une croissance économique gratuite ;
- que les bâtiments ne deviennent pas tous actifs automatiquement ;
- que les pénuries restent possibles et lisibles.

Ne pas fixer ici un coefficient définitif. Le déterminer à partir de scénarios chiffrés et de tests de sensibilité.

## 6. Règles d'allocation à spécifier

Avant implémentation, documenter précisément :
- capacité totale de travail ;
- coût en travailleurs de chaque bâtiment ;
- priorité entre alimentation, eau, industrie, services et commerce ;
- comportement en cas de capacité insuffisante ;
- ordre de réallocation lors d'une variation de population ou de bâtiments ;
- effet de la distance et de la connectivité, si elles interviennent ;
- moment du tick auquel l'allocation est calculée ;
- affichage des travailleurs disponibles, affectés et manquants.

L'ordre d'allocation doit être stable et déterministe. Éviter qu'un ordre de parcours de collection non garanti change le résultat.

## 7. États de staffing attendus

Chaque bâtiment productif devrait pouvoir exposer une cause opérationnelle claire, selon les règles réellement applicables :
- opérationnel ;
- manque de travailleurs ;
- manque de ressource d'entrée ;
- non connecté / accès impossible ;
- verrouillé par progression ;
- en construction ;
- désactivé par le joueur, si cette action existe.

Ne pas afficher une cause qui n'est pas réellement vérifiée par le domaine.

## 8. Scénarios d'acceptation

| Scénario | Résultat attendu |
|---|---|
| Départ standard | Les besoins essentiels sont couverts sans allocation instable |
| Première industrie | Au moins une première chaîne peut être staffée dans une partie normale |
| Croissance démographique | L'augmentation de population n'entraîne pas automatiquement une économie positive |
| Pénurie de travailleurs | Le jeu identifie les bâtiments non staffés et la cause |
| Concurrence entre secteurs | Les priorités sont déterministes et compréhensibles |
| Rechargement / replay | Même état initial et mêmes commandes donnent les mêmes affectations |
| Prévision | Le forecast utilise exactement les mêmes règles d'allocation que le tick |

## 9. Non-objectifs de cette phase

- Ajouter des classes de population.
- Ajouter une simulation individuelle des colonists.
- Ajouter des salaires ou des besoins sociaux sans justification de gameplay.
- Refaire le système de routes.
- Rééquilibrer simultanément toutes les taxes, coûts et rendements.

Ces éléments restent différés tant que le modèle simple n'a pas été évalué.

## 10. Ordre de staffing retenu — mesuré le 18 novembre 2026

Build `88900bc`. Cette section remplace les hypothèses du §5 par ce que le code
applique et par ce que la mesure montre.

### 10.1 L'ordre réellement appliqué

Pour une population `N` :

1. **Éligibilité** : bâtiment actif (non mothballé), `jobCapacity > 0`, adjacent à
   une route. Un bâtiment construit hors réseau n'entre jamais dans l'ordre.
2. **Réserve hydrique** (loi de crise validée, hors périmètre) : si la jauge est au
   palier grave (`waterPressure >= 75`, verrou armé), `ceil(N/2)` puits sont staffés
   **avant** les fermes.
3. **Passe ordinaire** : classe de priorité — ferme (0), puits (1), **toute autre
   classe (2)** — puis ordre canonique `y`, `x`, `id`, un travailleur par poste,
   allocation gloutonne.
4. `assignJobs` est la **dernière** phase du tick ; la production lit l'affectation
   du tick précédent.

L'ordre est calculé par une seule fonction (`staffingOrder`) et l'affectation par
une seule passe (`staffingAssignment`), lues par le tick **et** par la surface
d'affichage. Il n'existe pas de seconde règle dans l'interface.

### 10.2 Priorité n'est pas capacité

L'ordre décide **qui** obtient un travailleur quand il en existe un ; il ne crée
jamais de travailleur. C'est la distinction qui manquait au cadrage : réordonner la
file ne change rien si la file est vide, parce que tous les travailleurs sont déjà
sur des postes de survie.

### 10.3 Douze postes de survie sur treize

À l'ouverture par défaut (5 fermes, 5 puits, 2 ateliers, 1 camp) :

- 5 fermes × 2 nourriture + 1 du centre = 11 nourriture pour 10 bouches : la
  colonie mange exactement ce qu'elle produit, moins 3 % de perte.
- 5 puits × 2 eau = 10 : exactement la consommation.
- Ces 10 postes absorbent les 10 colons. Les ateliers et le camp sont **derrière**
  la survie, et n'ouvrent qu'à partir du 11e colon.

À 13 colons, les 13 postes éligibles sont staffés : 5 fermes, 5 puits, 2 ateliers,
1 camp. **12 de ces 13 postes sont des postes de survie.**

### 10.4 La marge industrielle vaut un travailleur

| Population | Postes de survie staffés | Postes industriels staffés | Travailleurs libres |
|---:|---|---|---|
| 10 | 10 | 0 | 0 |
| 11 | 10 | 1 atelier | 0 |
| 12 | 10 | 2 ateliers | 0 |
| 13 | 10 | 2 ateliers + 1 camp | 0 |

Il n'y a donc jamais de marge : la chaîne n'est pas « débloquée » par une
progression, elle l'est par le **13e colon**, et ce colon est le seul disponible
pour l'industrie. Toute la question de design du dossier — rendre l'industrie
accessible avant 13 — porte sur cette marge, pas sur l'ordre de la file. Voir
`GAME-DESIGN-INDUSTRY-BEFORE-13.md`.

### 10.5 Le camp n'est pas mal classé

Le camp produit 2 bois/tick ; un atelier consomme 2 bois/tick. Un camp alimente donc
**un** atelier, pas deux. Classer le camp avant les ateliers (mesuré le 18/11) fait
monter le stock de planches (27–36 contre 1 à t=1 500) mais fait tomber la
population de 86 à 60 sur la ligne gouvernée : l'arbitrage est réel, la décision de
conserver l'ordre actuel est documentée dans
`../../adr/ADR-016-staffing-priority-order.md`.

Une correction importante accompagne cette décision : le plateau à 60 **n'est pas**
dû à un camp qui garderait le dernier ouvrier (au plateau : 13 ouvriers libres,
aucun camp actif). Il vient du financement du logement. Voir
`DIAGNOSIS-POPULATION-PLATEAU.md`.

### 10.6 Ce qui reste à spécifier

- Le comportement souhaité quand la nourriture est en déficit volontaire (le camp
  passe avant la ferme ? aujourd'hui la réponse est non, toujours).
- Le coût en travailleurs de chaque bâtiment industriel : à ce jour 1 poste, quel
  que soit le bâtiment, ce qui rend l'option D de la fiche industrielle sans effet
  tant que la marge est nulle.
- L'affichage des travailleurs **libres** en plus des postes staffés : la surface
  montre `rang/total · staffed|idle`, pas la marge.

### 10.7 La réserve hydrique ne suit plus le rendement (vérifié le 18/11/2026)

`waterWorkerReserve` (`src/domain/jobs/jobs.ts`) réserve `ceil(population / 2)`
puits en bande grave, avec pour justification écrite « deux eau par puits servent
deux colons ». C'était vrai tant qu'un puits valait 2. Depuis la technologie
`wellShafts` (option C prototypée, `decisions/D1-option-c.md`), `waterPerWell`
peut valoir 3 — et `ordinaryWaterCapacity`, **dans le même fichier**, lit bien
`waterPerWell`.

Conséquence : la réserve grave et la capacité ordinaire ne reposaient plus sur la
même hypothèse. Une colonie équipée réservait un puits de trop à pop 10–13, soit
exactement le poste que l'option C prétendait libérer. La réserve restait bornée et
sûre (elle ne peut pas affamer la colonie) : elle était mal dimensionnée, pas
dangereuse.

Ce que cela dit du staffing, au-delà du cas : **la loi de priorité n'est pas la
loi de dimensionnement**. L'ordre ferme → puits → reste dit qui passe d'abord ;
il ne dit pas combien de puits bâtir. Tant que le dimensionnement vit dans le
plan du joueur (ou du harnais), une ressource en surplus ne devient jamais du
travail. C'est l'objet de `decisions/D2-well-build-policy.md`.

**Corrigé le 18 novembre 2026.** `waterWorkerReserve` renvoie désormais
`ceil(population / max(1, waterPerWell(state)))` : la réserve lit la loi de
production au lieu de la réécrire, ce qui rétablit l'hypothèse unique partagée
avec `ordinaryWaterCapacity`. Verrouillé par `tests/water.test.ts` (« sizes the
grave-band reserve from the yield, not from a written-down two ») : 12 colons ⇒
6 puits sans technologie, 4 avec, 6 sous sécheresse (3 → 2). Les 46 tests de
`tests/water-crisis.test.ts` restent verts sans modification : hors technologie,
`ceil(N/2)` et `ceil(N/3)` coïncident, donc aucune bande mesurée ne bouge.

**Statut du levier depuis le 19 novembre 2026** : l'option C est hors du
catalogue livré (D1). Ce paragraphe et le §10.6 documentent donc un
**prototype mesurable**, pas une valeur livrée : dans le jeu livré, un puits
sert 2 colons et la réserve grave n'a jamais à diviser par 3.
