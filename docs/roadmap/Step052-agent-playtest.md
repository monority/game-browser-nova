# Step052 — Playtest d'agent (UI réelle) : report de frictions

**Type : playtest exploratoire via navigateur + 1 correctif CSS livré.**
Session d'agent (vraie interface, clics réels, captures) — complément du
volet B, **pas un substitut** à la session humaine (qui reste ouverte).
Durée simulée : ~3 000 ticks en 1×/8×, pause/placement/overlays/inspection
exercés. Captures : session ZCode (artifacts).

---

## Ce qui marche bien (à ne pas casser)

- Panneau milestones clair (objectifs + coche + progression chiffrée) ;
- bouton désactivé AVEC sa raison (« Market — requires Age 2 ») : excellent ;
- drill-down forecast (clic sur la ligne Food → contributeurs par
  bâtiment avec état de staffing) : le meilleur écran d'analyse du jeu ;
- stabilité : 3 000+ ticks à 8× sans une erreur page, alerts/live
  regions a11y présentes, save/load couverts par E2E.

## Frictions relevées

| # | Friction | Gravité | Nature |
|---|---|---|---|
| **F1** | **Crise pollution invisible dans sa solution** : 2 ateliers → pollution 100 / qualité 0 en ~230 ticks ; admission bloquée, pop 10 figée. Un parc posé ne change RIEN (émission 4/tick vs absorption 1/tick). Aucun forecast pollution, aucun indice que le parc est la réponse ni combien il en faut | **Haute** | Produit |
| F2 | Scène très sombre à zoom par défaut : bâtiments minuscules, réseau peu lisible — on ne « voit » pas sa ville | Moyenne | Visuel (V2/V3/V5 déjà cadrés) |
| F3 | La caméra ne centre pas la colonie au démarrage : premier écran = plan sombre quasi vide | Moyenne | Visuel/QA |
| F4 | Lignes forecast cryptiques (« Food 11/10 · 56 ») : pas de libellés production/consommation/stock | Moyenne | UI |
| F5 | Alerte « Workforce: 10/12 workplaces staffed » permanente en début de partie (12 workplaces D2 pour 10 pop) : bruit qu'on ne peut pas faire taire | Basse | Produit |
| F6 | Aucun guidage après sélection d'un bâtiment : la ligne de statut reste vide, pas de fantôme — « j'ai cliqué Park, et après ? » | Moyenne | UI |
| F7 | Aucun retour après un placement réussi : l'argent baisse en silence (statut vide) | Moyenne | UI |
| F8 | **La sélection de bâtiment persiste après un placement** : le clic suivant sur la carte achète un second exemplaire ; seul garde-fou « Cannot place: occupied » | Moyenne | Décision produit |
| F9 | **Correctif livré séance tenante** : la ligne de statut chevauchait la rangée Route/Save du panneau de contrôles (régression CSS du Step047 — la rangée events a porté le panneau à ~198px, le statut restait à 132px). Corrigé : `bottom: 202px`, vérifié visuellement + E2E settings verts | Bug (réglé) | CSS |

## Triage proposé (décision produit requise sauf F9)

- **Quick wins UI** (une petite slice) : F4 (libellés forecast :
  « production/consumption/stock »), F6+F7 (statut de placement :
  « place the park — click a cell » puis « Park placed. » — states, pas
  instructions) ;
- **Produit — pollution** (F1+F5, le plus gros écart joueur) : ligne
  forecast pollution (émission vs absorption, même tableau que
  food/water) + alerte enrichie en états chiffrés (« pollution 100 ·
  workshops emit 4/tick · parks absorb 1/tick ») — jamais
  d'instruction, mais le joueur peut enfin faire le calcul ;
- **Décision produit ouverte** : F8 (désélectionner après placement ?
  garder pour les poses en série ? les deux jeux font des choix
  différents) ;
- F2/F3 : déjà dans le scope visuel V2-V3-V5 du cadrage Step042.

## Méthode et limites

- Session d'agent : précision de clic par coordonnées canvas, lecture
  DOM + captures ; les temps de réaction et le ressenti esthétique
  restent propres à l'humain — **le volet B (session propriétaire)
  apporte la moitié du signal** ;
- Non exercé cette session : save/load en UI (couvert E2E), progression
  Âge 2-3 complète (couverte self-play + E2E), événements on en UI
  (cadrage Step046 + garde-fous).
