# Step054 — Human Playtest & Product Validation

**Type : validation produit. Aucun développement — l'agent prépare
l'environnement et collecte ; le propriétaire joue et juge.**
Baseline : `534f8d4` (Step053 UX & lisibilité). Ce document reste
**ouvert** jusqu'à la session humaine ; aucun résultat n'est pré-rempli.

---

## 1. Objectifs

Déterminer si le Step053 a réellement amélioré l'expérience :
1. la pollution est-elle comprise et exploitable (F1) ?
2. les forecasts sont-ils lisibles (F4) ?
3. le placement est-il guidé, confirmé, et se désélectionne-t-il (F6/F7/F8) ?
4. et, librement : tout ce que la session révélera (rythme, contrôle,
   frictions nouvelles ou restantes).

## 2. État initial du projet

- MVP complet (3 âges), événements contrôlés off par défaut, logistique
  v1 sur l'extraction, SAVE_VERSION 18 ;
- Step053 : pollution net/tick + émissions/absorption dans le panneau de
  stats, alerte « Growth blocked » nommant le seuil 25, forecasts
  `Food +11/-10 per tick · stock N → M ticks`, guidage « Placing X —
  click a free cell », confirmation « X placed. », désélection
  automatique après succès ;
- 320 tests unitaires, 34/34 E2E, self-play 7/7, build verts ;
- ⚠ CI du commit `534f8d4` : rouge sur la seule étape E2E (voir
  `docs/roadmap/Step053-ux-readability.md` § G et la note CI du jour) —
  3 exécutions locales complètes vertes ; à re-juger après re-run CI.

## 3. Scénarios de session (recommandé ~20-30 min)

### A — Début de partie (≈ 5 min)
Nouvelle partie (bouton « Reset saved colony » puis « Load » si besoin,
ou simplement laisser tourner). Observer : compréhension immédiate des
ressources, premiers bâtiments, guidage « Placing … », confirmation
« … placed. », désélection automatique, lisibilité des forecasts.

### B — Gestion économique (≈ 10 min)
Faire grandir la colonie (résidences + fermes/puits, routes, atelier).
Observer : production/consommation/stocks, capacité des forecasts à
anticiper un déficit, drill-down (clic sur une ligne de forecast),
informations difficiles à interpréter.

### C — Pollution (≈ 10 min)
Continuer jusqu'à pollution notable (2 ateliers suffisent en quelques
minutes). Observer : la ligne « Pollution · net ±N/tick », les lignes
« emitted/tick » / « absorbed/tick », la couleur de « Env quality »,
l'alerte « Growth blocked » quand elle apparaît, et surtout : **arrives-tu
à décider quoi construire grâce aux chiffres affichés ?**

### D — Expérience générale (en continu)
Objectifs compris ? hiérarchie de l'information ? rythme ? alertes ?
sentiment de contrôle ? Noter hésitations et agacements au fil de l'eau.

## 4. Instructions de session

1. Lancer le jeu : `pnpm dev` → ouvrir l'URL affichée (serveur déjà
   démarré par l'agent sur http://127.0.0.1:5199/ si disponible) ;
2. jouer normalement, en pensant à voix haute ou en notant au fil de
   l'eau — pas de protocole ;
3. ne pas chercher à « réussir » : la partie représentative vaut mieux
   que la partie optimale ;
4. si un chiffre ou un libellé reste obscur, le noter tel quel (c'est
   exactement le signal recherché).

## 4bis. Exécution agent du scénario (instrument, pas un verdict)

Un harnais rejoue les scénarios A-D à travers la vraie UI (vrais clics,
captures, lecture des panneaux) :

```
pnpm exec playwright test -c playtest/playtest.config.ts
```

Sortie : `playtest/artifacts/PLAYTEST-REPORT.md` + captures PNG par
moment observé (gitignorés). Observations agent déjà collectées :

- **A** : guidage, confirmation, désélection, refus — tous visibles et
  corrects dans l'UI réelle ;
- **B** : le déficit alimentaire est anticipable (compte à rebours) ;
  **nouvelle friction F12** : la ligne eau affiche la consommation
  *servie* (`+10/-0` quand 12 colons ont soif) là où la ligne
  nourriture affiche le *besoin* (`-12`) — sémantique incohérente à
  faire converger ;
- **C** : séquence représentative vérifiée — pollution 100 → alerte
  « Growth blocked » nommant le seuil, colonie vivante (pop 10) → 2
  parcs → pollution 6, croissance reprend (pop 14) → nouvelle pression
  visible (compte à rebours nourriture) ;
- **Constat structurel réaffirmé** : tout déficit non géré au plafond de
  logement efface la colonie (famine all-or-nothing) — les walkthroughs
  agent l'ont déclenché deux fois en construisant du logement sans
  production ; c'est le mécanisme documenté, et la friction la plus
  brutale pour un joueur non averti.

Ces observations agent **préparent** le triage mais ne remplacent pas
le verdict humain (§6).

## 5. Collecte des frictions (à compléter par le joueur)

| # | Description | Moment (tick/âge approx.) | Gravité perçue (1-3) | Reproductible ? | Capture | Proposition libre |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

Une liste à puces libre dans ce fichier (ou ailleurs) convient aussi.

## 6. Résultats

**Réservés à la session humaine — volontairement vides.**

- Verdict F1 (pollution comprise ?) : ______
- Verdict F4 (forecasts lisibles ?) : ______
- Verdict F6/F7/F8 (placement guidé/confirmé/désélectionné ?) : ______
- Frictions nouvelles : ______
- Ressenti général : ______

## 7. Triage et décisions après la session

1. Fusionner les frictions avec celles du playtest d'agent (Step052) ;
2. classer : quick win UI / produit / visuel / différé ;
3. chaque friction mesurable reçoit sa donnée du harnais
   (`tests/measure.test.ts`) avant tout réglage ;
4. constituer le cadrage du step suivant (tuning fin, V2 logistique,
   événements conditionnels, visuel, ou contenu) selon le verdict ;
5. **ne rien implémenter avant le triage assumé par le propriétaire.**
