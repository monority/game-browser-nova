# Step053 — UX & lisibilité : report

**Type : amélioration produit ciblée (frictions du playtest Step052).
Aucun changement de mécanique, d'équilibrage, de format de sauvegarde ou
d'architecture.** Baseline réelle : `b995760` (le bilan documentaire est
venu après le `bbe44c1` communiqué). Pas de push (instruction).

---

## A. Résumé

Le joueur comprend désormais : où va la pollution et qui la combat
(émissions/absorption/net par tick, seuil de qualité identifié, alerte
explicite quand la croissance est bloquée par l'air), ce que disent les
forecasts (production/consommation/stock libellés), et ce que fait
l'interface pendant un placement (guidage à la sélection, confirmation au
succès, désélection automatique, raison préservée en cas de refus). F5
(staffing) est diagnostiqué et différé sans changement.

## B. Modifications

| Fichier | Justification |
|---|---|
| `src/domain/environment/environment.ts` | **F1** : extraction de `pollutionFlows(state)` pur (émissions/absorption/net) — comptage unique partagé par la phase de tick et l'UI ; `updateEnvironment` réécrit sur `net` (comportement identique) |
| `src/application/queries/stats.ts` | **F1** : `ColonyStats` expose `pollutionEmissionsPerTick` / `pollutionAbsorptionPerTick` / `pollutionNetPerTick` depuis la fonction pure |
| `src/application/queries/analysis.ts` | **F1** : alerte `warning` « Growth blocked: air quality X < admission threshold 25 (pollution Y) » quand pop > 0, logement disponible, nourriture présente et qualité < 25 (seuil d'admission, source unique) |
| `src/app/ui/statsPanel.ts` | **F1/F4** : lignes `Pollution · net +N/tick` (danger si tendance > 0), `emitted/tick`, `absorbed/tick` ; `Env quality` colorée sous le seuil d'alerte 50 ; forecasts libellés `Food +11/-10 per tick` / `stock 56 → N ticks` |
| `src/app/ui/controlsPanel.ts` | **F6/F8** : `clearBuildSelection()` ; les callbacks de sélection ne partent que sur changement effectif (garde `announcedSelection`) — sans lui, le callback null partait à chaque tick et aurait effacé des statuts sans rapport |
| `src/app/ui.ts` | Façade : `clearBuildSelection()` exposé à l'app |
| `src/app/boot.ts` | **F6** : le callback de sélection affiche le guidage (« Placing Farm — click a free cell », non annoncé) et efface le statut à la désélection |
| `src/app/input.ts` | **F7/F8** : placement réussi → confirmation « Farm placed. » + désélection automatique ; refus → raison préservée, sélection conservée ; garde `placedThisInteraction` pour que l'événement `click` qui suit un placement ne retombe pas en inspection |
| `e2e/interaction.spec.ts` | Pin forecast mis à jour au nouveau format ; nouveau scénario guidage/confirmation/désélection/refus ; les 3 tests qui comptaient sur la sélection persistante passent au nouveau contrat ; le scénario analysis vérifie l'alerte de blocage |
| `tests/environment.test.ts` | **F1** : `pollutionFlows` pur (2 ateliers → +2 ; + parc → net 0) et exposition via `getColonyStats` |
| `tests/analysis.test.ts` | **F1** : alerte de blocage (présente qualité 20, absente qualité 90) |

## C. Décisions

1. **Comptage unique** (F1) : la fonction pure vit dans le domaine et
   sert aux deux côtés — zéro duplication, zéro forecast approximatif ;
   les nombres affichés sont exactement ceux du tick.
2. **Le seuil 25 est nommé dans l'alerte** (et le seuil d'alerte 50 est
   rendu visible par la couleur de la ligne qualité) — états chiffrés,
   jamais d'instruction (design rule §7).
3. **Désélection automatique APRÈS confirmation** (F8) : l'ordre
   `clearBuildSelection()` puis `setStatus("Farm placed.")` est un
   contrat — la désélection efface le guidage via le callback, la
   confirmation est le message final. Un refus ne désélectionne jamais.
4. **Suppression de l'inspection fantôme** : après un placement réussi,
   l'événement `click` du même geste ne re-déclenche pas l'inspection
   (sinon elle écrasait la confirmation) — cause racine trouvée par E2E.
5. **F5 différé** : l'alerte staffing est `info`, vraie (2 workplaces
   D2 > 10 pop), dotée d'un levier joueur réel (mothball) et ne masque
   rien (les alertes s'empilent). Aucune correction sûre démontrée →
   documenté, inchangé.
6. **Correction de fact** : le report Step052 citait « émission 4/tick
   vs absorption 1/tick » ; les constantes réelles sont 1/tick par
   atelier et 2/tick par parc — le scénario playtest (2 ateliers + 1
   parc) donnait un **net 0** : pollution épinglée au plafond, pas
   « mal combattue ». Le mécanisme du finding reste valide ; le présent
   step corrige le chiffre.

## D. Tests (résultats réels)

- `pnpm check` (tsc strict + eslint + unit) : **PASS — 25 fichiers /
  320 tests** (+4 : pollutionFlows ×2, alerte blocage ×2)
- `pnpm test:e2e` : **PASS — 34/34** (34 = 33 + 1 nouveau scénario
  placement ; pins mis à jour au nouveau format forecast)
- `pnpm test:selfplay` : **PASS — 7/7** (déterminisme et garde-fous
  économiques intacts)
- `pnpm build` : **PASS** (app 59,9 kB + three 471 kB)

## E. Validation visuelle (navigateur réel, 1440×900 et 1024×640)

- Panneau stats : `Pollution 100 · net +2/tick` en rouge, `emitted/tick 2`,
  `absorbed/tick 0`, `Env quality 0` rouge — le rapport de forces est lisible ;
- Forecasts : `Food +11/-10 per tick · stock 120` — explicite, hiérarchie
  claire, pas de chevauchement à aucune des deux tailles ;
- Cycle de placement parcouru dans la vraie UI : guidage à la sélection →
  confirmation « Farm placed. » → palette désélectionnée → le clic suivant
  inspecte au lieu de re-poser ;
- Alerte « Growth blocked » : couverte par E2E (texte + sévérité) ; le
  style réutilise la classe d'alerte warning existante, déjà validée
  visuellement ;
- Note : la surface pointeur de l'onglet de validation est devenue
  instable en fin de session (instabilité IAB, pas du jeu) — la fin du
  parcours visuel a été pilotée via les mêmes handlers (événements
  synthétiques) et les E2E Playwright à vrais clics.

## F. Points différés

- **F5 staffing** : différé (voir C.5) — à reconsidérer si le joueur
  signale le bruit en session humaine ;
- **F2/F3 (visuel)** : hors scope, appartiennent au cadrage V2-V3-V5 ;
- **Comptes à rebours forecast** : le libellé affiche désormais le stock
  et la tendance ; une ligne dédiée « net » par ressource (au-delà de la
  couleur) serait redondante — non faite.

## G. État Git

- Branche `master`, HEAD `b995760` + **2 commits locaux non poussés**
  (instruction : pas de push) :
  - Step053 implémentation + tests (à créer au commit) ;
  - report + STATE.md.
  Les deux seront fusionnés en un ou deux commits au moment du commit.
- Arbre de travail : modifié (Step053), aucune perte, `origin` à
  `bbe44c1..b995760` synchronisé.
