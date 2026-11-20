# Step058 — F2/F3 : diagnostic du premier écran (mesures, aucun code)

**Type : diagnostic mesuré. Zéro changement de code, zéro commit.**
Baseline : `180844b`, arbre propre, 2 commits locaux d'avance sur
`origin/main`. Décision produit requise avant toute implémentation.

---

## A. Question

Step052 (F3) : « La caméra ne centre pas la colonie au démarrage :
premier écran = plan sombre quasi vide. » F2 : « Scène sombre, ville peu
lisible. » Les deux étaient renvoyés au scope visuel (Step042 V2-V5).

Le cadrage caméra semblait être un correctif de présentation pur : le
`OrbitState` vise `(width/2, 0, height/2)`. Ce step a mesuré ce que le
joueur voit réellement au tick 0 avant de toucher au code.

## B. Mesure de l'ouverture livrée (`DEFAULT_CONFIG`, 24×24)

Grille réelle des 22 bâtiments + 12 routes (R résidence, F ferme,
W puits, S atelier, + route) :

```
RRRRRRRRRRF+F.F+F+F+W+W+     ← y = 0
W+.W+W+S+S+.+...........     ← y = 1
........................
```

- bbox des bâtiments : `x 0..22`, `y 0..1` → **ruban d'une cellule de haut
  collé au bord haut**, pas un bloc ;
- l'ancre est à `(23,23)`, le coin opposé ;
- caméra : cible `(12, 0, 12)`, rayon 26,4, `phi = π/3.2`, `theta = π/4` ;
- distance caméra → colonie ≈ **37** unités ; le brouillard commence à
  **34** (`new THREE.Fog(0x0b0e14, 34, 95)`) → la colonie est rendue *dans
  le brouillard*, au fond du cadre.

## C. Correctif A — cadrer la caméra sur la colonie : rejeté par la géométrie

Cible = centre de la bbox de la colonie = `(12, 0, 1)`.

La cible est par définition au centre de l'écran. Placer la cible à **une
seule cellule du bord** de la carte met donc le bord du monde à mi-écran :
le vide (fond `0x0b0e14`) occupe ~48 % de la hauteur au lieu de ~32 %
aujourd'hui. Le zoom n'y change rien — le rayon ne déplace pas le bord
relativement à la cible (angle du bord → angle de la cible quand le rayon
croît). Concentrer le cadrage sur un ruban de bord revient à échanger une
ville lointaine contre un demi-écran de vide : c'est le symptôme F3 sous
une autre forme.

**Conclusion : F3 n'est pas un défaut de caméra.** La caméra est déjà
alignée sur l'axe de la colonie (elle regarde vers le coin haut-gauche) ;
c'est la composition jour-0 qui place la ville contre un bord.

## D. Correctif B — compacter la colonie jour-0 : implémenté, mesuré, annulé

Variante implémentée puis annulée : remplacer le scan `y asc / x asc` de
`composeD2Colony` par un ordre en anneaux de Chebyshev depuis le centre de
la carte, plus un cadrage caméra dérivé de l'étendue bâtie.

Ce qui marchait :

- colonie = bloc compact de 6×6 (`bbox buildings x 9..14, y 9..14`, routes
  jusqu'à `x 8..15`) ;
- cadrage calculé : `x 12, z 12, rayon 14,8` — cible = centre de la carte,
  colonie entièrement hors brouillard, vide ramené de ~32 % à ~20 % ;
- plus de contrainte d'accès routier : chaque lieu de travail réservait
  une cellule voisine libre pour sa route (sans quoi un bloc dense
  produisait « world has no room for D2 roads » sur les mondes 12×12/16×16
  des tests — 70 échecs).

Ce qui l'a fait annuler — **c'est un changement d'équilibrage** :

| Test | Avant | Après compaction |
|---|---|---|
| `selfplay` « full MVP loop » | `pop12@…` atteint | phase `pop12` perdue (`ready@185`, `age2@185` identiques) |
| `selfplay` « Age 3 prosperous » | pop ≥ 20 | **pop 11**, trésorerie 11 994, 19 bâtiments |
| `selfplay` « events robustness » | pop ≥ 20 | **pop 10** |
| `extraction` « unstaffed camp extracts nothing » | bois 0 | **bois 8** |
| `market` « organic wood chain » | camp non staffé | **camp staffé** |

6 échecs après le correctif de route, 70 avant. Le début de partie est
inchangé (`ready@185`, `age2@185`) : la divergence est la **croissance**,
bloquée par l'eau/le staffing dès que la colonie quitte le bord. Les
dépôts seedés des configs de mesure (`selfplay` : `(5,5)`, `(10,10)`) sont
proches du centre : un bloc central les entoure et prive les camps de
cellule d'accès, ce que le ruban de bord ne faisait pas.

Déplacer la colonie jour-0 change donc les trajectoires économiques
mesurées — c'est une décision produit, pas une retouche de présentation.

## E. État après annulation

Tout est revenu à `180844b` : `state.ts`, `orbit.ts`, `worldState.test.ts`
restaurés, `framing.ts` et son test supprimés. Vérifié :

- `git status --porcelain` : 0 ligne ;
- `tsc --noEmit` : PASS ; `eslint .` : PASS ;
- `vitest run` : **26 fichiers / 342 tests** PASS.

Aucun E2E n'a été relancé : il ne reste aucun changement de code.

## F. Décision demandée

1. **A — caméra seule (compromis).** Garder le ruban, ouvrir plus près
   (rayon ≈ 20 au lieu de 26,4) pour sortir la colonie du brouillard
   (distance 37 → 27,6) sans augmenter le vide. Petit, testable,
   strictement borné ; la colonie reste dans le tiers haut du cadre.
2. **B — refonte de la composition jour-0** (bloc central). Corrige la
   cause, mais impose un passage d'équilibrage et de nouvelles baselines
   self-play mesurées (croissance/eau/staffing, accès aux dépôts).
3. **C — différer** F2/F3 au cadrage visuel Step042 (V2 architecture par
   âge, V5 lumière), où la direction artistique est déjà à trancher.

## G. Mesure complémentaire — l'option A a été essayée, puis annulée

Option A implémentée (`OPENING_RADIUS_FACTOR = 0.75`, soit 18 au lieu de
26,4 sur la carte 24×24) : `tsc`, `eslint`, 342 tests unitaires et le build
verts, et la géométrie attendue est bien obtenue — colonie à ~26,5 unités
(donc hors brouillard, qui commence à 34), bande vide ~24 % → ~17 %, ruban
jour-0 environ deux fois plus grand à l'écran.

**E2E : 6 specs sur 35 en échec.** Cause unique, mesurée : les specs E2E
ne passent pas par `window.__nova.command`, elles **cliquent le canvas à
des pixels fixes** (`{x:300,y:400}`, `{400,300}`, `{500,300}`,
`{700,300}`). Rapprocher la caméra change la cellule visée par ces pixels :

- `economy.spec.ts:23` — argent 112 au lieu de 87 : le clic n'a rien posé ;
- `economy.spec.ts:79` — quai non posé ; `economy.spec.ts:152` — « farm
  not placed » ;
- `interaction.spec.ts:105` — `base + 1` jamais atteint (bâtiment absent) ;
  deux autres flux d'inspection/neutralisation échouent de même.

Après annulation, la même suite repasse à **35/35**. Le cadrage
n'« ouvre » donc pas un espace neutre : il est le repère implicite des
fixtures d'interaction. Toute correction caméra impose de réancrer les
pixels de 6 specs — un step à part entière (les tests continueraient de
cliquer le canvas, il n'y a pas d'affaiblissement, mais la nouvelle
correspondance pixel → cellule doit être choisie et validée).

**État final de ce step : aucun changement de code.** Arbre propre,
342 tests unitaires et 35/35 E2E verts sur `149026b`.
