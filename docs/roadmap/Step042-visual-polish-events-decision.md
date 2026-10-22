# Step042 — Visual Polish & Event Configuration: Decision Document

**Type : cadrage produit. Aucune implémentation, aucun commit.**
Baseline : `25f3037` (Step041). Ce document est la proposition de
décision — rien n'est engagé tant que le propriétaire produit n'a pas
tranché les points D1–D5.

---

## 1. État vérifié du projet

- HEAD `25f3037`, arbre propre, `master` = `main` = `origin`, CI verte
  observée sur les deux branches (runs GitHub réels).
- Gates locales vertes : 278 unit / 21 fichiers, 31/31 E2E Chromium,
  tsc/eslint/build PASS.
- Phase 10 livrée : save/load, settings, time controls, performance
  profiling, E2E full-loop, regression suite, UI polish (Tier2 : a11y,
  live regions, in-place panels, focus). Restent nommément :
  **event configuration** et **visual polish**.
- Trois âges jouables et testés ; atmosphère par âge livrée (Step041) ;
  systèmes : économie, environnement, stockage, staffing, progression.

## 2. Écarts visuels prioritaires (preuves : code + documents)

| # | Écart observé | Preuve | Sévérité |
|---|---|---|---|
| V1 | **Routes illisibles comme réseau** : plaques plates `0x555f6b` à 0,9 tuile → gaps visuels entre cellules contiguës (lecture de réseau cassée), aucune hiérarchie, aucune teinte par âge | `renderer.ts buildRoads` (une plaque BoxGeometry 0.9/0.06) ; 10-VISUAL §4 « readable roads » ; §7 priorité 1 « silhouette and readability » | **Haute** — la lecture du réseau est l'acte visuel le plus fréquent d'un city-builder contemplatif |
| V2 | **Architecture/routes invariantes entre âges** : §2 exige des changements « immediately visible in architecture; roads; transport; lighting… » — seul *lighting/fog* change aujourd'hui (Step016/041) | `atmosphere.ts` (3 palettes) vs `shapes.ts`/`buildRoads` (identiques tous âges) | Moyenne — la lumière dorée de l'âge 3 change déjà la perception globale ; l'écart restant est structurel |
| V3 | **Ville sans vie perceptible** : aucun habitant/courier/véhicule visible (§6 « should be visible enough to make the city feel alive ») | aucun code de présentation d'agents ; 02-MVP exclut les agents individuels canoniques | Moyenne sur le ressenti, mais **hors primitives existantes** → décision artistique + coût perf |
| V4 | **Overlays incomplets** : la liste UI-UX §6 (food, water, energy, traffic, pollution, population, employment, environment) est couverte à ~5/8 — manquent *population* et *employment* (et energy/traffic = hors MVP) | `overlay.ts` : none/staffing/deposits/food/water/pollution | Basse-moyenne — pattern pur `computeOverlay` déjà éprouvé (Tier2), extension mécanique |
| V5 | Accents lumineux (fenêtres allumées, emissive) absents ; ombres absentes | matériaux MeshLambert uniquement, pas de shadow map ; §1 « dark but colorful » partiellement servi par les accents de palette | Basse — ombres = coût GPU à mesurer ; emissive = nouvelle direction matériaux |

**Conforme / pas d'écart** : silhouettes par fonction (9 types, Step013
— §3 respecté), nature obligatoire servie par les parcs (§5 minimal),
hiérarchie d'information et calme par défaut (09-UI-UX §1, panneaux
existants), performances mesurées et bornées (Step027 + Tier2 churn
piné), hover valide/invalide lisible.

## 3. Cadrage des événements — ce qui manque réellement

**Contrats existants (immuables)** :
- 01-PRODUCT-VISION §16 : événements système **cohérents** (économie,
  environnement, production, population, monde), jamais punition
  arbitraire ; fréquence/intensité **configurables et désactivables** ;
  ne pas effacer des heures de progression.
- 03-DESIGN-RULES §21 (échecs compréhensibles), §22 (pas de
  destruction arbitraire du long terme), §23 (difficulté configurable),
  §24 (sandbox = mode initial).
- 05-SIMULATION : phase 12 « resolve controlled events » prévue dans
  le tick canonique ; l'ordre des phases affecte le déterminisme et
  doit être documenté ; RNG seedée obligatoire (ADR-005).

**L'écart réel** : le livrable Phase 10 s'appelle *event
configuration* — mais il présuppose un **système d'événements qui
n'existe pas** (aucune mécanique d'événement dans le code). Activer la
« configuration » d'événements inexistant·e·s est un non-sens produit ;
construire le système complet est du **nouveau scope mécanique**
(AGENTS.md §17/§24 → décision produit explicite requise).

**Décisions produit requises (bloquantes pour tout step événements)** :
- **D1 — Contenu MVP** : quels événements contrôlés ? (proposition à
  formuler par le propriétaire ; ex. 2–3 événements systémiques liés
  aux systèmes existants : environnement, marché, sécheresse…) — ne
  rien inventer ici.
- **D2 — Politique d'aléa** : les événements dérivent-ils du seed du
  monde (rejouables à l'identique) ou d'un seed par partie (chaque run
  varie) ? → ADR requis ; impacte déterminisme et tests.
- **D3 — Persistance** : un événement actif survit-il à save/load ?
  → bump SAVE_VERSION 18 + migration si oui.
- **D4 — Defaults sandbox** : off par défaut (pur sandbox) ou léger ?
  Quels curseurs (fréquence/intensité) dans Settings ?
- **D5 — Présentation** : alerte « states, never instructions »
  (09-UI-UX §7) + inspection ? Rien de modal.

## 4. Comparaison des options

| Option | Valeur utilisateur | Risque | Coût | Validation |
|---|---|---|---|---|
| **A. Visual polish ciblé** (V1 + V4) | Directe, quotidienne : le réseau devient lisible ; 2 overlays complètent la panoplie stratégique | Très faible (présentation pure, primitives existantes, zéro mécanique, zéro migration) | Petit (1 slice) | Facile : unit sur fonctions pures + E2E zéro-erreur + visuel manuel AVANT/APRÈS |
| **B. Spéc événements seule** | Préparatoire uniquement — rien de visible ; **et le cadrage D1–D5 est déjà livré par CE document** | Nul (doc) | Petit | N/A — la spéc détaillée est prématurée tant que D1–D5 ne sont pas tranchés |
| **C. Lot visuel puis spéc événements** | Cumulée, mais la moitié « spéc » de C retombe sur B après ce document | Faible | Moyen | Mixte |

## 5. Recommandation : **Option A** — visual polish ciblé (Step043)

Justification :
1. **V1 est le plus gros écart prouvé** (doc §4/§7 vs code) et se
   règle avec les primitives existantes — aucune décision artistique,
   aucune mécanique, aucune sauvegarde touchée.
2. **B n'a plus de substance** après ce document : tout ce qu'une
   spéc événements peut faire de légal aujourd'hui, c'est attendre tes
   décisions D1–D5. Implémenter sans elles violerait les règles
   maison ; spécifier avant elles serait de l'invention.
3. A ne dépend de rien ; B dépend de toi. On exécute ce qui est
   exécutable.

### Périmètre exact du Step043 proposé
1. **Routes lisibles** (`renderer.ts`, extraction d'une fonction pure
   testable le cas échéant) :
   - continuité : plaque pleine tuile (suppression des gaps) ;
   - relief léger (épaisseur/encadrement) pour la lecture de réseau ;
   - teinte dérivée de l'atmosphère du step courant (`atmosphere.ts`) —
     les routes participent au chapitre visuel de chaque âge (§2).
2. **Overlays population + emploi** (`overlay.ts`, pur) : complète la
   liste UI-UX §6 aux prises existantes — boutons + légendes
   (`controlsPanel`), préférence persistée (`preferences.ts` liste à
   étendre + test pin existant), tests unit du mapping.
3. Validation : unit (mapping routes/overlays), E2E 31→33 (parcours
   overlay existants étendus aux 2 nouveaux + zéro erreur page),
   captures AVANT/APRÈS dans le report, CI verte observée.

### Reportés explicitement
- V2 complet (architecture par âge) : gros lot, à cadrer quand le
  contenu âge 3 s'étoffe ;
- V3 (habitants/couriers) : décision artistique + coût perf ;
- V5 (emissive/ombres) : mesure perf et direction matériaux requises ;
- Tout événement : en attente des décisions **D1–D5**.

### Critères d'acceptation du Step043
- tsc/eslint/vitest/build verts ; suite unit enrichie (routes pures,
  2 overlays) ; E2E verts incl. les nouveaux toggles ;
- aucune migration de sauvegarde ; aucun changement de mécanique ;
- report avec captures comparatives + preuves.

---

**Décisions attendues du propriétaire produit :**
1. GO pour le Step043 (option A) ?
2. D1–D5 (quand tu voudras ouvrir le chantier événements).
