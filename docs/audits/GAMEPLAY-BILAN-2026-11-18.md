# NOVA — bilan complet gameplay / code / jouabilité — 2026-11-18

Tout ce qui suit est mesuré sur cette session, sur le code de `main` (`94cbff2`).
Aucun chiffre n'est repris de `STATE.md` ni d'un rapport antérieur.

## 1. Méthode

| Moyen | Ce qu'il mesure |
| --- | --- |
| Joueur de mesure jetable (vite + `src/`, supprimé après) | parties réelles : `applyCommand` + `stepTicks`, mêmes phases que le jeu |
| `tools/agent/run.mjs` (cockpit) | états intermédiaires, économie ligne à ligne |
| Lecture du domaine | les lois, les constantes, ce qui est inatteignable |
| `tools/agent/evaluate.mjs` (navigateur) | 634 draw calls, 598 géométries, 27,95 ms/mise à jour |

Dimensions du dépôt : **7 763 lignes TS / 54 fichiers**, dont **3 254** dans `src/domain`.
Le tick est déterministe, 11 phases, ADR-001/002.

## 2. La boucle de jeu réelle

Le joueur ne fait que quatre choses : **poser un bâtiment** (25 pièces, 2 ticks de
chantier), **tracer une route** (5 pièces/case), **militer/raser** (gratuit, sans remboursement),
**rechercher une techno** (50 / 150 / 800 / 1 200). Tout le reste est automatique :
la main-d'œuvre s'assigne toute seule, les âges s'ouvrent sur des jalons, les alertes parlent.

Ouverture livrée (D2) : **10 colons**, 10 résidences, 5 fermes, 5 puits, 2 ateliers,
1 parc, 1 centre ; trésorerie 100, nourriture 60, eau 40. Occupation : 5 fermes + 5 puits
= **10 postes = 10 ouvriers** ; les deux ateliers sont **vides**.

## 3. Ressources — les lois, telles qu'elles sont codées

| Ressource | Production | Consommation | Stockage | Note |
| --- | --- | --- | --- | --- |
| Nourriture | ferme **2/tick**, centre **1/tick** | **1/colon/tick** | 180 de base, +60/entrepôt | perte **3 %/tick** sur tout le stock |
| Eau | puits **2/tick** | 1/colon servi/tick | 80 de base, +40/entrepôt | jauge de pression 0–100 |
| Bois | camp **2/tick**, centre **1/tick** | 2 par planche | — | gisements finis (60 et 40) |
| Pierre | carrière **2/tick** | — | — | gisement fini (50) |
| Planches | atelier **1/tick** (2 bois) | 5 (carrière), 2 (entrepôt) | — | |
| Argent | taxes **1/hab/tick**, commerce **2/atelier connecté** (+1 avec Trade Routes), **+1/planche** | entretien **1/bâtiment actif** (résidences et centre exemptés), foule `floor((pop−10)/5)` | illimité | |

Conséquences mesurées :

- **Le stockage mord tout de suite** : à 12 fermes, le grenier est collé à 180/180 et la
  production est détruite chaque tick (alerte « Food storage full », niveau information).
- **La saison maigre fait son travail** : l'hiver (15 ticks sur 60) parque jusqu'à la moitié
  des fermes selon le remplissage ; oscillation mesurée **180 → 116 → 180** sur la même colonie.
- **L'eau ne se stocke pas utilement** : une colonie juste à l'équilibre finit chaque tick à
  0 eau en servant tout le monde (c'est voulu, `waterServed`), donc « water 0 » n'est pas une
  alerte. La jauge monte de 4/tick au black-out, un colon part tous les 10 ticks pleins,
  plancher à 2 habitants.
- **La famine ne tue jamais d'un coup** : 1 colon/tick, jamais d'écran de défaite.

## 4. Le défaut structurel : la main-d'œuvre est exactement saturée

C'est le point le plus important du bilan, et c'est arithmétique.

Il faut `ceil((N−1)/2)` fermes (2 nourriture chacune + 1 du centre) et `ceil(N/2)` puits
(2 eau chacun) pour `N` colons. Or :

```
ceil((N−1)/2) + ceil(N/2) = N   pour tout N
```

**À toute population, une colonie qui se nourrit et s'abreuve exactement n'a aucun ouvrier
libre.** Mesuré :

- t=5, pop 10 : 12 postes, **10 staffés** — 5 fermes et 5 puits, ateliers vides.
- t=305 : `wood 0, planks 0, stone 0` alors que le centre « collecte » 1 bois/tick.
- Un **camp de bûcherons posé à t=305** (accepté, payé) n'est **jamais staffé** : le bois
  reste à 0 pour toujours.
- Le centre est ancré en **(23,23)**, les gisements en **(4,4)**, **(18,6)**, **(7,18)** :
  son filet de 1 bois/tick ne touche aucun gisement, donc il produit **toujours 0**.

Donc la chaîne industrielle entière — bois → planches → carrière (5 planches) → pierre →
entrepôt (2 planches) — est **inatteignable dans le jeu livré**. Les planches n'apparaissent
que par accident, pendant les creux de population où un ouvrier se libère (c'est exactement
ce que le commentaire d'`economy.ts` appelle « planks 226, production 0 »).

Trois types de bâtiments sur neuf (camp, carrière, entrepôt) sont donc du **contenu mort**,
et deux (atelier, parc) ne vivent que par leur effet passif.

## 5. Économie : une seule stratégie domine, et elle contourne la main-d'œuvre

Ouverture mesurée, sans rien faire : taxes 10 + commerce 4 − entretien 13 = **+1/tick**.

| Action | Effet sur le net | Coût |
| --- | --- | --- |
| 1 ferme de plus | **+1 entretien → 0/tick** | 30 (avec route) |
| 1 atelier connecté | **+2 commerce −1 entretien = +1/tick** | 30 |
| 1 colon de plus (logement + ferme + puits) | +1 taxe −2 entretien = **−1/tick** | 75 |
| 1 parc | −1/tick (sauf besoin de pollution) | 25 |

Trois faits qui en découlent :

1. **Grandir appauvrit.** Chaque colon supplémentaire coûte 75 pièces et *baisse* le revenu
   de 1/tick. Les âges forcent la croissance par leurs jalons, pas l'économie.
2. **L'atelier est le seul moteur rentable, et il ne travaille pas.** Le commerce est
   volontairement indépendant du staffing (commentaire d'`economy.ts`) : 12 ateliers vides
   rapportent 24–36/tick. Mesuré à t=3000 : **12 ateliers, 0 planche produite, +13/tick**.
3. **L'équilibre à 0/tick est un piège silencieux.** Avec 6 fermes, 6 puits, 6 ateliers et
   4 parcs, la colonie est à **exactement 0/tick** et 11 pièces : plus rien n'est achetable,
   et **aucune alerte ne le dit** (`Budget` ne parle qu'en négatif, `Treasury frozen` qu'à 0).
   J'ai laissé tourner 800 ticks : rien ne bouge, aucun message.

Fin de partie mesurée (stratégie « ateliers ») : **pop 24, 12 ateliers, +13/tick,
33 893 pièces à t=3000**, grenier plein, plus rien à acheter. Le seul puits d'argent
(2 000 pièces de technos d'âge 3) est optionnel et se paie en 150 ticks.

## 6. Les âges : un sprint de deux minutes, puis un trou

Mesuré, en jouant les ateliers puis la croissance :

| Étape | Tick | Temps réel à 1× (2 ticks/s) |
| --- | --- | --- |
| Âge 1 (ouverture) | 0 | 0 |
| **Âge 2** | **153** | **77 s** |
| **Âge 3** | **229** | **115 s** |
| « Âge 4 » | 230 | 115 s |

- L'âge 1 dure 153 ticks, l'âge 2 seulement **76** : les jalons des deux âges sont les mêmes
  dimensions (population, bâtiments, nourriture), donc l'âge 3 s'ouvre presque aussitôt.
- **Le jeu laisse passer en « âge 4 »**, qui n'existe pas : `applyAdvanceAge` ne borne pas
  `state.age`, `AGE_NAMES[4]` est `undefined` (l'en-tête affiche « Age 4 (Age 4) »), les jalons
  sont vides, le bouton d'avance disparaît. C'est atteignable par un clic normal depuis l'âge 3.
- **Rien après.** Pas d'âge 4, pas de fin, pas de score, pas de condition de victoire ni de
  défaite. Le seul contenu post-âge 3 est deux technos à 800 et 1 200 pièces, que l'argent
  rend gratuit.
- **Aucun bâtiment n'est verrouillé par âge** : `requiredAge` n'est renseigné sur *aucune* entrée
  de `content/buildings.ts`, alors que la validation, le panneau et la palette en dépendent.
  Tout le système de déblocage est du contenu mort, et l'âge n'ouvre concrètement que des jalons.

## 7. Jouabilité : ce que le joueur comprend, et ce qu'il ne comprend pas

Ce qui marche : la palette + la ligne de statut disent quoi poser et où (« Placing Well —
click a free cell », « Well placed. »), les jalons sont lisibles ligne par ligne, les alertes
sont des états et non des ordres, et les prévisions (nourriture à X ticks, eau servie) sont
dérivées des mêmes fonctions que le tick — la prévision ne peut pas mentir.

Ce qui manque, mesuré :

- **L'ouvrier manquant n'est jamais expliqué.** Un puits ou un camp qui ne tourne pas est dit
  « sans route » mais jamais « sans ouvrier » : à 10 colons / 12 postes, la moitié des bâtiments
  est structurellement à l'arrêt et l'interface n'a qu'une ligne de ratio.
- **L'impasse économique est muette** (0/tick, 11 pièces, aucune alerte).
- **La chaîne du bois est morte sans le dire** : camp inerte, centre hors de portée, carrière
  et entrepôt inaccessibles — aucune alerte ne signale qu'aucun bois n'arrive.
- **Accessibilité** : 1 seul `aria-live`, aucun `role`, aucun `aria-label`, aucun `tabIndex`,
  la carte n'est utilisable qu'à la souris (audit du 17/11, inchangé).
- **Le rythme est lent pour qui ne connaît pas l'astuce des ateliers** : 25 pièces à +1/tick
  = un bâtiment toutes les 12 s à 1×, et il en faut trois par colon. La vitesse 8× (16 ticks/s)
  est le seul palliatif, et elle ne change pas les décisions.

## 8. Code : très bon, avec quatre trous de contenu

Ce qui tient : domaine pur (3 254 lignes) séparé du rendu (ADR-001), tick déterministe
(ADR-002), une seule source par loi (nourriture servie, pression, entretien, foule), prévisions
calculées avec les primitives du tick, 188 tests, zéro TODO, zéro `@ts-ignore`, sauvegardes
versionnées.

Les trous, tous vérifiés :

1. `requiredAge` jamais renseigné → déblocage par âge inopérant (§6).
2. `applyAdvanceAge` sans borne haute → « âge 4 » (§6).
3. Filet de bois du centre mort sur la carte livrée (§4).
4. Commerce indépendant du staffing (§5) — assumé par commentaire, mais c'est ce qui rend
   l'atelier rentable à vide et l'économie contournable.

## 9. Notes

| Dimension | Note | Pourquoi |
| --- | --- | --- |
| Boucle de jeu | **B−** | claire, deux gestes, mais un seul levier rentable |
| Ressources | **B** | lois cohérentes et prévisibles ; stockage et conservation font leur travail |
| Économie / difficulté | **D+** | une stratégie domine, grandir appauvrit, deux impasses silencieuses |
| Âges / évolution | **D** | deux minutes de contenu, âge 4 fantôme, aucune fin |
| Main-d'œuvre | **D** | saturée par construction ; trois bâtiments morts |
| Jouabilité / information | **C** | l'essentiel est dit, les blocages structurels ne le sont pas |
| Code | **A−** | architecture et déterminisme solides ; quatre trous de contenu |
| Accessibilité | **D** | souris uniquement (inchangé depuis l'audit) |

## 10. Correctifs par impact (proposition, non appliqués)

1. **Donner un ouvrier au-delà de N** : rendre le rendement des fermes/puits dépendant d'un
   poste de moins (ex. 3 nourriture/ferme) ou créer un pool d'ouvriers « libres » — sans quoi
   camp, carrière et entrepôt restent morts.
2. **Ancrer le centre près d'un gisement** ou déplacer le filet de bois sur le gisement le plus
   proche : la récupération anti-blocage doit exister sur la carte livrée.
3. **Borner les âges** (`AGE_NAMES` complet + refus au-delà de 3) et écrire une fin.
4. **Rendre le commerce dépendant du staffing** — décision propriétaire, mesurée comme risquée
   sur l'ouverture D2 (elle tomberait à −2/tick), donc à re-calibrer avec.
5. **Alerter sur 0/tick** et sur « aucun bois n'arrive ».
6. **Renseigner `requiredAge`** sur campagne/carrière/entrepôt, ou supprimer le mécanisme.

Les points 4 et 3 sont des décisions de game design : ils changent l'équilibre, pas seulement
le code.
