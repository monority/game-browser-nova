# Step048 — Report de mesure : rythme de jeu et équilibrage

**Type : mesure + propositions. Aucun gameplay modifié.** Baseline
`ed7e9fa` → `0c47088`. Reproductibilité : harnais `tests/measure.test.ts`
(vitest, gouverneur extrait dans `tests/selfplay.governor.ts`), params
`playGame(-1, false, 14, 24)` (boucle complète Âge 1 → porte de l'Âge 3),
seed fixe → mêmes courbes (ADR-007). Volet B (session humaine) : en
attente du propriétaire.

---

## 1. Volet A — grille d'événements (mesure automatisée)

| run | age2@ | pop12@ | mkt-built@ | mkt-sale@ | t final | pop | money | év. tirés | ticks avec événement | répartition |
|---|---|---|---|---|---|---|---|---|---|---|
| selfplay/off | 185 | 220 | 326 | 327 | 1500 | 24 | 17 021 | 0 | 0 | — |
| selfplay/rare | 165 | 200 | 306 | 307 | 1500 | 24 | 17 255 | 2 | 80 | récolte 1, fermeture 1 |
| selfplay/normal | 165 | 200 | 306 | 307 | 1500 | 24 | 17 135 | 4 | 160 | récolte 1, fermeture 2, sécheresse 1 |
| selfplay/frequent | 165 | 200 | **351** | **352** | 1500 | 24 | **14 369** | 7 | 280 | récolte 1, fermeture 4, sécheresse 2 |
| measure-2/frequent | 252 | 287 | 393 | 394 | 1500 | **1** | **0** | 7 | 274 | fermeture 2, récolte 4, sécheresse 1 |

Lecture :

1. **Aucun événement ne menace la viabilité sur le seed principal** —
   pop 24 et jalons complets partout ; l'écart de trésorerie à
   l'horizon 1500 ticks est de **−15,6 % en frequent** (14 369 vs
   17 021) et le marché arrive **+45 ticks plus tard** (352 vs 327) —
   la fermeture des routes (×4) freine la banque, c'est le levier
   d'aléa économique attendu.
2. **Le premier événement démarre immédiatement à l'activation**
   (règle documentée du Step047) : sur ce seed, le premier tirage est
   une récolte → les runs événements sont *plus rapides* en début de
   partie (165 vs 185). Effet de seed, pas un objectif de design.
3. **Anomalie bénigne documentée** : les deux baselines (seeds
   `selfplay` et `measure-2`) sont identiques — les terrains diffèrent
   (14 vs 15 obstacles, zéro chevauchement, vérifié) mais aucun n'intersecte
   les cellules réellement utilisées ; la divergence frequent vient de
   la séquence d'événements seedée, pas du terrain.

## 2. Finding P1 — l'expiration d'un événement peut effacer la partie (§22)

**Scénario mesuré** (`measure-2` + frequent) :

- t≈400-790 : quatre récoltes successives gonflent la production
  (+1/ferme) ; la colonie monte à pop 24, 61 bâtiments, mais tourne à
  **marge zéro** (stock nourriture 0, production ≈ consommation) —
  l'équilibrage exact documenté depuis Step035 (pinning).
- **t797 : la 4e récolte expire.** La production chute de la valeur du
  bonus en un tick ; la famine all-or-nothing (contrat documenté) fait
  passer pop 24 → 0 ; le trickle du Centre réensemence à pop 1.
- t800-1500 : la colonie est piégée dans l'état Step019 (pop 1,
  trésorerie 0 : revenu ~1/tick contre l'entretien des bâtiments
  restants) — **17 k de trésorerie et 24 habitants effacés**.

**Verdict** : mécaniquement cohérent (chaque règle fait ce que sa doc
dit), mais l'ensemble viole l'esprit de 01-PRODUCT-VISION §16 (« Events
should not casually erase hours of progress ») et 03-DESIGN-RULES §22.
Le déclencheur n'est pas l'événement lui-même mais **son expiration en
un tick** sur une colonie à marge zéro. Le garde-fou Step047 (seed
principal) ne pouvait pas le voir : c'est une interaction seed ×
phasing.

## 3. Volet C — coût/bénéfice par bâtiment (constantes réelles du code)

Entretien : 1/opérationnel non exempté (résidences et Centre exemptés).
Route : 5 $/cellule quand un accès est requis. Revenus : impôt
1/habitant, commerce 2/atelier connecté (pop ≥ 8) + 1/planche produite,
marché 2 nourriture vendue/tick à 1 $.

| Bâtiment | Coût total (avec route/planches) | Entretien | Apport/tick | Payback monétaire direct |
|---|---|---|---|---|
| Résidence | 25 $ | 0 | +1 impôt | **25 ticks** (si nourri) |
| Atelier | 30 $ | 1 | +2 commerce (+1 planche) | **10-15 ticks** — le meilleur investissement |
| Marché | 50 $ + 2 pl + 5 $ | 1 | +2 (si surplus) | ~29 ticks |
| Ferme | 30 $ | 1 | +2 nourriture (indirect) | via admission (+1 impôt) ou marché |
| Puits | 30 $ | 1 | +2 eau (indirect) | via admission |
| Camp forestier | 30 $ | 1 | +2 bois (intrant) | chaîne planches |
| Carrière | 30 $ + 5 pl | 1 | +2 pierre (intrant) | 1 seul débouché (Step006) |
| Entrepôt | 25 $ + 2 pl | 1 | 0 (capacité) | jamais — assurance |
| Parc | 25 $ | 1 | absorption pollution | préserve l'admission |

Constat statique : l'économie reste **mono-levier** (l'atelier domine
tout investissement monétaire) ; nourriture/eau ne valent de l'argent
que par l'admission (+1 impôt/habitant) et le marché. C'est le design
documenté (Step019/021), pas une régression.

## 4. Propositions de réglage (décision produit requise — rien d'implémenté)

| # | Proposition | Preuve | Risque |
|---|---|---|---|
| **P1** | **Rampe de sortie des événements de production** : sur les 8 derniers ticks d'une récolte, le bonus s'applique un tick sur deux (entier, déterministe, testable). Le choc d'expiration passe de −13/tick à −6/tick, laissant la marge zéro se rééquilibrer | Effondrement t797 (§2) ; garde §22 | Faible : règle uniforme, s'applique à tout événement de taux futur |
| **P2** | **Fermeture commerciale à mi-socle** (2 → 1/atelier) au lieu de la suspension totale : l'aléa freine sans annuler la seule ligne de revenu | selfplay/frequent : marché +45 ticks, trésorerie −15,6 % ; Step019 : le socle est la ligne de vie | Faible : intensité plus douce, durée inchangée |
| **P3** | **Plancher de l'intervalle frequent : 150 → 300 ticks** (moyenne 325, taux d'activité ~12 %) : réduit le clustering (7 événements en ~800 ticks) qui a porté la colonie dans la dépendance à la récolte | measure-2/frequent : 7 événements avant t800 | Très faible : curseur existant |
| P4 (observation) | Premier événement immédiat à l'activation : accélération de début de partie selon le seed | §1.2 | Acceptable tel quel, documenté |

**Recommandation** : P1 + P2 + P3 ensemble forment un lot cohérent
« aléa plus doux, cliff supprimé » — implémentation estimée : 1 slice
courte (domaine + tests), aucune migration (aucun état persisté ne
change), garde-fou self-play étendu au seed `measure-2` en frequent
(devient le nouveau test de non-effondrement).

## 5. Garde-fous du step

- Aucun gameplay modifié dans ce commit : harnais de mesure + report
  uniquement. P1-P3 attendent le GO du propriétaire.
- Suite complète verte inchangée (304 tests unit, 34/34 E2E).
- Les mesures sont reproductibles : `vitest run tests/measure.test.ts`
  réimprime la grille (même seed → mêmes courbes).
