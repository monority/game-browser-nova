# Step046 — Système d'événements contrôlés : cadrage et recommandations D1–D5

**Type : cadrage produit. Aucune implémentation, aucun commit de code.**
Baseline : `b1e0380` (Step045, post-audit). Ce document formule une
recommandation pour chaque décision bloquante identifiée par Step042 §3.
Rien n'est engagé tant que le propriétaire produit n'a pas tranché ;
l'implémentation constituerait le **Step047**.

---

## 1. État vérifié du projet

- HEAD `b1e0380`, arbre propre, `master` en avance de 6 commits sur
  `origin` (non poussé). Audit complet 2026-10-30 : zéro violation
  d'architecture, zéro bug probable.
- Gates locaux verts : 283 unit / 21 fichiers, tsc, eslint, build
  (59,9 kB app + 471 kB vendor). E2E 33/33 (2026-10-24).
- Systèmes ancrables pour des événements (tous IMPLEMENTED, cf.
  STATE.md) : eau (puits 2/tick, cap 80+40/entrepôt), nourriture
  (fermes 2/tick, cap 120+60/entrepôt), commerce (socle 2/atelier
  connecté pop≥8, bonus 1/planche produite), environnement (pollution
  0–100, absorption parcs, qualité = porte d'admission), marché
  (2 nourriture/tick à 1 pièce).
- **Aucune mécanique d'événement dans le code** (0 occurrence dans
  `src/`). Le tick réel compte 10 phases ; la phase canonique
  « resolve controlled events » (05-SIMULATION §3, n° 12) n'a pas de
  correspondant.

## 2. Contrats immuables (rappel)

- 01-PRODUCT-VISION §16 : événements système **cohérents**, jamais
  punition arbitraire ; fréquence/intensité **configurables et
  désactivables** ; ne pas effacer des heures de progression.
- 03-DESIGN-RULES §21–24 : échecs compréhensibles ; pas de destruction
  arbitraire du long terme ; difficulté configurable ; **sandbox =
  mode initial**.
- 05-SIMULATION §3 : « resolve controlled events » existe dans le tick
  canonique ; l'ordre des phases est un contrat de déterminisme ; RNG
  seedée obligatoire (ADR-005).
- AGENTS.md §13 : déterministe, aléa seedé et explicite.

---

## 3. Recommandations D1–D5

### D1 — Contenu MVP : 3 événements cycliques systémiques

Deux modérés négatifs + un positif, tous **ancrés dans un système
existant**, durées et intensités **fixes** (un seul niveau MVP), effet
sur des **taux**, jamais sur des bâtiments (aucune destruction, aucun
mothball forcé — §22).

| Événement | Système | Effet (durée 40 ticks) | Décision joueur créée |
|---|---|---|---|
| **Sécheresse** | Eau | Puits à mi-rendement (2 → 1/tick) | Stock tampon (entrepôts), marge de puits, arbitrer l'admission |
| **Routes commerciales fermées** | Économie | Socle de commerce des ateliers suspendu (bonus 1/planche **maintenu**) | Épargne, revenu fiscal vs commerce, produire des planches pour garder un levier |
| **Récolte exceptionnelle** | Nourriture | Fermes +1/tick (2 → 3) | Profiter du surplus (marché, expansion) avant expiration |

Justification du format cyclique : un seul chemin de déclenchement
(RNG seedée pure), testabilité maximale, cohérence avec « système,
pas arbitraire ». Les événements **conditionnels** (ex. smog si
pollution ≥ 70) sont une extension future — pas de MVP.

### D2 — Politique d'aléa : dérivé du seed du monde → **ADR-007**

Recommandation : les tirages sont une **fonction pure de
(seed du monde, n° d'occurrence)**, indépendants des actions du
joueur. Même pattern que la génération du monde (`createRng`, ADR-005).

- Même seed → mêmes événements aux mêmes ticks → le test self-play
  « deterministic » reste vrai sans affaiblissement ; replay possible.
- L'alternative (seed par partie) casse le déterminisme testable et
  n'apporte aucune valeur MVP. Rejetée.
- ADR-007 « Seeded controlled events » à figer au démarrage du
  Step047 (le présent § D2 en est le contenu).

### D3 — Persistance : oui, v17 → v18

Recommandation : persister les événements **actifs** (type + ticks
restants) et le **compteur de tirages**. SAVE_VERSION 18, migration
v17→v18 triviale et value-preserving : `events: []`,
`eventsDrawn: 0`, `eventsEnabled: false` (un événement actif ne peut
pas exister dans une sauvegarde v17 — le système n'existait pas ;
pattern identique à v13→v14 pour `pollution`).

- Alternative rejetée (recalculer au load) : casserait la continuation
  déterministe après round-trip, aujourd'hui testée
  (`persistence.test.ts`).

### D4 — Sandbox : **off par défaut**, config dans la partie

Recommandation : `eventsEnabled: false` par défaut (règle §24 :
sandbox = mode initial ; §16 : désactivable). Un curseur **fréquence**
à 3 positions — rare (~1000 ticks d'intervalle moyen), normal (~500),
fréquent (~250) — et **pas de curseur d'intensité** MVP (un seul
niveau, simplicité AGENTS.md).

Point de conception important : la configuration vit dans le
**GameState** (persistée v18), pas dans les préférences globales.
Sinon une même sauvegarde chargée avec des préférences différentes
divergerait — contradiction directe avec le contrat de détermination
D2. Le panneau Settings (existant, Step033) expose le toggle et
modifie la partie courante.

### D5 — Présentation : alertes existantes, zéro modal

Recommandation : ligne dans le **système d'alertes existant**
(`analysis.ts` — « states, never instructions ») :
`drought — wells at half output, 23 ticks left`. Aucun popup, aucun
son, rien de modal. Les fonctions pures de production consultent
l'événement actif, donc les **forecasts et overlays restent exacts
sans travail supplémentaire** (pattern Step028 : source unique des
taux).

---

## 4. Périmètre du Step047 proposé (slice verticale)

1. **Domain** — `src/domain/events/events.ts` : définitions (3
   événements, durées, taux), tirage seedé pur `f(seed, occurrence)`,
   `resolveEvents` en **phase 11** du tick réel (après
   `updateEnvironment` ; correspond à la phase 12 canonique — mise à
   jour de l'en-tête de `tick.ts`, contrat d'ordre documenté). Effets
   consultés par les phases de production du tick **suivant** (même
   timing que le staffing — documenté et testé).
2. **Application** — save v18 + migration v17→v18 ; alerte événement
   dans `analysis.ts` ; toggle + fréquence accessibles.
3. **App/UI** — ligne Settings (panneau existant), alerte (flux
   d'alertes existant, zéro nouveau composant).
4. **Renderer** — aucun changement.
5. **Tests** — unit par événement (déclenchement, effet, expiration),
   déterminisme (même seed → même séquence), migration v17→v18,
   round-trip + continuation, self-play re-mesuré **avec événements
   activés** (garde-fou explicite : aucune ligne viable ne doit
   devenir non viable — le piège Step001 est déjà connu).

Estimation : 1 slice majeure, ~2 sessions. Validation complète
(tsc, lint, vitest, build, E2E, CI observée).

## 5. Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| Événement ressenti comme punition arbitraire | Effets systémiques bornés, durées affichées, jamais destructeurs (§22), off par défaut |
| Déséquilibre économique | Self-play re-mesuré on/off ; intensité fixe unique ; pas d'effet sur trésorerie directe |
| Déterminisme cassé | Tirage pure de (seed, occurrence) ; zéro RNG dans le chemin conditionnel ; tests de continuation existants non affaiblis |
| Explosion de scope | 3 événements, 1 curseur, aucune condition d'état — tout le reste est reporté explicitement |

**Reportés explicitement** : événements conditionnels (smog/pollution),
curseur d'intensité, effets sur le commerce extérieur, événements
positifs composés, tout ce qui touche factions/guerre (scope différé).

## 6. Décisions demandées au propriétaire produit

| # | Question | Recommandation |
|---|---|---|
| D1 | Contenu MVP | 3 cycliques : sécheresse, fermeture commerciale, récolte exceptionnelle |
| D2 | Politique d'aléa | Fonction pure (seed monde, occurrence) → ADR-007 |
| D3 | Persistance | Oui — SAVE_VERSION 18, migration triviale |
| D4 | Défaut sandbox | Off ; fréquence 3 positions ; config dans la partie (GameState) |
| D5 | Présentation | Alerte existante + forecasts gratuits ; zéro modal |

**GO Step047 = approbation de ce tableau** (toute ligne modifiable
avant engagement).
