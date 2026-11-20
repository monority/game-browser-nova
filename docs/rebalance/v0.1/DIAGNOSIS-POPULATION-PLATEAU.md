# NOVA — Diagnostic : plafond de population à 60

Version : 0.1
Date : 18 novembre 2026
Build : `88900bc`
Statut : **diagnostic, aucune correction demandée ni appliquée**

## 1. Question

La comparaison du 18/11 montre deux lignes gouvernées identiques à l'exception de
l'ordre de staffing : l'une finit à **86 colons**, l'autre à **60**. Pourquoi la
seconde s'arrête-t-elle à 60 ?

Ce document ne corrige rien. Il trace les conditions d'admission, les ressources, les
bâtiments, les travailleurs et les stocks autour de l'arrêt, puis distingue le type
de plafond.

## 2. Méthode

Le diff de la variante « extraction prioritaire » n'est plus dans Git. Il a donc été
**reconstruit** à l'identique sur le plan des règles (camp et carrière en classe 2,
atelier en classe 3) dans un worktree jetable, supprimé après la mesure, puis exécuté
sur le même gouverneur de référence (`playGame(-1, false, 240, 86)`, 1 500 ticks) avec
une sonde qui relève à chaque tick : population, capacité de logement, nourriture,
eau, trésorerie, pollution, et postes staffés par type.

La reconstruction donne 36 planches de stock à t=1 500 là où la mesure d'origine en
donnait 27 : elle n'est pas une copie exacte du diff perdu. Les conclusions ci-dessous
ne reposent donc que sur des écarts **observés dans la reconstruction elle-même** et
sur les lois du code.

## 3. Ce qui est mesuré

Ordre de base (« base ») et extraction prioritaire (« variante ») :

| Tick | base pop/logement | base planches | base bois | base nourriture | variante pop/logement | variante planches | variante bois | variante nourriture |
|---:|---|---:|---:|---:|---|---:|---:|---:|
| 451 | 19/20 | 3 | 74 | 108 | 24/24 | 42 | 24 | 85 |
| 601 | 26/26 | 3 | 74 | 74 | 35/36 | 42 | 24 | 74 |
| 901 | 42/42 | 1 | 74 | 63 | 49/50 | 38 | 24 | 60 |
| 1 201 | 61/61 | 1 | 74 | 69 | 59/60 | 38 | 24 | 116 |
| 1 500 | 86/86 | 1 | 74 | 32 | 60/60 | 36 | 24 | 121 |

Les deux lignes : âge 2 disponible à t=321 (`ready@321`, `age2@321`, `pop12@328`),
âge 3 jamais satisfait avant t=1 500 (jalons d'accès : 60 nourriture et
5 technologies, `AGE_MILESTONES[2]` ; ces deux lignes finissent à 32 et 4).

Autour du dernier accroissement de la variante (t=1 220) :

| Tick | pop/logement | nourriture | eau | trésorerie | pollution | fermes staffées | puits staffés | camp | ateliers | libres |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 219 | 59/60 | 172 | 0 | 35 | 45 | 17 | 30 | 0 | 0 | 12 |
| 1 234 | 60/60 | 194 | 1 | 50 | 45 | 17 | 30 | 0 | 0 | 13 |
| 1 243 | 60/60 | 203 | 1 | 59 | 45 | 17 | 30 | 0 | 0 | 13 |
| 1 246 | 60/60 | 190 | 1 | 37 | 45 | 17 | 30 | 0 | 0 | 13 |
| 1 500 | 60/60 | 121 | 1 | 37 | 45 | 17 | 30 | 0 | 0 | 13 |

## 4. Ordre causal

1. **Aucun plafond codé.** `updatePopulation` ne contient aucune borne numérique : la
   seule comparaison est `population < housingCapacity(state)`, et la perte de
   population ne vient que de la famine (1 colon/tick non nourri) et des départs
   hydriques. Il n'existe pas de constante « 60 » dans le domaine.
2. **La croissance est limitée par le logement, dans les deux lignes.** Chaque
   échantillon vérifie `population == capacité de logement` (sauf une unité de
   vacance). Le chiffre final est donc **le nombre de résidences que l'économie a
   payées**, pas une propriété de la démographie.
3. **La variante n'a pas financé la 61e résidence.** À partir de t≈1 220, la
   trésorerie oscille entre 35 et 59 ; elle franchit 60 (le seuil de la politique de
   référence pour construire), puis retombe à 37 dès le tick suivant. Chaque
   franchissement est dépensé par une option **placée avant la résidence** dans
   l'ordre de la politique : ferme de réserve, puits (`ceil(N/2)+1`), entrepôt, parc.
   La résidence, septième dans cet ordre, ne gagne jamais le tick.
4. **Ce n'est ni la nourriture, ni l'eau, ni l'air.** Au plateau : 121 à 203
   nourriture en stock, eau servie = 60 pour 60 colons (30 puits × 2), qualité d'air
   55 pour un seuil d'admission à 25.
5. **Ce n'est pas la main-d'œuvre.** 13 colons n'ont aucun poste : ni camp actif, ni
   atelier staffé. La variante a donc arrêté sa croissance **avec des bras
   disponibles**, ce qui exclut la cause « le camp garde le dernier ouvrier »
   consignée dans la première note.

## 5. Type de plafond

| Type | S'applique ici ? | Preuve |
|---|---|---|
| Plafond codé | **Non** | `updatePopulation` : aucune borne ; seuls les jalons d'âge et la capacité de logement sont numériques |
| Plafond économique | **Oui** | trésorerie 35–59 au plateau, sous le seuil de construction de la politique ; 60 résidences payées |
| Plafond de ressources | Non au plateau | nourriture 121, eau exactement servie ; il s'applique ailleurs (voir §7) |
| Plafond de main-d'œuvre | **Non** | 13 travailleurs libres |
| Blocage indirect | **Partiel** | le plafond économique est produit par l'**ordre des options de la politique de référence**, pas par une règle du jeu |

## 6. Pourquoi 60 et pas 86, à règles identiques

Les deux lignes appliquent les mêmes lois ; elles divergent par la **trajectoire
industrielle** :

- la variante produit des planches tôt (42 contre 3 à t=451) et croît plus vite au
  début (24 contre 19 colons à t=451) ;
- la base laisse 74 bois dormir, ne produit qu'une planche, mais finance ses
  résidences jusqu'au plafond de 86.

Le paramètre qui décide n'est donc pas l'ordre de staffing en soi, mais **le moment
où la trésorerie cesse de dépasser le seuil de construction du logement**. Une valeur
de 60 n'est pas une cible de design : elle dépend de l'historique de trésorerie, de la
taille du stock et de l'ordre des options d'une politique particulière.

## 7. Données manquantes

1. **Le diff d'origine de la variante** : disparu (aucun stash, aucun commit). La
   reconstruction est fidèle sur les règles, pas sur les valeurs (36 contre 27
   planches).
2. **Une politique qui finance le logement avant la réserve de fermes** : sans elle,
   on ne peut pas savoir si 60 est un artefact de politique ou une contrainte
   économique réelle du jeu. C'est la mesure qui manque pour conclure.
3. **Le comportement au-delà de ~70 bâtiments** : le gouverneur documente ailleurs un
   blocage d'admission par la qualité de l'air (qualité 21 contre seuil 25, pollution
   79, `Step074`). Ce seuil n'est pas atteint au plateau mesuré (qualité 55) mais il
   redeviendrait pertinent plus haut ; non mesuré ici.
4. **Le cas `S(N,2) > N`** (11, 13, 15 colons) : la colonie vit alors sur son stock,
   donc son plafond dépend du stock initial et de la capacité du grenier. Aucune
   mesure dédiée n'existe.

## 8. Ce qu'il ne faut pas conclure

- **Ne pas ajouter de plafond de population** : il n'en existe aucun à corriger.
- **Ne pas viser 60** comme valeur d'équilibrage ; ce n'est pas une constante.
- **Ne pas corriger par la nourriture ou l'eau** : ce n'est pas le verrou au plateau.
- **Ne pas corriger par l'ordre de staffing** : la mesure montre 13 travailleurs
  libres, l'ordre n'a rien à y faire.

## 9. Prochaine mesure, si le sujet est rouvert

Rejouer la même sonde avec une politique dont l'ordre d'options place la résidence
avant la réserve de fermes, sur les deux ordres de staffing. Si la population dépasse
alors 60 dans les deux cas, le « plafond à 60 » est un artefact de politique et non
un fait du jeu — et seule la question de la marge industrielle
(`GAME-DESIGN-INDUSTRY-BEFORE-13.md`) reste ouverte.
