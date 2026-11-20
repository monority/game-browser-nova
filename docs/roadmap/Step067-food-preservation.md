# Step067 — Conservation alimentaire et observabilité des pertes

**Type : implémentation + mesure.** Mécanique active, sauvegarde v19, pertes
exposées ; **les guardrails sont mesurés, pas forcés** : 5/7 verts, 2 rouges
avec cause identifiée et décision demandée (§7).

Baseline : branche `main`, HEAD `34690c0`, arbre propre avant l'étape
(seule `docs/STATE.md` était modifiée par la mission documentaire précédente).
Numérotation : `Step067` (le design est `Step056-food-preservation-design.md`,
`Step066` est pris). Aucun commit, aucun push.

---

## 1. Décisions appliquées

| Élément | Décision | État |
|---|---|---|
| Ressource | nourriture uniquement | appliqué |
| Modèle | dégradation proportionnelle du stock (`perte = stock × k`) | appliqué |
| Taux | 3 %/tick, **expérimental** | appliqué, propriétaire `src/content/conservation.ts` |
| Ordre | après production, avant consommation (phase 5a) | appliqué |
| Reliquat | report fractionnaire persistant `foodSpoilCarry` ∈ [0, 1) | appliqué |
| Migration | v18 → v19, stocks intacts, reliquat initialisé à 0 | appliqué |
| Eau | aucune dégradation | appliqué |
| FIFO / âge des unités | hors périmètre | non introduit |
| Rationnement | hors périmètre | non introduit |

## 2. Implémentation

| Fichier | Rôle |
|---|---|
| `src/content/conservation.ts` | `FOOD_SPOILAGE_RATE_PER_TICK = 0.03` (le taux n'est pas dans `tick.ts`) |
| `src/domain/storage/spoilage.ts` | loi `spoilFood`, phase `applyFoodSpoilage`, projections `nextFoodSpoilage`, `foodTicksRemaining` |
| `src/domain/simulation/state.ts` | `foodSpoilCarry` (état canonique, persisté) |
| `src/domain/simulation/tick.ts` | phase 5a + `TickFlows` (mesures du dernier tick, jamais persistées) |
| `src/application/persistence/save.ts` | `SAVE_VERSION = 19`, champ validé, migration `v18 → v19` |
| `src/application/queries/analysis.ts` | prévision : `spoilagePerTick`, `netPerTick`, compte à rebours sous la loi réelle |
| `src/application/queries/stats.ts` | `foodSpoilagePerTick`, `foodLostPerTick`, `waterLostPerTick` |
| `src/app/ui/statsPanel.ts` | lignes permanentes `spoiled/tick` et `lost at cap/tick`, `net` dans la prévision |
| `src/app/boot.ts` | porte les `TickFlows` de session (jamais sauvegardés) |

Règle exacte (les colons mangent ce qui a survécu, pas ce qui vient d'être
récolté) :

```text
1. production (fermes staffées + trickle du Centre) → stock
2. perte = stock × 0,03 + reliquat ; unités entières retirées, fraction reportée
3. consommation : min(stock, population)
4. écrêtage au plafond (inchangé, après consommation)
```

L'ordre des phases suivantes est **inchangé** (population, environnement,
staffing, argent, événements). Aucune constante de production, aucun seuil de
population, aucun plafond n'a été touché.

### Reliquat

`spoilFood` ne retire que des unités entières et reporte `loss − floor(loss)`
dans `[0, 1)`. Sans report, 3 % de 30 unités (0,9) arrondirait à zéro et
créerait un seuil caché (il faudrait 34 unités pour perdre une unité). Le
reliquat est un état, pas un compteur de statistiques : il change la
trajectoire, donc il est sauvegardé.

### Migration

`migrateV18ToV19` : `formatVersion = 19`, `foodSpoilCarry = 0`, **rien
d'autre**. Aucun stock n'est modifié, aucune unité détruite au chargement. Le
reliquat d'une partie v18 est inconnaissable ; l'inventer réécrirait le
grenier du joueur. Version cible validée `0 ≤ carry < 1` (une valeur ≥ 1 est
une donnée corrompue, rejetée, jamais normalisée).

## 3. Observabilité

- **Nourriture produite** : `TickFlows.foodProduced` (delta de stock mesuré,
  les mannes d'événement exclues) ;
- **consommée** : `foodConsumed` = quantité réellement servie (pas le besoin) ;
- **dégradée** : `foodSpoiled` (unités entières du tick) + projection du tick
  suivant dans `spoilagePerTick` ;
- **perdue par saturation** : `foodWasted` — la valeur que `clampStorage`
  renvoyait déjà et que personne ne lisait ;
- **variation réelle** : `netPerTick = production − besoin − dégradation`.

Toutes les valeurs affichées sont mesurées par le tick (delta de stock) ou
calculées par la loi unique du domaine : l'interface ne réimplémente aucune
règle. Les statistiques de pertes sont **de session** (aucun compteur
persistant ajouté) ; seul le reliquat est persisté, parce qu'il est un état.

### Prévisions

`ticksRemaining` ne divise plus `stock / (−net)` : la dégradation décroît avec
le stock, donc la division linéaire surestimerait la durée. La fonction marche
la loi phase par phase (même fonction `spoilFood`), et renvoie `null` dès que
la production couvre le besoin — un grenier qui ne se vide jamais ne doit pas
afficher de compte à rebours. L'alerte alimentaire utilise le **net** ; le
message d'écrêtage ne prétend plus « +N/tick not stored » (la dégradation
libère de la place chaque tick) et se limite à l'état du plafond.

## 4. Tests

Nouveau fichier `tests/conservation.test.ts` (14 tests) : loi et report,
absence de seuil d'arrondi, stock nul, stock de 1, perte > stock impossible,
ordre production → dégradation → consommation, eau intacte, équilibre D2,
grand livre fermé sur 300 ticks, déterminisme bit-à-bit, compte à rebours,
round-trip avec reliquat non nul, continuation identique après rechargement,
migration v18 sans perte, rejet d'un reliquat invalide.

Adaptations (attentes arithmétiques, jamais d'assertion affaiblie) :
`analysis` (spoilage/net + compte à rebours 9 → 7 avec le reliquat hérité),
`storage` (grenier 118 au lieu de 120 : la dégradation libère la place),
`population`/`deactivation`/`progression` (fixtures ramenées sous le seuil de
mesure pour que l'assertion porte sur la ferme/le trickle et pas sur la
dégradation, qui a sa propre suite), `economy` (fixture sans ferme : le
grenier ne doit pas affamer les contribuables pendant la mesure de l'argent),
`persistence`/`events`/`progression` (version 19).

**Aucun guardrail n'a été modifié, affaibli ni contourné.**

## 5. Résultats économiques mesurés

Banc temporaire (`seed step056-bench`, monde 24×24, fermes adjacentes à une
route, population fixée, eau figée, pas d'événement), supprimé après usage ;
chaque tick appelle le vrai `stepSimulation` et les quantités sont lues dans
`TickFlows` (delta de stock), jamais recalculées.

| Scénario | ticks | produit | consommé | dégradé | écrêté | stock | min | pop | famine |
|---|---|---|---|---|---|---|---|---|---|
| Ouverture D2 (5 fermes, +1/tick) | 1200 | 13 180 | 12 000 | 1 217 | 0 | 60 → 23 | 22 | 10 | — |
| A stable, 4 fermes + `cropRotation` (13/tick) | 1200 | 15 576 | 12 000 | 3 549 | 0 | 60 → 87 | 39 | 10 | — |
| C surproduction, 7 fermes tech (22/tick) | 400 | 8 758 | 4 000 | 1 687 | 3 011 | 60 → 120 | 39 | 10 | — |
| D déficit, 3 fermes (7/tick), pop libre | 60 | 408 | 446 | 22 | 0 | 60 → 0 | 0 | 7 | **t=13** |
| E crise + ferme de secours à t=10 | 60 | 504 | 539 | 25 | 0 | 60 → 0 | 0 | 8 | **t=13** |
| B croissance, 6 fermes tech, 18 lits | 400 | 7 564 | 7 156 | 454 | 0 | 60 → 14 | 14 | 18 | — |

Comparaison avec les références Step056 (mêmes scénarios, banc différent :
Step056 drainait **en début de tick**, avant production ; ici la phase est
après production, comme décidé) :

| Scénario | Référence Step056 (3 %) | Mesure Step067 | Lecture |
|---|---|---|---|
| A stable | équilibre 100, dégradé 1 160 / 400 t, écrêté 0, 22,3 % détruit | 400 t : dégradé 1 149, écrêté 0, 22,2 % détruit | identique à 0,1 pt |
| C surproduction | dégradé 1 433, écrêté 3 307, 53,9 % détruit, pincé 394/400 | dégradé 1 687, écrêté 3 011, 53,7 % détruit, pincé 390/400 | la dégradation ne vide pas la surproduction |
| B croissance | pop 18, marge 1,9 tick, dégradé 407, 5,4 % | pop 18, stock final 14, dégradé 454, 6,0 % | marge encore plus mince |
| D déficit | famine t=16 | famine **t=13** | 3 ticks de marge en moins |
| E correction tardive | famine t=24 (correction t=10) | famine **t=13** malgré la ferme à t=10 | la ferme construite en 2 ticks arrive trop tard |

Équilibre : la loi fermée `S* = (P − C)/k` reste la bonne prédiction
(D2 : `1 / 0,03 = 33`), mais le **plancher entier** rend l'approche lente et
oscillante : après 1 200 ticks le stock mesuré est à 22–23, sous la valeur
théorique. Aucune famine dans une colonie dont la production couvre le besoin.

## 6. Validation technique

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` | PASS |
| `eslint .` | PASS |
| `vitest run` | **208 tests / 26 fichiers, 206 verts, 6,5 s** — 2 rouges = les guardrails §7 |
| `build` (tsc + vite) | PASS, 3,2 s (vite 1,22 s ; app 69,18 kB) |
| E2E Playwright | **exécuté le 2026-11-13 après nettoyage** : 3 verts / 1 rouge — `progression` (Âge 1→2→3) 11,8 s, `smoke` 7,3 s, `simulation › healthy growth` 5,0 s ; `simulation › environment` **rouge** (§6.1) |
| Navigateur, 2 viewports | 1440×900 : aucun débordement, `spoiled/tick` et `lost at cap/tick` rendus, 0 erreur console. 1024×640 : les deux lignes rendues, mais la prévision demande ~2 lignes de défilement dans `#stats` (§6.2) |
| `observe.mjs` (axe rendu) | PASS — canvas 1280×800, 634 draw calls, 598 géométries, caméra orbitale, 0 erreur console |

### 6.0 Pourquoi le blocage pids n'en était pas un

La conclusion « sandbox impossible » de la première passe était fausse : les
~400 pids manquants étaient **six arbres Chromium orphelins** laissés par les
runs E2E précédents (ppid 1, ~6 processus chacun). Après `pkill` sur
`chrome-headless-shell`, `pids.current` est passé de 905 à 509 et le parcours
Âge 1→2→3 a tourné du premier coup en 11,8 s. Leçon : nettoyer les navigateurs
avant de conclure à une limite d'environnement, et ne pas réutiliser un serveur
Vite resté sur le port 5273 (`reuseExistingServer: false` le refuse).

### 6.1 `simulation › environment` : rouge, cause mesurée

Le test construit un atelier, force `population = 14` (au-delà des 10 lits),
pose 3 parcs, puis les retire et exige `envQuality < 100` en 5 s.

- **A/B** : sur le code d'avant Step067, le même test passe en 5,2 s ; avec la
  conservation, il échoue (`Expected < 100, Received 100`).
- **Chaîne mesurée** (sonde Playwright, tick par tick) : 5 fermes produisent
  11/tick ; la fixture force pop 14 (consommation 14) ; sans péremption le solde
  est −3/tick, avec elle −4/tick. Le grenier 39 → 11 en 7 ticks, puis famine :
  la population retombe 14 → 10 en ~5 ticks. À pop 10, les 10 travailleurs
  couvrent exactement les 5 fermes + 5 puits ; **les 3 ateliers sont au repos**
  (`workshop:false`), or depuis Step064 un émetteur ne pollue qu'en étant
  staffé : `emitted/tick 0`, `pollution 0`, qualité 100 — pour toujours.
- Le test ne teste donc plus la pollution : son *surplus de travailleurs*
  n'existe que tant que la nourriture dure, et la conservation raccourcit cette
  fenêtre de 2 ticks puis la supprime.

**Non corrigé volontairement** : réparer la fixture (une ferme de plus pour
nourrir les 14, ou `food` initial plus haut) est un choix de test, pas une
correction de la mécanique ; le faire maintenant verdirait la suite en
dissimulant la cause réelle (§7). Le gate reste rouge, la décision est
proposée : la fixture doit alimenter la population qu'elle force.

### 6.2 Layout à 1024×640

Le panneau `#stats` a `max-height: 60vh` (384 px de contenu) ; avec les deux
nouvelles lignes il mesure 443 px, donc il **défile d'environ deux lignes** à ce
viewport (268 px de contenu visible au lieu de ~384 avant). Aucun chevauchement
avec la barre de construction (bas du panneau 418 px, haut de la barre 436 px),
aucune information perdue (le panneau est `overflow-y: auto`), 0 erreur console.
Tentatives mesurées et **rejetées** : `max-height: calc(100vh − 228px)` déborde
sous la barre de 10 px (`max-height` porte sur la boîte de contenu, le padding
et la bordure s'y ajoutent), et compacter le libellé de prévision ne réduit pas
la hauteur (le report du `net` reste sur deux lignes). La vraie sortie est un
choix de densité (regrouper les deux lignes de pertes ou raccourcir la
prévision), laissé ouvert.

## 7. Guardrails (mécanique active)

`tests/selfplay.test.ts` — **5 verts / 2 rouges**. Les scénarios et leurs
seuils n'ont pas été touchés.

| Guardrail | Résultat | Ce qui a changé |
|---|---|---|
| Boucle MVP complète | vert | `ready@185, age2@185, pop12@191` — inchangé |
| Récupération d'une crise à 0 or | vert | inchangé |
| Croissance au-delà de pop 12 | **rouge** | pop 24 atteinte, `age2@185`, mais **eau 0** en fin de run |
| Égalité déterministe des états | vert | inchangé |
| Événements activés | vert | inchangé |
| Seed de robustesse `measure-2` | vert | `ready@225, age2@225, pop12@231` — inchangé |
| Âge III prospère | **rouge** | `shop3 = 0` : les 3 ateliers du jalon sont au repos |

### Cause mesurée (pas une hypothèse)

Le gouverneur dimensionne les fermes **à l'équilibre exact**
(`ceil(pop / rendement)`), donc la colonie ne garde aucune réserve. À 3 %/tick
son grenier vit autour de 8–14 unités à pop 24, c'est-à-dire **sous son propre
seuil de rationnement** (`food < pop + 4`, 28) ; le rationnement met alors les
puits au repos en permanence → eau 0 → la règle « reposer les ateliers si
`water < pop` » les met tous au repos → plus de commerce, plus de recherche,
plus d'atelier à l'âge III. Mesure du glissement économique
(`tests/measure.test.ts`, même grille qu'avant) : `age2@185`, `pop12@191`,
pop finale 24 et argent minimale 33 **inchangés**, mais argent finale
**17 516** au lieu de 10 317 et **identique pour toutes les fréquences
d'événements** — signature d'un commerce à zéro.

C'est exactement ce que Step056 annonçait (Q12 : « les journeys actuels sont à
balance exacte ; à 1 tick de déficit ils meurent plus tôt dès qu'une péremption
existe »). La mécanique ne casse pas le jeu : elle invalide un joueur-proxy qui
vise la balance exacte.

### Les parcours livrés (`tools/agent/scenarios`) ne tiennent plus

Mesuré le 2026-11-13 par `node tools/agent/evaluate.mjs` (vrai pipeline, mêmes
requêtes que l'UI) :

| Scénario | Avant | Avec conservation |
|---|---|---|
| `opening` (t=120, t=300) | `healthy` | `healthy` (nourriture 23, solde +1) |
| `balanced` (t=540, t=660) | `HEALTHY` ×2 | **`critical`** à t=540 (grenier 0, 15 colons non nourris), `healthy` intermittent |
| `age2` (t=780) | `HEALTHY` | **`critical`** (16 non nourris) |
| `age3` (t=1140/1141) | `HEALTHY` | **`critical`** à chaque point (22 non nourris) |

Le régime exact mesuré à t=661–668 sur `balanced` : pop 15↔16, grenier 0↔1,
**un colon meurt et un autre arrive tous les 1–2 ticks**, l'alerte de famine
clignote en permanence et le compteur « pop 16/16 » masque ce tourniquet. Une
colonie à balance exacte n'a plus de point fixe au-dessus de zéro :
`S* = (P − C)/0,03 = 0`. Sortie mesurée pour le joueur : une ferme de plus
(surplus ~3/tick → `S* ≈ 100`, sous le plafond 120). Le doctrine « viser
l'équilibre exact » adoptée en Step065 à la suppression du marché est donc le
vrai point de rupture, et elle est partagée par le gouverneur des guardrails,
les trois journeys et la fixture E2E §6.1.

### Décision demandée (non appliquée)

Retailler le **gouverneur** (pas la mécanique, pas le taux) sur une cible de
réserve : `fermes = ceil((besoin + k × réserve_voulue) / rendement)` ou seuil
de rationnement exprimé en ticks de consommation (`food < pop × 2`) au lieu
d'un décalage additif. C'est une modification de la doctrine de l'outil de
test, donc de la référence des guardrails : elle est proposée, pas décidée.

## 8. Limites connues / non décidées

- Le taux 3 % n'est **pas** validé par cette étape : il est implémenté et
  mesuré, sa confirmation dépend du ré-ancrage du gouverneur (§7).
- La doctrine d'autonomie à trois états (déficit / équilibre / saturation)
  reste un chantier distinct : seule la lecture « temps avant vidage » existe.
- La manne de récolte (+40, phase 11) entre au grenier puis se dégrade : aucun
  comportement spécial n'a été ajouté (hors périmètre Step056).
- Les entrepôts restent passifs ; aucune capacité en ticks (Q7) n'est décidée.
- `docs/game/02-MVP.md` garde ses formulations d'origine : la mécanique n'y est
  pas décrite, elle appartient à `08-RESOURCES.md` et à ce rapport.
