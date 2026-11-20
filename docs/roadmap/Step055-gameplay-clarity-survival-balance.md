# Step055 — Gameplay Clarity & Survival Balance : diagnostic et décision

**Type : diagnostic, mesure et décision produit. AUCUN changement de
mécanique, d'équilibrage, de format de sauvegarde ou de code.**
Baseline : `fbeec5d` (Step054 prep + harnais agent ; 2 commits locaux non
poussés, CI E2E rouge sur `534f8d4` — voir Step054 §G). Toutes les
mesures ci-dessous sont reproductibles : seed `f13-test`, événements
off, paramètres documentés §5.

---

## 1. État initial vérifié

- Branche `master`, HEAD `fbeec5d`, `origin/master` à `534f8d4`,
  arbre propre au démarrage du diagnostic ;
- Step053 livré et validé visuellement ; playtest agent (harnais
  `playtest/`) 4/4 scénarios ; session humaine Step054 non réalisée ;
- Suite de mesure temporaire créée, exécutée puis **supprimée** (aucun
  fichier de test résiduel, aucun commit) — les paramètres exacts sont
  documentés §5 pour reproduction.

## 2. Références réellement inspectées

- Code : `src/application/queries/analysis.ts` (waterConsumption,
  alertes), `src/domain/production/production.ts` (consumeWater,
  WATER_PER_SERVED_COLONIST_PER_TICK), `src/domain/environment/*` (non
  concerné), `src/application/queries/stats.ts` ;
- Docs : STATE.md, 11-ROADMAP.md (statut DELIVERED), Step052/053/054,
  03-DESIGN-RULES §21-24, ADR-004 ;
- Playtest : `playtest/artifacts/PLAYTEST-REPORT.md` + captures
  (scénarios A-D, Step054) ;
- Tests : `tests/analysis.test.ts`, `tests/market.test.ts` (sémantique
  des forecasts), `tests/environment.test.ts`.

## 3. Observations Step054 (résumé)

- **F12** : pop 12 en manque d'eau affiche `Water +10/-0 per tick` et
  `0/14 colonists served` — la consommation affichée tombe à 0 au
  pire moment de la pénurie ;
- **F13** : deux walkthroughs agent ont effacé leurs colonies en
  construisant du logement sans production suffisante — famine
  all-or-nothing, pop 24 → 0 (déjà documentée Step048, re-déclenchée
  deux fois par l'agent).

## 4. F12 — diagnostic mesuré

### 4.1 La chaîne de calcul vérifiée (code, pas supposition)

1. **Production** = puits staffés × 2 (`waterProductionPerTick`) ;
2. **Besoin** = population × 1 (`WATER_PER_SERVED_COLONIST_PER_TICK`) ;
3. **Servi** = `min(stock après production, besoin)` (`consumeWater`) —
   l'eau non servie n'est jamais pénalisante au-delà du signal ;
4. **Affiché** : `analysis.ts` calcule la consommation du forecast
   `water = min(stock, besoin)` — la consommation affichée est donc le
   **servi**, pas le **besoin** ;
5. **Conséquence mesurée** : quand le stock tombe sous la population,
   la consommation affichée = le stock (puis 0) et la balance devient
   POSITIVE — le forecast affiche un surplus au moment exact où des
   habitants ont soif.

### 4.2 Table mesurée (pop 12, production 10, stock initial 30)

| tick | stock | servi | affiché | verdict |
|---|---|---|---|---|
| 0 | 6 → 4 | 12/12 | `+10/-6` (balance +4) | ambigu : « -6 » = le stock, pas le besoin (12) |
| 1 | 4 → 2 | 12/12 | `+10/-4` (+6) | idem |
| 2 | 2 → 0 | 12/12 | `+10/-2` (+8) | idem |
| 3 | 0 → 0 | **10/12** | `+10/-0` (**balance +10, pas de compte à rebours**) | **divergence totale** |
| 4-21 | 0 | 10/12 | `+10/-0` | divergence permanente |

Constats : (a) la divergence commence dès que `stock < population` —
avant même la pénurie ; (b) au pire de la pénurie, l'UI affiche un
surplus de +10/tick et aucun compte à rebours ; (c) le vrai signal
(« 10/12 servis ») n'existe que dans l'alerte, pas dans le forecast ;
(d) la simulation est correcte — c'est uniquement l'affichage qui
inverse le sens.

### 4.3 Contrat d'affichage proposé (F12)

Aligner la ligne eau sur la sémantique déjà utilisée par la ligne
nourriture (besoin, pas servi) :

- `Water +10/-12 per tick` — production / **besoin** (pop × constante
  canonique, zéro nouveau calcul) ;
- balance = production − besoin (`-2`) → compte à rebours honnête
  (`stock 30 → 15 ticks`) ;
- le manque reste signalé par l'alerte existante `Water: 10/12 colonists
  served` (déjà exacte) — éventuellement complétée du nombre non servi.

Implémentation minimale : une ligne de `getResourceSummaries`
(`waterConsumption = pop × const` au lieu de `min(stock, pop)`) + mise à
jour des tests qui épinglent l'ancienne sémantique. **Point d'attention
documenté** : le commentaire du code actuel justifie le choix « servi »
comme signal de pénurie — le changement inverse une décision écrite, il
doit être arbitré par le propriétaire (l'alerte servie conserve le
signal).

## 5. F13 — scénarios mesurés (tous déterministes, seed `f13-test`)

Setup commun : colonie contrôlée en commands réels, corridor routier,
fermes/puits/résidences paramétrés, events off. Reproduction : paramètres
§5.1-5.4 dans le harnais `playtest/` ou tout test vitest équivalent.

### 5.1 A — colonie saine (6 fermes, 12 logements, pop 10 → 12)

Pop 12 plafonnée par le logement ; stock +1/tick (prod 13, besoin 12) ;
**aucune alerte** sur 30 ticks. La croissance s'arrête proprement au
plafond — pas de spirale tant que production ≥ besoin.

### 5.2 B — déficit anticipable agressif (5 fermes, 14 logements, pop 10 → 14)

- t3 : pop 14, déficit **-3/tick**, compte à rebours affiché **dès t3** ;
- t19 : stock épuisé → **famine** : pop 14 → **0 en UN tick** (t18 :
  pop 14 ; t19 : pop 0 — all-or-nothing vérifié) ;
- **16 ticks de prévision visible** avant l'effondrement.

### 5.3 C — mauvaise expansion (5 fermes, pop 10 stable, puis +2 logements)

- t5 : pop 12, déficit -1/tick, compte à rebours affiché **dès t5** ;
- déclin linéaire du stock (44 → 34 → 24 → 14 → 4) ;
- t50 : famine (pop 12 → 0) ;
- **45 ticks de prévision visible** — le joueur a le temps de voir,
  comprendre et corriger.

### 5.4 D — récupération (deux variantes mesurées)

- **D1, correction avant l'épuisement** (ferme construite à stock 30) :
  production 11 → 13, stock remonte +1/tick, **aucune famine**, pop 12
  intacte — une seule ferme annule le déficit ;
- **D2, correction après l'effondrement** (famine à t41, +1 ferme
  immédiatement) : trickle du Centre → pop 1 le tick suivant, puis
  +1 habitant/tick → **pop 10 récupérée en 10 ticks** (logement et
  production intacts). La récupération post-catastrophe existe et est
  rapide — mais la colonie a perdu 12 habitants et tout ce qui
  s'ensuit (commerce, impôts) au passage.

### 5.5 Réponses aux questions posées

- Perte immédiate ? **Oui — un seul tick non nourri efface TOUTE la
  population** (B : t18 → t19 ; D2 : famine et wipe au même tick) ;
- Le stock est-il un tampon ? **Oui** — il absorbe le déficit
  (C : 60 → 0 en 45 ticks) ;
- Récupération possible ? **Oui** (D1 avant, D2 après) — le trickle
  ré-amorce toujours ;
- Les alertes préviennent-elles assez tôt ? **Oui dans les scénarios
  mesurés** : compte à rebours dès le premier tick de déficit (16 à 45
  ticks d'avance) — c'était le gap corrigé au Step053 ;
- Spirale de croissance ? **Oui** — le logement s'étendant plus vite
  que la production, chaque nouvel habitant creuse le déficit
  (B : -3/tick) ;
- Déterminisme ? **Total** — mêmes paramètres, mêmes ticks, mêmes
  issues (reproductibilité vérifiée par exécutions répétées).

## 6. Matrice des trois options (aucune implémentée)

| Critère | A — famine conservée (+ prévention) | B — dégradation progressive | C — délai de grâce |
|---|---|---|---|
| Lisibilité | Déjà forte (Step053) : compte à rebours dès le 1er tick de déficit | Faible : une perte lente de 1 hab/tick est moins « visible » qu'un compte à rebours | Forte : un état « famine imminente · N ticks » est très lisible |
| Anticipation | 16-45 ticks mesurés d'avance | La dégradation EST le signal, mais après coup | N ticks de fenêtre de correction explicite |
| Récupération | D1 : une ferme suffit avant épuisement ; D2 : 10 ticks après | Naturelle (la pop décroît jusqu'à l'équilibre) | Naturelle pendant la grâce |
| Difficulté | Maximale — l'erreur de planification coûte cher | Plus douce, auto-stabilisante (pop décroît vers la production) — **risque de dé-problématiser la planification** | Intermédiaire — la pression existe mais pardonne une fois |
| Déterminisme | Intact | Intact (règle déterministe) | Intact (compteur déterministe) |
| Architecture | Aucun impact | Change le contrat documenté « all-or-nothing » (tests population, trickle Step015, self-play, doctrine governor) | Nouvel état persisté (compteur de ticks de famine) |
| Sauvegardes | Aucune migration | Aucune migration (règle, pas d'état) — mais sémantique v18 alterée | **SAVE_VERSION 19 + migration** (compteur) |
| Complexité | Nulle (déjà livrée) | Moyenne-apparente : réécrire consumeFood/updatePopulation + large surface de régression (self-play, governain, tests de famine) | Moyenne : compteur + reset + affichage, périmètre plus petit que B |
| Régression | Aucune | Tests population/famine/self-play à réécrire en profondeur ; la preuve Step048-049 (événements sans hausse de taux) repose sur la sévérité actuelle | Tests de famine ajustés (wipe après N ticks) ; garde-fous self-play à re-vérifier |

Faits supplémentaires pesant la décision :

- Le wipe n'est **pas arbitraire** (§21) : il suit une cause unique,
  annoncée par un compte à rebours dès le premier tick de déficit
  (mesuré) — Step053 a comblé le déficit d'information ;
- L'option B créerait un effet pervers mesuré par analogie : la pop
  décroissante réduit le besoin vers la production — le jeu se
  régulerait tout seul et **désapprendrait la planification** ;
- L'option C introduit le premier état de pénurie persisté — le premier
  depuis la pollution (v14) ; coût réel mais borné (pattern v13→v18
  éprouvé).

## 7. Recommandation (décision finale au propriétaire)

**Option A — conserver la famine actuelle**, pour trois raisons
mesurées : (1) l'information manque était le vrai problème et Step053
l'a comblé (compte à rebours dès le premier tick, 16-45 ticks d'avance
mesurés) ; (2) la récupération existe et est rapide (D1 : une ferme ;
D2 : 10 ticks) ; (3) B et C coûtent chacune une altération du contrat
de difficulté ou une migration, pour un bénéfice non démontré tant que
la session humaine Step054 n'a pas jugé le compte à rebours
suffisant. **Déclencheur de ré-évaluation** : si le playtest humain
montre un joueur informant (countdown visible) quand même effacé, la
grâce (C) devient la candidate naturelle — cadrage alors requis
(SAVE_VERSION 19).

## 8. Risques techniques

- F12 non implémentée : l'ambiguïété d'affichage demeure telle quelle ;
  son correctif proposé inverse un choix documenté du code (commentaire
  « served colonists ») → arbitrable uniquement par le propriétaire ;
- Option C si retenue plus tard : première migration depuis v18 +
  re-vérification des 7 garde-fous self-play (re-mesure Step048) ;
- Aucun risque identifié à ne RIEN changer maintenant : la simulation
  est correcte, l'affichage de la nourriture est exact, l'eau est le
  seul écart d'affichage.

## 9. Tests exécutés et résultats réels

- Suite de mesure temporaire (6 tests, créée puis supprimée après
  enregistrement des valeurs) : **6/6 verts** après correction du setup
  (3 itérations de geometry) ;
- Suites de non-régression NON relancées (aucun code modifié) — la
  dernière exécution complète date du Step053 : 320 unit, 34/34 E2E,
  self-play 7/7, build PASS ;
- Limites : les scénarios F13 utilisent des colonies contrôlées
  (commands directs) — ils isolent la mécanique mais ne reproduisent
  pas le comportement du gouverneur (déjà couvert par self-play) ; la
  variante « timing CI » n'est pas mesurable ici.

## 10. Décisions à arbitrer par le propriétaire

1. **F12** : GO pour le contrat d'affichage « besoin » (une ligne de
   code + tests) — ou statu quo documenté ?
2. **F13** : Option A (recommandée) / B / C ?
3. Si C : autoriser le cadrage SAVE_VERSION 19 dans un step dédié.
4. (Transverse) re-run CI du `534f8d4` (E2E rouge, flake suspecté) et
   push des 3 commits locaux — toujours en attente.

---

## 11. Décision du propriétaire (2026-11-10)

**Option B retenue — dégradation progressive.**

- Un tick non nourri retire **un seul colonist** (au lieu de toute la
  population) ; `consumeFood` retourne le nombre de colons réellement
  nourris et `updatePopulation` applique `STARVATION_LOSS_PER_TICK = 1`.
- **Aucune migration de sauvegarde** : la règle est une fonction pure de
  l'état, pas un compteur persisté (contrairement à l'option C).
- L'alerte alimentaire annonce la conséquence (`N colonists unfed (−1/tick)`).
- Les options A (statu quo) et C (délai de grâce, SAVE_VERSION 19) sont
  écartées.
- Tests ajustés (population, désactivation, économie) + test de reprise ;
  self-play et garde-fou des événements inchangés et verts.
