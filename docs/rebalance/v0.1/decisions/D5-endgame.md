# D5 — Destination de la partie : quel endgame, et quelle défaite ?

Statut : **ouverte** — décision du propriétaire du design (P3 de la roadmap).
Date : 18 novembre 2026.
Voir : `../GAME-DESIGN-PROGRESSION.md` §3 (contrat des âges), `D3-stone.md` (projet final), `D4-money-sinks.md` (ce qu'un endgame ne doit pas être).
Objet : décider comment une partie se termine, et si elle peut être perdue.

## 1. Ce qui est vérifié dans le code

| Fait | Détail | Source |
|---|---|---|
| Âges | `AGE_NAMES` définit 1, 2, 3 — et rien d'autre | `content/progression.ts` |
| Âge 3 | « Age of Prosperity », jeu de jalons pop 20 / 75 nourriture / 30 bâtiments / 20 résidences | `content/progression.ts` |
| Transition depuis l'âge 3 | `applyAdvanceAge` fait `state.age += 1` **sans borne** : l'âge 4 existe comme état, sans nom ni jalons, et `canAdvanceAge` devient ensuite faux (jeu vide) | `commands.ts`, `progression.ts` |
| Victoire | **aucune** condition de victoire, aucun score, aucun état terminal | — (aucune occurrence dans `src/`) |
| Défaite | **aucune** condition de défaite ; la population peut tomber à 0 sans que rien ne se termine | — |
| Signaux existants | alertes d'état (eau, air, famine), jauge de pression hydrique, départs de colons | `queries/analysis.ts`, `water.ts` |
| Doctrine écrite | « une famine doit casser quelque chose, jamais infliger une défaite que le joueur n'a pas choisie » | `population.ts` |

Conclusion : la partie n'a **ni fin, ni échec, ni score**. L'âge 3 est un
embranchement sans suite, et l'âge 4 est un état fantôme qu'aucune interface ne
sait nommer.

## 2. Ce que l'endgame ne doit pas être

Trois formes sont exclues par les mesures du dossier :

1. **Accumuler de la monnaie.** La trésorerie finale mesurée est de 5 968 pièces
   *après avoir acheté tout le catalogue* — un objectif « atteindre N pièces »
   serait atteint sans jouer, ou forcerait à retirer les puits de dépense (D4).
2. **Atteindre une population arbitraire.** Le plafond de 60 observé est un
   plafond de **financement du logement**, pas une loi ; les 86 colons de la ligne
   de croissance sont un **plafond du harnais** (`growthCap`). Un objectif
   « population 60 » mesurerait donc une politique de construction, pas une
   réussite de colonie.
3. **Tenir N ticks.** Un chronomètre récompense l'inaction : la ligne témoin
   survit 1 500 ticks avec 1 planche et 0/4 ateliers.

## 3. Options

### A — Objectif de développement multicritère

« Soutenir une population cible **avec** un équilibre tenu (nourriture, eau, air),
une chaîne industrielle active et les jalons de l'âge 3, pendant N ticks
consécutifs. »

- Mobilise : production, staffing, environnement, logistique, progression,
  économie (l'entretien doit rester payable).
- Mesurable : tous les termes sont des faits canoniques déjà exposés par le tick.
- Risque : un objectif à plusieurs termes est difficile à lire dans l'interface ;
  il faut une surface qui montre « ce qui manque », sinon le joueur ne sait pas
  pourquoi il n'a pas gagné.
- Coût : aucun système nouveau, un agrégat de conditions existantes.

### B — Projet final (chantier à construire)

Un grand ouvrage à payer et à staffer (monument, aqueduc, grand atelier) dont
l'achèvement termine la partie. C'est la variante qui donnerait un usage à la
pierre (D3, option A5).

- Mobilise : industrie (planches/pierre), logistique, main-d'œuvre.
- Risque : **accumulation déguisée** — si le projet n'est qu'un coût, il se
  résume à attendre ; s'il exige un débit soutenu, il devient un objectif de
  production (donc A avec un habillage).
- Coût : contenu nouveau (bâtiment + jalons + interface).

### C — Résilience

Survivre à une série d'événements imposés (sécheresses, fermetures de routes) en
gardant la population et les stocks au-dessus d'un seuil.

- Mobilise : stocks, réserve hydrique, diversité de production.
- Avantage : c'est le seul modèle qui rend utiles les mécaniques de crise déjà
  écrites (pression 75, réserve, facture d'urgence) — aujourd'hui inutilisées par
  défaut, les événements étant désactivés en sandbox.
- Risque : dépend entièrement d'un système que **personne n'a mesuré** dans ce
  dossier (aucun scénario d'événements n'a été joué) ; et il transforme un jeu de
  construction en jeu de survie, ce qui est un changement de genre.

### D — Fin ouverte, assumée

Aucun endgame : la partie est un bac à sable qui s'arrête quand le joueur veut.

- Avantage : honnête, zéro travail, cohérent avec le mode sandbox actuel.
- Inconvénient : la roadmap (phase 4–5) et la fiche de progression posent la
  destination comme un objectif ; l'assumer ferme le sujet au lieu de le résoudre.

## 4. Défaite et stagnation

| Modèle | Ce qu'il produit | Risque |
|---|---|---|
| Aucune défaite (état actuel) | la colonie peut s'éteindre sans que la partie le dise | absurde à l'écran : population 0 et le jeu continue |
| Défaite à population 0 | un état terminal lisible, gratuit à implémenter | punit une partie déjà perdue ; aucune décision supplémentaire |
| Défaite à stagnation (population constante N ticks) | signale l'échec avant l'extinction | contredit la doctrine écrite : une alerte ne doit pas être prescriptive, et une colonie stable n'est pas un échec |

Recommandation sur ce point : **état terminal à population 0 uniquement**, et
rien d'autre. C'est le seul cas où « continuer » n'a aucun sens, il ne dépend
d'aucune valeur de balance et il ne juge pas le style de jeu.

## 5. Recommandation argumentée

**Retenir A (objectif de développement multicritère) comme destination, avec C
comme variante à mesurer, et n'implémenter que l'état terminal à population 0.**

Raisons :

- A est le seul modèle dont **tous les termes sont déjà mesurables sur le tick** :
  aucun système mort n'est requis, aucune constante nouvelle n'est nécessaire ;
- B échoue au test « est-ce autre chose qu'une accumulation ? » tant que la pierre
  n'a pas de fonction (D3) — il en dépend, il ne peut donc pas la précéder ;
- C est séduisant mais repose sur des scénarios d'événements **non mesurés** dans
  ce dossier ; le proposer comme destination avant de les avoir joués serait
  exactement l'erreur que le dossier reproche aux documents antérieurs.

Condition de mise en œuvre : la destination doit être **visible et expliquée**
(« il manque 12 nourriture et 2 technologies »), sinon elle ne se distingue pas
d'un mur.

## 6. Données manquantes

1. Une ligne de 3 000 ticks : aucune n'a été jouée dans ce dossier (les mesures
   s'arrêtent à 1 500), donc on ne sait pas si une colonie de 86+ tient.
2. Un scénario d'événements joué de bout en bout : la résilience (C) n'a aucune
   base mesurée.
3. Le comportement d'un joueur humain devant un objectif multicritère : aucune
   observation.
4. L'état fantôme de l'âge 4 : personne n'a vérifié ce que l'interface affiche
   quand `state.age` vaut 4 (aucun nom dans `AGE_NAMES`).
