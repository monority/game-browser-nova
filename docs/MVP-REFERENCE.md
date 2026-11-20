# NOVA — Référence MVP (décisions d'origine)

> **Autorité.** Ce document ne crée aucune règle. La référence est le vault du
> projet, `05-Projects/nova/product/01` à `11` (décisions du propriétaire,
> révisées le 2026-11-19 pour la grille). Ce fichier recense seulement ce que ce
> MVP exige et où le build se situe, avec la preuve dans le code ou les mesures.
> En cas de désaccord, **le vault tranche** ; ce registre est corrigé, jamais
> l'inverse.

## 1. Les treize critères de réussite (02-MVP §2)

| # | Critère | État | Preuve / limite |
|---|---|---|---|
| 1 | Entrer dans une petite colonie qui fonctionne | **tenu** | jour 0 : 10 habitants, 10 logements, 5 fermes, 5 puits, stocks 60 / 40 / 100 |
| 2 | Repérer une inefficacité de départ | **tenu** | la nourriture est proche de sa limite à l'ouverture |
| 3 | Construire et réorganiser | **tenu** | placement sur la grille, suppression, routes cellule par cellule |
| 4 | Produire | **tenu** | ferme, puits, bûcheron, carrière, atelier |
| 5 | Stocker | **tenu** | entrepôt, capacités distinctes par ressource |
| 6 | Distribuer automatiquement | **partiel** | affectation automatique et rayon de route ; la distance n'agit que par ce rayon, aucune congestion n'est simulée (`grep congestion src` : vide) |
| 7 | Satisfaire les besoins | **partiel** | nourriture et eau seulement (voir §2) |
| 8 | Inspecter la cause d'une pénurie | **tenu** | prévision, réserves, alertes qui nomment la cause |
| 9 | Faire une optimisation significative | **tenu** | affectation du personnel, parcs contre pollution, commerce |
| 10 | Observer une amélioration mesurable | **tenu** | compteurs et rapports avant / après |
| 11 | Développer population et ville | **partiel** | 78 colons depuis D6 (atelier à 2 planches/tick, 20/11), contre une cible de ~100 : le plafond des planches est levé, la marge de main-d'œuvre reste la limite (voir §3) |
| 12 | Atteindre des jalons | **tenu** | jalons multi-dimensions (population, bâtiments, trésorerie, technos, stocks) |
| 13 | Entrer dans le début de l'âge 2 | **tenu** | âge 2 jouable ; l'âge 3 existe déjà, hors périmètre MVP |

## 2. Besoins (02-MVP §4, 08-RESSOURCES §6–§7)

Le MVP demande au minimum : nourriture, eau, logement, **une catégorie de biens**,
**des services de base**. Et une satisfaction **progressive**, pas binaire.

| Exigence | État |
|---|---|
| Nourriture | tenu |
| Eau | tenu |
| Logement (capacité) | tenu |
| Une catégorie de biens | **absent** — aucune ressource de biens n'existe |
| Services de base | **absent** — aucun bâtiment de service |
| Satisfaction progressive (0–100, effets graduels) | **absent** — deux états : nourri / non nourri |

C'est l'écart le plus lourd : il touche la boucle entière, pas un bâtiment.

## 3. Population (01 §7, 02 §3–§4)

Cible de l'échelle MVP : **~100 habitants**, atteinte par la croissance, à partir
d'un jour 0 de 10.

Avant D3, le build plafonnait à **60** parce que le logement se payait en
pièces : le plafond était le financement, pas une décision de design
(`docs/rebalance/v0.1/DIAGNOSIS-POPULATION-PLATEAU.md`).

Depuis D3 (20/11), le logement se paie en planches : le frein n'est plus
l'argent mais la **main-d'œuvre**. Mesure : 28 colons à 1 500 ticks, et 78 si
l'atelier produit 2 planches/tick (fiche D3 §7.8). L'eau et la nourriture
consomment à elles deux environ un ouvrier par habitant, donc il ne reste
personne pour l'industrie qui fabrique les planches. Le plafond ne peut pas être
relevé sans trancher le débit de l'atelier.

## 4. Ressources (02-MVP §5)

| Ressource du MVP | État |
|---|---|
| Céréales | tenu (ressource `food`) |
| Poisson | absent — la liste est « par exemple », donc non bloquant |
| Eau | tenu |
| Bois | tenu (+ planches) |
| Pierre | tenu — depuis le 20/11 l'entrepôt coûte 8 pierres ; la carrière, elle, reste payable en planches seules (amorçage) |
| Biens / matériaux de base | **absent** (hors planches, qui ne servent qu'à construire) |
| Énergie | non requise par la transition d'âge retenue |
| Argent | tenu |

## 5. Bâtiments (02-MVP §6)

| Famille demandée | État |
|---|---|
| Logement | tenu |
| Ferme | tenu |
| Pêcherie | **absent** |
| Puits / eau | tenu |
| Extraction du bois | tenu |
| Extraction de la pierre | tenu — la pierre sert désormais à l'entrepôt |
| Atelier / transformation | tenu |
| Entrepôt | tenu (non-décision, voir §6) |
| Marché / commerce de base | **absent en tant que bâtiment** — le commerce passe par l'atelier |
| École / éducation de base | **absent** |
| Santé / service de base | **absent** |
| Route | tenu |
| Espace vert | tenu (parc) |

Neuf bâtiments existent : logement, ferme, puits, atelier, bûcheron, carrière,
centre de colonie, parc, entrepôt. La liste du MVP en demande treize familles.

## 6. Règles de design contredites par le build

| Règle (03-DESIGN-RULES) | Contradiction mesurée |
|---|---|
| 8 — une nouvelle mécanique exige une décision du joueur | l'entrepôt achète de la capacité sans main-d'œuvre ni emplacement (audit 2026-11-12, F16) |
| 07-PROGRESSION §6 — éviter que la majorité des technos soit un simple bonus de production | les neuf technos coûtent de 50 à 1 200 pièces : sept ajoutent +1 par bâtiment (dont la techno de puits, retirée du catalogue), deux élargissent le rayon logistique. Aucune n'ouvre une méthode, une substitution ou un bâtiment |

## 7. Ce qui est hors périmètre MVP (à ne pas construire maintenant)

- factions jouables (07 §11) ;
- âges 4 à 9 (01 §12) ;
- civilisations extérieures et commerce BOT (01 §15, 08 §10) ;
- expéditions de colons (01 §7) ;
- marché régional à prix dynamiques (01 §10, 08 §10) ;
- spécialisation de civilisation (07 §7).

L'âge 3, déjà présent, est une avance sur le périmètre : il ne bloque rien, mais
il ne doit pas servir de prétexte pour repousser les manques ci-dessus.

## 8. Ordre de reprise proposé (dépendances, pas priorités)

> Le détail exécutable, phase par phase, avec critères d'acceptation et
> registre des écarts, vit dans [`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md).
> Le §8 ci-dessous en donne seulement l'ordre.

1. ~~**La pierre** — soit lui donner un usage réel, soit la retirer du
   catalogue.~~ **Fait le 20/11** : l'entrepôt coûte 8 pierres, la carrière
   n'en prend pas, la règle 9 est respectée (fiche D3 §7, mesuré §7.8). Ce qui
   reste de D3 est la question de la population ci-dessous.
2. **Le plafond de population** — sans lui, les 100 habitants restent hors
   d'atteinte, et toute nouvelle ressource sera produite pour une ville qui ne
   grandit pas.
3. **Les besoins : biens puis services** — c'est le changement structurel :
   catégories de besoins, satisfaction progressive, effets graduels. À faire une
   catégorie à la fois, pas les deux d'un coup.
4. **Les bâtiments manquants** — marché, école, santé, pêcherie. Chacun ne vaut
   d'être ajouté qu'après l'étape 3, sinon il n'a rien à satisfaire.
5. **Les technos** — les reformuler en méthodes (nouveau bâtiment, substitution,
   capacité) plutôt qu'en +1 par bâtiment.
6. **L'entrepôt** — en faire une décision ou l'assumer comme capacité pure. C'est
   la fiche D4 déjà ouverte.

## 9. Ce que ce registre change pour le rééquilibrage en cours

D1 (techno de puits hors catalogue) et D2 (rendement nominal) restent valides :
ils portent sur une mécanique du MVP. D3, D4 et D5 cessent d'être des
« améliorations » optionnelles : **ce sont les manques du MVP d'origine**, dans
l'ordre ci-dessus. Le rééquilibrage n'est donc pas un chantier parallèle, c'est
la façon de fermer les écarts.

## 10. Points encore ouverts avec le propriétaire

- ~~La pierre : usage réel, ou retrait ?~~ **Tranché le 20/11 : usage réel.**
- Le débit de l'atelier : 1 ou 2 planches/tick ? (il décide du plafond de
  population, fiche D3 §7.8)
- Les biens : quelle catégorie en premier, et à quel âge ?
- Les services : école et santé servent-ils une seule jauge, ou deux besoins
  distincts ?
- La satisfaction progressive : cinq bandes (08 §7) ou trois ?
- Les 100 habitants : cible du MVP, ou simple ordre de grandeur ?
