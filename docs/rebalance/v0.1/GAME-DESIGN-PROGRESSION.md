# NOVA — Game design : progression et fin de partie

Version : 0.1  
Statut : cadrage à arbitrer

## 1. Problème

La progression actuelle rapportée atteint les âges 2 et 3 très rapidement avec une stratégie orientée workshops. Après l'âge 3 :
- une nouvelle avancée peut créer un âge 4 inexistant ;
- aucun contenu de bâtiment n'est réellement verrouillé par âge dans le catalogue ;
- les technologies restantes sont achetées sans contrainte grâce à l'excédent monétaire ;
- aucune condition de victoire, défaite ou fin de partie n'existe.

La progression est donc essentiellement un compteur, sans transformation suffisante des possibilités du joueur.

## 2. Objectifs

- Chaque âge doit ouvrir une capacité ou un choix de jeu identifiable.
- Les technologies doivent résoudre un problème, créer un arbitrage ou modifier une stratégie.
- Les coûts de progression doivent être cohérents avec la capacité économique réelle.
- Le dernier âge doit mener à un objectif terminal clair.
- Les actions impossibles doivent être bloquées dans le domaine, pas seulement masquées dans l'interface.

## 3. Contrat des âges

Décisions à prendre avant implémentation :
- nombre d'âges définitif ;
- conditions d'accès à chaque âge ;
- contenu déverrouillé par âge ;
- technologies disponibles par âge ;
- coût et délai éventuels ;
- conditions d'accès au dernier objectif ;
- comportement lorsque le joueur tente d'avancer au-delà du dernier âge.

Règle de sûreté à imposer : l'âge courant ne peut jamais dépasser le dernier âge déclaré. La validation doit être portée par le domaine et couverte par des tests de frontière. L'interface doit refléter le même contrat.

Ne pas ajouter un âge 4 par défaut pour corriger le dépassement : il faut d'abord décider si un quatrième âge a une fonction de gameplay.

**Vérifié le 18 novembre 2026 (code).** Le contrat réellement appliqué aujourd'hui :

| Transition | Jalons lus | Contenu |
|---|---|---|
| âge 1 → âge 2 | `AGE_MILESTONES[1]` | pop 8, 8 bâtiments opérationnels, 30 nourriture, 3 technologies |
| âge 2 → âge 3 | `AGE_MILESTONES[2]` | pop 15, 14 bâtiments, **60 nourriture, 5 technologies** |
| après l'âge 3 | `AGE_MILESTONES[3]` | pop 20, 75 nourriture, 30 bâtiments, 20 résidences — **aucune transition** : il n'existe pas d'âge 4 nommé |

`canAdvanceAge` lit le jeu de l'âge **courant** ; `applyAdvanceAge` fait
`state.age += 1` **sans borne**, donc un clic sur « avancer » depuis l'âge 3
produit un âge 4 sans nom ni jalons (`AGE_NAMES` ne définit que 1 à 3). Aucun
score, aucune victoire, aucune défaite n'existent dans le code. Options de
destination : `decisions/D5-endgame.md`.

## 4. Déblocages réels

Le catalogue de bâtiments doit être la source de vérité des prérequis. Si `requiredAge` est conservé :
- chaque bâtiment concerné doit avoir une valeur cohérente ;
- les bâtiments sans prérequis doivent être explicitement représentés ;
- palette, panneau de détails, validation de placement et commandes doivent utiliser la même règle.

Si le système de déblocage n'est pas retenu, retirer proprement la dépendance morte après vérification des usages. Ne pas maintenir une propriété de catalogue sans effet réel.

Critères :
- un bâtiment verrouillé est identifiable ;
- son prérequis est affiché ;
- le placement et les commandes le refusent de manière cohérente ;
- les tests couvrent les frontières d'âge.

## 5. Technologies

Une technologie doit répondre à au moins un objectif :
- améliorer une capacité limitée ;
- réduire un coût ou un risque ;
- ouvrir une nouvelle chaîne ;
- améliorer la résilience ;
- proposer un arbitrage entre plusieurs stratégies.

Éviter les technologies qui ne font qu'augmenter une statistique déjà excédentaire.

Pour chaque technologie, documenter :
- problème de gameplay ciblé ;
- effet exact ;
- coût ;
- prérequis ;
- moment où elle devient utile ;
- effet attendu sur une partie de référence ;
- risque de rendre une autre stratégie dominante.

## 6. Définir la fin de partie

La fin de partie n'est pas encore décidée. Trois directions peuvent être comparées :

### Option A — Objectif de développement

Atteindre une capacité de colonie (population, infrastructures, services, production) et la maintenir pendant une durée définie.

### Option B — Projet final

Financer et construire un projet majeur qui exige plusieurs chaînes de production et une économie stable.

### Option C — Résilience

Survivre à une période de contraintes croissantes avec des seuils mesurables de population, stocks, eau, finances et qualité de vie.

Ces options peuvent être combinées, mais il faut éviter un objectif final qui se résume à accumuler de la monnaie.

## 7. Défaite et stagnation

Le build mesuré ne présente pas de véritable défaite : la famine réduit la population, la soif ne descend pas sous un plancher de 2 et la trésorerie peut se figer à zéro. Le joueur peut être bloqué sans perdre.

Décider explicitement :
- quelles conditions sont récupérables ;
- quelles conditions déclenchent une crise ;
- si une défaite est souhaitée ;
- comment signaler une partie en stagnation ;
- si un état terminal est réversible ou définitif.

Ne pas ajouter une défaite punitive sans objectif de jeu clair. Une défaite doit découler de règles prévisibles et être annoncée avec suffisamment de lisibilité.

## 8. Critères d'acceptation

- Impossible d'avancer au-delà du dernier âge.
- Chaque âge apporte au moins un changement de gameplay vérifiable.
- Chaque déblocage est effectif dans toutes les voies d'entrée (UI, commande, validation).
- Les technologies ont un effet utile et mesurable.
- L'objectif final est atteignable par une économie fonctionnelle.
- Les états de victoire, défaite ou continuation sont explicites.
- Les prévisions et le tick utilisent les mêmes règles de progression lorsque pertinent.
