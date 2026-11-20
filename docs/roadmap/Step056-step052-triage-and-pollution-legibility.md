# Step056 — Triage Step052 + reste de la lisibilité pollution

**Type : triage documentaire + quick win UI/lecture. Aucun changement de
mécanique, d'équilibrage, de format de sauvegarde ou d'architecture.**
Baseline : `226a3c3` (working tree propre). Pas de commit (instruction).

---

## A. Contexte

Step052 a relevé neuf frictions (F1–F9). Step053 en a fermé la majorité
(F4, F6, F7, F8) et traité une partie de F1 (flux émission/absorption/net,
libellés, alerte « Growth blocked ») ; F9 avait été corrigé séance tenante.
Ce step établit le triage à jour et ferme **le reste de F1**.

## B. Triage à jour

| # | Friction | État | Décision |
|---|---|---|---|
| **F1** | Crise pollution invisible dans sa solution | **CLOSED** (Step053 + ce step) | Le reste est comblé ici : compte à rebours et lecture par bâtiment |
| **F2** | Scène sombre, ville peu lisible | Différé | Scope visuel V2-V3-V5 (cadrage Step042) |
| **F3** | Caméra non centrée sur la colonie | Différé | Même scope visuel/QA |
| **F4** | Forecasts cryptiques | **CLOSED** Step053 | Libellés production/consommation/stock |
| **F5** | Alerte staffing permanente | Différé (maintenu) | Décision Step053 C.5 : fait vrai, levier joueur réel (mothball), ne masque rien ; à réévaluer en session humaine |
| **F6** | Aucun guidage au placement | **CLOSED** Step053 | Statut de sélection |
| **F7** | Aucun retour après placement | **CLOSED** Step053 | Confirmation + désélection |
| **F8** | Sélection persistante après placement | **CLOSED** Step053 | Décision propriétaire appliquée : désélection après succès, sélection conservée après refus |
| **F9** | Statut chevauchant les contrôles | **CLOSED** Step052 | Correctif CSS |

## C. Le reste de F1 (implémenté)

**Finding (vérifié dans le code) :** l'alerte « Growth blocked » de
Step053 exige un logement disponible (`population < housingCapacity`).
L'ouverture D2 est **pile à capacité** (10 habitants / 10 résidences) :
dans le scénario du playtest (qualité 0), cette alerte ne se déclenche
jamais. La crise restait donc invisible dans sa conséquence pour un
joueur dont le logement est plein — le cas exact du joueur débutant.

**Changements :**

| Fichier | Contenu |
|---|---|
| `src/domain/environment/environment.ts` | `pollutionContributionPerTick(type)` (source unique) ; `pollutionFlows` réécrit dessus (totaux identiques) ; `pollutionTicksToAdmissionBlock(state)` — `null` si le net n'est pas positif, `0` si la porte est déjà fermée, sinon l'échéance exacte |
| `src/application/queries/stats.ts` | expose `pollutionTicksToAdmissionBlock` (dérivé, jamais persisté) |
| `src/app/ui/statsPanel.ts` | ligne `admission block` : `in N ticks` / `blocked now` / `—`, en rouge dès qu'une échéance existe |
| `src/app/ui/inspectionPanel.ts` | champ `pollution` de l'inspection, rendu comme les lignes staffing/logistics |
| `src/app/input.ts` | ligne par bâtiment : `pollution · +1/tick emitted`, `· -2/tick absorbed`, `· none (mothballed)`, `· none while under construction` |
| `tests/environment.test.ts` | +5 tests : table des contributions, parité avec `pollutionFlows`, cas `null`, échéance exacte (70/+1 → 6), mise à l'échelle (63/+2 → 7) |
| `e2e/simulation.spec.ts` | pin de la ligne `admission block` + échéance > 0 après dégradation |

## D. Décisions

1. **Dérivé uniquement** : le compte à rebours est calculé depuis l'état
   (pollution + net), donc aucune migration ni `SAVE_VERSION`.
2. **Comptage unique** : la contribution par type de bâtiment alimente le
   tick **et** l'inspection — les chiffres affichés ne peuvent pas
   diverger du stock réellement déplacé (même contrat que Step053).
3. **Seuil nommé, pas de constante magique** : la porte se calcule comme
   `POLLUTION_MAX - MIN_QUALITY_FOR_ADMISSION` ; elle suit le seuil
   d'admission si celui-ci change.
4. **Aucune alerte modifiée** : le compte à rebours vit dans le panneau de
   stats, et « Growth blocked » garde son rôle (croissance réellement
   bloquée avec logement disponible). Pas de doublon, pas de churn de
   tests.
5. **F5 non touché** : la décision Step053 est maintenue faute de nouveau
   signal ; la session humaine reste l'arbitre.

## E. Validation (exécutée)

| Check | Commande | Résultat |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | **PASS** |
| Lint | `./node_modules/.bin/eslint .` | **PASS** |
| Unit | `./node_modules/.bin/vitest run` | **PASS — 26 fichiers / 341 tests** (+5) |
| Build | `tsc -p tsconfig.build.json` + `vite build` | **PASS** — app 68,23 kB (21,94 kB gzip) + three 470,93 kB |
| E2E | `playwright test` (35 specs) | **PASS — 35/35**, Chromium 1248, 2,8 min, pin `admission block` inclus. Lancé avec le cache de bibliothèques Debian trixie (`LD_LIBRARY_PATH` sur `~/.cache/nova-e2e/root`) et Vite direct, le binaire `pnpm` étant cassé (`libatomic`). Premier run : le pin `> 0` était trop strict — à 8× la porte est déjà fermée et l'échéance vaut légitimement 0 (« blocked now ») ; assertion corrigée en `>= 0`, suite relancée intégralement. |

La suite navigateur livre l'évidence fonctionnelle (présence de la ligne et échéance numérique) ; aucune inspection visuelle manuelle n'a été menée.

## F. Différé (assumé)

- **F2/F3** : visuel (V2-V3-V5, cadrage Step042) ;
- **F5** : alerte staffing, en attente de la session humaine de Step054 ;
- **V2 logistique**, événements conditionnels, contenu Âge 4+ : hors scope.

## G. État Git

`main` à `226a3c3` + modifications Step056 **non committées** (code,
tests, ce report, `STATE.md`, pointeur de roadmap).
