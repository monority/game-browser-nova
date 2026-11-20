# NOVA — Dossier de rebalance

Version : 0.1  
Date de référence : 18 novembre 2026  
Référence gameplay : `main` — `88900bc` (dossier 0.1 établi sur `94cbff2`)  
Statut : cadrage documentaire + cinq fiches de décision ouvertes (`decisions/`) ; une option (C) a été prototypée et mesurée le 18 novembre 2026 (`GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8), sans décision d'adoption

## Objectif

Ce dossier transforme le bilan de gameplay du 18/11/2026 en un cadre de conception et une roadmap de rebalance. Il vise à rétablir une boucle économique lisible, à rendre les chaînes de production réellement accessibles, à donner une fonction à la progression et à définir une fin de partie.

Le dossier distingue systématiquement :
- **Mesuré** : résultat observé dans le build de référence.
- **Règle existante** : comportement lu dans les lois du domaine et rapporté dans l'audit.
- **Décision de conception** : direction à arbitrer avant implémentation.
- **Hypothèse** : piste à tester, jamais une valeur acquise.

## Documents

| Document | Rôle |
|---|---|
| `BALANCE-BASELINE.md` | État mesuré, scénario de référence, symptômes et limites |
| `GAME-DESIGN-WORKFORCE.md` | Main-d'œuvre, affectations et marge de travail (mesure de l'ordre de staffing, 18/11) |
| `GAME-DESIGN-WORKFORCE-ALLOCATION.md` | Dossier du propriétaire (20/11) : dotation et allocation de la main-d'œuvre, trois modèles, décision ouverte |
| `GAME-DESIGN-ECONOMY-RESOURCES.md` | Boucles de ressources, industrie, stockage et monnaie |
| `GAME-DESIGN-PROGRESSION.md` | Âges, technologies, déblocages et fin de partie |
| `REBALANCE-ROADMAP.md` | Ordre de travail, dépendances, gates et critères de sortie |
| `GAME-DESIGN-INDUSTRY-BEFORE-13.md` | Étude comparative : rendre la chaîne accessible avant 13 colons (option C prototypée et mesurée le 18/11, §8 ; aucune adoptée) |
| `DIAGNOSIS-POPULATION-PLATEAU.md` | Diagnostic du plafond observé à 60 colons |
| `decisions/` | Fiches de décision : option C, politique des puits, pierre, monnaie, endgame, débit d'atelier, les faits de main-d'œuvre (`W1-workforce-allocation.md`) et la loi d'allocation livrée (`W1-conditional-workforce-allocation.md`) |

## Principes non négociables

1. Préserver le déterminisme de la simulation.
2. Conserver une seule source de vérité pour chaque loi de simulation et ses prévisions.
3. Ne pas corriger un problème économique en dégradant artificiellement une autre ressource.
4. Ne pas introduire de constantes définitives sans scénarios chiffrés et tests de gameplay.
5. Distinguer une production possible, une production effectivement staffée et une production réellement utile.
6. Ne pas confondre progression temporelle, progression économique et progression de contenu.
7. Une phase n'est validée que par des résultats observés en partie, pas par le seul passage des tests automatisés.

## Référence et limites

Les mesures proviennent du bilan de gameplay fourni pour le 18/11/2026 : 3 000 ticks, build `94cbff2`, seed par défaut, politique de jeu scriptée via la couche de commandes et le tick réel. Elles n'ont pas été reproduites indépendamment dans ce dossier.

Le scénario est reproductible dans le cockpit selon le rapport, mais il ne remplace pas des tests avec plusieurs seeds, plusieurs styles de jeu et des joueurs humains.

**Mise à jour du 18/11/2026.** Les mesures du §8 de `BALANCE-BASELINE.md`, les
§10 et §9 de `GAME-DESIGN-WORKFORCE.md` et `GAME-DESIGN-ECONOMY-RESOURCES.md`, ainsi
que les deux fiches ajoutées, ont été exécutées sur cette machine avec le build
`88900bc` ; les mesures du §1 à §7 restent, elles, rapportées. Le prototype de
l'option C (`GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8) est, lui, mesuré sur l'arbre de
travail au-dessus de `88900bc`, non commité. Les documents distinguent désormais
explicitement les trois origines.
