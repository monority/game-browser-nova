# NOVA — Fiches de décision

Version : 0.1
Date : 18 novembre 2026 (mise à jour le 19 novembre 2026 : D1 tranchée, D2 mesurée)
Périmètre : décisions de game design du dossier de rebalance — ouvertes ou
récemment tranchées.

## À quoi sert ce dossier

`../` établit des faits et une roadmap ; ces fiches préparent des **arbitrages**.
mesuré, les options comparables et ce qui manque pour trancher. Tant qu'une fiche
mesuré, les options comparables et ce qui manque pour trancher. Tant qu'une fiche
reste ouverte, aucune valeur de balance ne doit être arrêtée sur son sujet.

Chaque fiche distingue systématiquement :

- **vérifié (code)** — lu dans le dépôt à la date indiquée ;
- **mesuré** — observé sur le tick réel, seed et politique nommés ;
- **dérivé** — calculé à partir d'une mesure, pas observé ;
- **hypothèse** — proposition à tester, jamais une valeur acquise ;
- **donnée manquante** — ce qu'aucune source ne fournit aujourd'hui.

## Les décisions, dans l’ordre de dépendance

| # | Fiche | Sujet | Dépend de | Bloque |
|---|---|---|---|---|
| D1 | `D1-option-c.md` | Sort de l'option C (technologie de puits) — **tranchée le 19/11** : hors catalogue livré (`shipped: false`) jusqu'à D2/D4 | — | D2, la trésorerie, la progression |
| D2 | `D2-well-build-policy.md` | Politique de construction des puits (`ceil(N/3)` proposé) — **mesurée le 19/11** : la variante coûte sans rendre sur la loi livrée (§5) | D1 | l'accès à l'industrie avant 13 colons |
| D3 | `D3-stone.md` | Destin de la pierre et de la carrière | — | l'économie de la planche, les technologies d'extraction |
| D4 | `D4-money-sinks.md` | Débouchés monétaires | D1, D3 | l'équilibre des revenus |
| D5 | `D5-endgame.md` | Destination de la partie | D4 | la sortie de phase 4/5 |
| D6 | `D6-workshop-rate.md` | Débit de l’atelier (**tranchée** le 20/11 : 2 planches/tick) | D3 | le plafond industriel, la croissance, O5 |
| W1 | `W1-workforce-allocation.md` | Dotation et allocation de la main-d’œuvre — **faits mesurés le 20/11, décision ouverte** ; la fiche répond aux livrables du dossier `../GAME-DESIGN-WORKFORCE-ALLOCATION.md` | D6 | O5, D4, D5 |
| W1-C1 | `W1-conditional-allocation-experiment.md` | Allocation conditionnelle bûcheron / atelier — **expérience mesurée le 20/11, preuve historique** (reproduite à l'identique par la loi) | W1, D6 | — |
| W1-FINAL | `W1-conditional-workforce-allocation.md` | Allocation conditionnelle — **règle officielle livrée le 20/11** : algorithme, réservation du bois, causes d'inactivité, inspecteur, résultats | W1, W1-C1, D6 | D4, langue des libellés, camp sans gisement |

L'ordre est un ordre de **dépendance**, pas d'urgence : D3 est indépendante de D1
et peut être tranchée en parallèle. Ne pas résoudre deux décisions avec une seule
mécanique (un puits monétaire qui serait aussi une condition de victoire, par
exemple) : chaque fiche doit rester lisible seule.

## Invariants que toute option doit préserver

1. Déterminisme : même état + même seed → même résultat, sans exception.
2. Une seule source de vérité par loi, partagée par le tick et les prévisions.
3. Ordre de staffing d'ADR-016 (ferme 0 → puits 1 → reste 2, réserve hydrique en
   bande grave) : non renégocié par ces fiches.
4. Émissions liées à l'**activité** (Step083), pas au staffing.
5. Conservation des ressources : aucune option ne crée de matière sans coût.
6. Crise hydrique : seuil grave à 75 %, dégradation graduelle, récupération
   graduelle, réserve bornée par le besoin.
7. Marché d'âge 2 retiré (Step065) : la monnaie ne vient pas du grenier.
8. Aucune constante « définitive » sans scénario chiffré.

## Ce que ces fiches n'autorisent pas

Elles n'autorisent aucune implémentation. Une fiche ouverte + une valeur proposée
ne font pas une décision : il faut un arbitrage explicite, daté, et une mesure de
sortie sur le tick réel.
