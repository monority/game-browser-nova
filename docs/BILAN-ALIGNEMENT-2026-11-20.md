# NOVA — Bilan complet · 20 novembre 2026

> Un seul document pour tout comprendre : ce que le jeu veut être, où il en est
> vraiment, ce qui a été décidé et mesuré aujourd'hui, ce qui reste à trancher.
>
> Base : `HEAD = 6e7e593` + arbre de travail non commité (D3 : coûts en pierre ;
> D6 : débit de l'atelier). Dernière révision : 20 novembre, soir.
>
> Le détail vit ailleurs : `DESIGN-ALIGNMENT.md` (vision et écarts),
> `GAMEPLAY-TRACEABILITY.md` (ligne par ligne), `DESIGN-DECISIONS.md` (registre),
> `rebalance/v0.1/REBALANCE-ROADMAP.md` §11–§18 et les fiches
> `rebalance/v0.1/decisions/D3-stone.md` / `D6-workshop-rate.md`.

## 1. Le résumé en dix lignes

**La mécanique est saine. Ce qui manque, c'est le contenu et les débouchés.**

NOVA est un city-builder où comprendre est le jeu : une colonie qui tient sur ses
propres chaînes, un joueur qui nomme ce qui la bloque, corrige, et voit la ville
grandir d'un âge à l'autre.

Ce qui marche : la boucle complète (construire → jalon → âge), le tick
déterministe, la construction payée en matériaux, la pierre qui sert enfin, la
main-d'œuvre agrégée avec un ordre unique, les crises d'eau graduelles, un
inspecteur qui nomme des causes.

Ce qui bloque encore, en quatre mots : **des bras**, **une dépense**, **des
besoins**, **une fin**.

La décision du jour (D6) règle le plafond des planches : la ligne de croissance
passe de 28 à **78 habitants**. Elle ne règle pas la marge de travail, qui vient
d'une autre loi. Trois décisions t'attendent, et aucune ne peut être prise par un
agent : elles définissent le jeu, pas un réglage.

## 2. Le jeu voulu

| Aspect | Intention d'origine (vault 01–11) |
|---|---|
| Nature | city-builder systémique + progression de civilisation, une métropole, une planète |
| Boucle | construire → produire → stocker → distribuer → consommer → analyser → optimiser → grandir → âge |
| Construction | grille et cellules ; le joueur choisit l'emplacement, pas un point flottant |
| Main-d'œuvre | agrégée, jamais individuelle ; le joueur ne place pas chaque citoyen |
| Ressources | courtes, chaînes directes, chaque ressource a une fonction |
| Économie | l'argent est un budget public et doit **toujours** avoir un usage |
| Technologie | petite sélection, effets systémiques nommés, pas de « +10 % partout » |
| Âges | un chapitre, pas un habillage : nouveaux problèmes, nouveaux systèmes, nouvelle apparence |
| Plaisir | « j'ai trouvé le blocage », « mon nouveau tracé a changé le résultat » |
| Fin | **aucune n'est écrite** : le vault ne dit ni victoire ni défaite |

## 3. Le jeu livré, système par système

| Système | État réel | Preuve |
|---|---|---|
| Tick, déterminisme, sauvegardes | solide | tick fixe, simulation séparée du rendu, sauvegarde v22 avec migrations |
| Construction et coûts | fait | planches + pierre + argent selon le bâtiment (décision du 20/11, D3) |
| Pierre | fait | 8 pierres par entrepôt ; la carrière reste payable en planches seules (amorçage) |
| Main-d'œuvre | juste mais **sans marge** | ordre unique ferme → puits → reste ; l'ordre inverse fait tomber la population de 86 à 60 |
| Besoins | **moitié livrés** | nourriture et eau seulement, satisfaction binaire (tout ou rien) |
| Économie | fonctionne, **surplus sans emploi** | taxes, commerce, entretien ; 2 839 à 8 843 pièces en fin de partie de référence |
| Bâtiments | 9 types | résidence, ferme, puits, atelier, camp de bûcherons, carrière, centre, parc, entrepôt |
| Logistique | simple | rayon de route ; ni congestion, ni priorités de flux |
| Progression | 3 âges, 8 technos vendues (9 au catalogue) | jalons factuels ; **aucun bâtiment n'est débloqué par l'âge** ; six des huit technos vendues ajoutent « +1 par bâtiment », deux élargissent le rayon de route |
| Endgame | **rien** | ni fin, ni échec, ni score |

## 4. L'écart, par gravité

**P1 — ce qui casse la boucle**

1. **Pas de marge de travail — à moitié réglé.** D6 fait passer la ligne de
   croissance de 28 à **78 habitants** : le plafond des planches est levé. Mais
   les postes de survie absorbent toujours les premiers colons (puits et fermes
   prennent à eux deux environ un ouvrier par habitant) : les ateliers restent
   sans ouvrier aussi souvent qu'avant (287 → 293 ticks au standard, 735 à
   l'expansion). La marge viendra d'un changement de **dotation de travail**, pas
   de production.
2. **L'argent a cessé d'être une décision.** Même en achetant tout ce que la
   partie permet d'acheter, il reste ~5 968 pièces ; après D6, la partie longue
   laisse encore **3 301 pièces** dormir sur 3 000 ticks. Or le MVP exige que
   l'argent ait toujours un usage.
3. **Les besoins du MVP sont à moitié livrés.** Une catégorie de biens manque,
   les services manquent, la satisfaction est binaire là où le design demande
   des paliers. C'est l'écart qui touche la boucle entière.

**P2 — systèmes incomplets**

4. Les âges ne changent pas les possibilités : le champ existe, personne ne le
   remplit. L'âge 3 est terminal et l'âge 4 est un état fantôme (`state.age += 1`
   sans borne).
5. Les technos restent des bonus : six des huit vendues font « +1 par bâtiment », et seules deux élargissent le rayon de route.
6. L'entrepôt achète de la capacité sans décision.
7. La partie n'a pas de destination.
8. Quatre familles de bâtiments du MVP manquent : marché, école, santé, pêcherie.

**P3 — profondeur** : une seule chaîne de transformation, aucune spécialisation.

**P4 — lisibilité** : la marge de travailleurs et les pertes ne sont pas
affichées.

**Risque à vérifier (pas un défaut constaté)** : les 12 planches du départ
pourraient être un stock **fini** si aucun bois n'est accessible. Tout dépenser
en logements rendrait alors l'industrie morte sans que rien ne le dise. À mesurer
avant de s'en inquiéter.

## 5. La décision du jour : D6, deux planches par tick

### 5.1 Ce qui change, ce qui ne change pas

Ta décision, telle qu'appliquée : un atelier **staffé, opérationnel et connecté**
produit **2 planches par tick** pour **2 bois**. La recette devient
`2 bois → 2 planches`.

| Ce qui change | Où |
|---|---|
| La quantité produite par atelier et par tick : 1 → 2 | `transformation.ts`, `PLANKS_PER_WORKSHOP_PER_TICK` |
| Le libellé de l'atelier dans le panneau | `details.ts` |
| Le test de la recette : `[2, 1]` → `[2, 2]` | `tests/transformation.test.ts` |

| Ce qui ne change pas | Preuve |
|---|---|
| Affectation de la main-d'œuvre | `jobs.ts`, ordre ferme → puits → reste : inchangé |
| Coût de construction de l'atelier | 2 planches + 1 eau : inchangé |
| Coût en bois d'un lot | `WOOD_PER_PLANK_BATCH = 2` : inchangé |
| Stockage | capacité de planches inchangée |
| Lois de consommation | nourriture et eau : inchangées |
| Déterminisme et sauvegardes | v22, aucune migration |
| Circulation | aucune planche sans bois, sans ouvrier ou hors activité |

Un effet indirect, mesuré mais **non décidé** : le commerce paie déjà **+1 pièce
par planche réellement produite**. Doubler le débit double ce bonus par atelier
en activité. La règle n'a pas été touchée ; l'effet appartient à D4.

### 5.2 Les six scénarios de ton ADR

La mesure ne réécrit aucune loi : elle rejoue le **gouverneur de self-play**, la
vraie simulation, sur les six scénarios, au débit lu dans la constante du jeu.
Deux exécutions, même graine, même politique : une à 1 planche, une à 2.

| Scénario (1 500 ticks sauf mention) | Population | Planches produites | Ticks sans atelier staffé | Argent final |
|---|---|---|---|---|
| Développement standard | 24 → 24 | 14 → **52** | 287 → 293 | 8 901 → 6 109 |
| Bois contraint (gisement 10) | 22 → 24 | 5 → **16** | 287 → 293 | 8 924 → 6 067 |
| Main-d'œuvre limitée (plafond 10) | 10 → 10 | 147 → 294 | 270 → 270 | 6 139 → 6 286 |
| Expansion (plafond 40) | 28 → **40** | 14 → 71 | 287 → 735 | 8 843 → 1 505 |
| Stress hydrique (aléas fréquents) | 10 → 10 | 0 → 0 | 1 500 → 1 500 | 112 → 112 |
| Longue partie (3 000 ticks) | 28 → **40** | 14 → 71 | 287 → 1 373 | 20 837 → **3 301** |

### 5.3 Comment lire ce tableau, sans habillage

1. **Le plafond des planches est levé.** À bois égal, la colonie produit 3,7 fois
   plus de planches au scénario standard, et l'atelier reste alimenté plus
   longtemps quand le gisement est maigre (5 → 16).
2. **La population gagne dès que le logement est ouvert** : 28 → 40 au plafond
   d'expansion, identique sur la partie longue. Le scénario standard reste à 24
   **parce que son propre plafond de logement est 24** : il mesure son plafond,
   pas le débit. La ligne de croissance du self-play (logement 240) passe de
   **28 à 78 colons** — c'est le chiffre que lisent les tests de parcours.
3. **La marge de travailleurs n'apparaît pas.** Les ticks sans atelier staffé ne
   baissent pas (287 → 293) et explosent à l'expansion (287 → 735) : dès que la
   population monte, les puits et les fermes prennent les bras. Le débit lève le
   plafond des **planches**, pas celui de la **main-d'œuvre**.
4. **Le scénario hydrique est identique aux deux débits** : 10 colons, eau 0,
   âge 1, dans les deux cas. Le facteur limitant est l'eau, pas les planches ;
   cet échec est explicable et récupérable, et il précède D6.
5. **La surproduction existe dans une colonie qui ne grandit pas** : à plafond
   10, le stock finit à 150 planches (1/tick) puis **297** (2/tick) sans aucun
   usage. C'est borné par le stockage, donc pas « incontrôlé », mais sans
   conséquence stratégique : c'est le symptôme que D4 et O5 doivent traiter.
6. **L'argent ne s'envole pas.** La trésorerie baisse partout (8 901 → 6 109 au
   standard, 20 837 → 3 301 sur la partie longue). Vérifié : l'écart vient des
   bâtiments que le gouverneur met au repos (2 à 5 au débit 1, aucun au débit 2),
   qui ne paient plus d'entretien — pas d'une règle de production.

### 5.4 Sortie face aux cinq critères de ton ADR

| Groupe | Sortie | Preuve |
|---|---|---|
| **A. Fonctionnement** | **satisfait** | 2 planches exactement par atelier staffé ; 0 sans ouvrier ; 0 sans lot de bois ; aucune planche créée sans matière ; runs identiques à graine égale |
| **B. Main-d'œuvre** | **partiel** | survie toujours prioritaire et croissance rétablie (28 → 40, 78 sur la ligne de croissance) ; mais **aucune marge dégagée** : ateliers sans ouvrier 287 → 293 ticks |
| **C. Matériaux** | **satisfait, une réserve** | bois toujours demandé (2 par lot, gisement épuisé dans tous les scénarios) ; planches absorbées par le logement ; **réserve** : stock mort de 297 planches sans croissance |
| **D. Multi-scénarios** | **partiel** | standard, expansion et partie longue s'améliorent ; bois contraint reste jouable ; hydrique inchangé ; **aucun scénario sacrifié** ; surproduction bornée mais sans conséquence |
| **E. Régression** | **satisfait, 3 rouges attendus** | 190/193 verts ; les 3 rouges ne changent pas de nature (voir §6) |

**Conclusion honnête.** D6 est le bon levier pour le plafond industriel, et il est
appliqué. Il ne valide pas l'ADR à lui seul, et c'est normal : deux de ses
critères (marge de travailleurs, surplus sans conséquence) décrivent des systèmes
que le débit ne touche pas. La validation est **partielle**, pas « complète ».

## 6. Ce qui est vérifié, et ce qui ne l'est pas

**Vérifié sur l'état final (20/11, soir)**

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | passe, 0 erreur |
| eslint sur les fichiers touchés | passe, 0 trouvaille |
| Suite unitaire complète (~5 s) | **190 verts / 3 rouges / 1 ignoré** |
| Sonde des six scénarios | rejouable à l'identique (commande ci-dessous) |

**Les trois rouges, nommés et assumés** — ils ne sont pas maquillés :

| Test | Ce qu'il lit | Pourquoi il est rouge |
|---|---|---|
| Step084 (parcours de référence) | 78 colons au lieu de 86 | la marge de main-d'œuvre manque ; dépend de la dotation, pas de D6 |
| Step087 (trésorerie) | 2 839 pièces au lieu de « moins de 100 » | l'argent n'a pas de dépense ; c'est **D4** |
| Step085 (réveil de l'atelier) | 1 353 ticks au lieu de 347 | la cadence d'activité change avec le débit ; à re-cadrer avec D4/O5 |

**Non vérifié après D6** : les parcours navigateur (E2E). Dernier passage vert
17/17 le 17/11 ; D6 ne touche qu'un libellé de panneau, mais je ne l'ai pas
rejoué, donc je ne le compte pas comme vérifié.

**Non mesuré** : le débit d'argent net à 86 habitants ; la courbe de trésorerie
tick par tick ; l'effet d'une dépense récurrente sur une colonie de 10-15
habitants ; ce que l'écran affiche à l'âge 4 ; si un bois est accessible au
départ ; l'accessibilité clavier.

**Refaire la mesure**

```bash
MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run \
  tests/measure-throughput.test.ts
```

La sonde ne tourne pas dans la suite par défaut (`MEASURE_THROUGHPUT=1` requis) :
elle sert à mesurer, pas à garder.

## 7. Ce qui est cohérent et ne doit pas bouger

- Tick fixe, déterminisme, simulation séparée du rendu.
- Population et logistique agrégées.
- Ordre de travail **ferme → puits → reste** (mesuré : l'inverse fait tomber la
  population de 86 à 60).
- Techno de puits hors du catalogue livré (prototype mesurable conservé).
- Puits dimensionnés sur le rendement réel, pas sur un « 2 » écrit à la main.
- Marché d'âge 2 retiré ; jalons « avoir N pièces » retirés pour de bon.
- Crise d'eau : seuil 75 %, graduelle, récupérable, plancher de 2 colons.

## 8. Ce qui reste à trancher

| Question | Pourquoi c'est à toi | Ce que ça change |
|---|---|---|
| ~~Débit de l'atelier~~ — **tranché : 2 planches/tick (D6)** | — | ligne de croissance 28 → 78 ; plafond des planches levé |
| **D4 — quelle dépense donne un sens à l'argent ?** | définit ce que l'argent achète | recommander une dépense récurrente par bâtiment, jamais un jalon de trésorerie |
| **D5 — comment une partie se termine-t-elle ?** | définit ce qu'est « gagner » | recommander un objectif à plusieurs conditions + un seul échec : population zéro |
| **O5 — quel premier besoin non vital ?** | définit ce que le MVP contient en plus de survivre | une catégorie de biens d'abord, les services ensuite |

Deux chantiers techniques accompagnent ces décisions, sans les attendre. Les
deux sont maintenant **mesurés** (fiche `W1-workforce-allocation.md`) :

- **La dotation de travail.** Puits et fermes coûtent, sans techno, exactement
  un ouvrier par habitant — la marge industrielle initiale est nulle, mais elle
  n'est pas le blocage : aucun poste vital n'est jamais privé de bras et les
  trois technos de ferme libèrent déjà 6 bras à 24 habitants.
- **Le bois.** Le blocage réel : le bûcheron est staffé 2 % des ticks (0,02 sur
  1), la carrière 0 à 1 %, tandis que 3,07 ateliers sur 4 tournent sans matière.
  Bûcheron et atelier partagent un seul seau de priorité, départagé par la
  position : l'atelier passe devant, prend le dernier bras, et le bois ne rentre
  plus. Conséquence mesurée : les planches se figent à 47 dès t450 en standard
  avec 60 bois encore dans le sol, et 6 109 $ dorment sans emploi.

  **Suite (20/11) : la règle est livrée.** L'allocation conditionnelle
  (`decisions/W1-conditional-workforce-allocation.md`) fait passer les planches
  produites de 60 à 1 166 en standard, le bûcheron de 0,02 à 0,74 et ramène à
  zéro les ticks d'atelier sans bois ; la population minimale et finale ne bouge
  pas. Elle ne règle ni l'expansion (camp construit trop tard) ni la trésorerie :
  ces deux points restent, le second pour D4.

## 9. L'ordre de travail que les dépendances imposent

```text
marge de travail → industrie qui tourne → biens → services
   → argent dépensé (D4) → contenu des âges → fin de partie → lisibilité
```

Le débit étant tranché, deux chantiers peuvent avancer en parallèle : la
**dotation de travail** (le verrou) et **D4** (l'argent dormant) — un atelier de
biens jamais staffé est un bâtiment décoratif tant que la marge n'existe pas.

## 10. Ce qui est mesuré, ce qui ne l'est pas

**Mesuré** : la ligne de croissance passe de 28 à 78 habitants avec D6 ;
l'expansion de 28 à 40 ; les planches produites de 14 à 52 au scénario standard ;
l'argent dormant de 20 837 à 3 301 sur 3 000 ticks ; 9 bâtiments et 8 technos
vendues ; la main-d'œuvre tick par tick sur les six
scénarios (`W1-workforce-allocation.md` : postes demandés, staffés, perdus faute
de bras ou faute de bois, matières restant au sol) ; l'effet de la loi
d'allocation sur ces six scénarios et deux exécutions identiques
(`W1-conditional-workforce-allocation.md`). **Suite de tests : 199 verts,
1 ignoré, 0 rouge** (20/11, après livraison de W1) ; les trois tests rouges de
D4/D5/O5 sont passés au vert avec la loi.

**Non mesuré** : tout ce qui est listé au §6, plus le flux de bois tick par tick
(la sonde lit le bois restant au sol et les postes staffés, pas ce qui sort du
camp), et aucune variante de dotation (rendement de base 3 au lieu de 2).

## 11. Où aller plus loin

- [DESIGN-ALIGNMENT.md](http://localhost:8000/Nova/docs/DESIGN-ALIGNMENT.md) — la vision, l'état, les écarts, le risque conditionnel
- [GAMEPLAY-TRACEABILITY.md](http://localhost:8000/Nova/docs/GAMEPLAY-TRACEABILITY.md) — ligne par ligne : intention, code, preuve, statut
- [DESIGN-DECISIONS.md](http://localhost:8000/Nova/docs/DESIGN-DECISIONS.md) — adoptées, rejetées, ouvertes, expérimentations
- [D6-workshop-rate.md](http://localhost:8000/Nova/docs/rebalance/v0.1/decisions/D6-workshop-rate.md) — la décision du jour, la grille, la sortie critère par critère
- [REBALANCE-ROADMAP.md](http://localhost:8000/Nova/docs/rebalance/v0.1/REBALANCE-ROADMAP.md) — version 0.3, priorités et critères
- [MVP-REFERENCE.md](http://localhost:8000/Nova/docs/MVP-REFERENCE.md) — les 13 critères du MVP (10 tenus, 3 partiels)

## 12. En une phrase

Le jeu tient debout et son plafond industriel est levé ; il manque encore des
**bras disponibles** pour faire tourner l'industrie, un **usage pour l'argent**,
des **besoins qui donnent envie de construire** et une **fin** — quatre choses
qui sont des décisions, pas des chiffres.
