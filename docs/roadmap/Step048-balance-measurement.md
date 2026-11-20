# Step048 — Rythme de jeu et équilibrage : plan de mesure

**Type : cadrage de mesure. Aucun changement de gameplay, aucune
implémentation de tuning dans ce step.** Baseline : `0c47088`
(MVP complet, CI verte). Le livrable de ce step est un **report de
mesures** suivi d'une **liste de propositions de réglage chiffrées** ;
toute application se fait dans un step ultérieur après approbation du
propriétaire (AGENTS.md §17 : jamais de tuning silencieux).

---

## 1. Pourquoi maintenant

- La Phase 10 (MVP) est close : tous les systèmes sont livrés et verts
  (302 unit, 34/34 E2E, CI GitHub verte sur le Step047).
- La plus grande inconnue restante est **produit** : le rythme perçu
  (temps d'atteinte des âges, pression économique, perturbation réelle
  des événements) n'a jamais été mesuré au-delà des jalons self-play.
- Doctrine maison : mesurer avant de tuner (le piège Step001 —
  baseline structurellement non viable découverte par simulation —
  est le précédent fondateur).

## 2. Plan de mesure (trois volets indépendants)

### A. Self-play étendu (automatisé, répétable)

- Horizons longs : runs complets jusqu'à l'Âge 3 inclus (le garde-fou
  Step047 s'arrête à l'Âge 2), avec capture de trajectoire
  tick → {population, trésorerie, nourriture, eau, âge, staffing,
  pollution}.
- Grille événements : off / rare / normal / frequent (même seed) —
  mesure du décalage de rythme causé par chaque curseur.
- Métriques de sortie : ticks d'atteinte de chaque âge, minimum de
  trésorerie, taux de staffing moyen, nombre d'événements vécus par
  type, récupération post-événement.
- Livrable technique : une fonction pure de journalisation dans les
  tests self-play (aucune intrusion dans le domaine).

### B. Session jouée (humaine, le propriétaire)

- Une ou deux parties libres, avec un simple relevé de frictions :
  moments d'hésitation, états incompris, impasses ressenties, curseurs
  jamais touchés. Pas de protocole lourd : une liste à puces suffit.
- Cette voix ne peut pas être simulée : elle arbitre les priorités de
  tuning parmi les mesures de A/C.

### C. Tableaux coût/bénéfice (statique, à partir des définitions)

- Par bâtiment et par âge : coût d'installation, entretien, production,
  payback en ticks dans le contexte D2 (colonie jour-0) et en régime
  établi — recalculé depuis les constantes réelles du code, pas depuis
  la documentation.
- Sert de base de comparaison pour juger si un écart mesuré en A vient
  d'un réglage ou d'un problème structurel.

## 3. Livrable du step

1. **Report de mesures** (docs/roadmap/Step048-report.md) : courbes et
   tableaux des volets A et C, notes brutes du volet B.
2. **Liste de propositions chiffrées** : pour chaque proposition —
   constante touchée, valeur actuelle, valeur proposée, preuve
   (mesure qui la motive), risque estimé, test de garde suggéré.
3. Aucun changement de gameplay dans ce step.

## 4. Non-goals

- Aucune nouvelle mécanique (logistique avancée, événements
  conditionnels, contenu Âge 4 : scopes séparés, à cadrer après).
- Aucun refactor : la base vient d'être nettoyée (Step045).
- Aucun affaiblissement des garde-fous existants (les tests self-play
  restent la ligne de base ; un tuning qui les casse est un signal
  produit, pas un test à ajuster).

## 5. Critères d'acceptation

- Report publié avec les preuves d'exécution (seeds, durées, sorties
  complètes) ; mesures reproductibles (même seed → mêmes courbes).
- ≥ 1 session humaine réalisée et consignée, ou explicitement reportée
  par le propriétaire.
- Chaque proposition de tuning est falsifiable : elle cite sa mesure.
- Suite complète toujours verte à la fin du step.

## 6. Décision attendue du propriétaire produit

- **GO** pour exécuter ce plan de mesure (le step ne touche aucun
  gameplay) ;
- volet B : disponibilité d'une session de jeu, ou report explicite.
