# Step083 — Prix de l'industrie oisive : l'air, pas le travail

**Statut :** décision **et** implémentation. Code modifié, tests mis à jour,
mesures sur le moteur réel.
**Base :** HEAD `5a5ca57`.
**Remplace :** la décision B de Step064 (émission conditionnée au staff) et
referme la ligne OPEN de `docs/STATE.md` sur le commerce non staffé.
**Ne change pas :** le plancher de commerce (2/tick connecté, seuil pop 8), le
bonus de débit (+1/planche), les taux d'émission (atelier 1, carrière 1,
absorption d'un parc 2), l'upkeep uniforme à 1.

---

## 1. Le défaut, tel qu'il était posé

Step064 avait lié l'émission au staffing pour désamorcer un piège de
connaissance : l'ouverture livrée émettait 2/tick sans absorbeur et fermait la
porte d'admission à t=38. Effet de bord mesuré à l'époque : l'atelier oisif
devient gratuit — 2/tick de commerce, 1 d'upkeep, **0 d'émission, 0 de
travail** — donc le parc ne chiffre plus l'industrie et la doctrine « des parcs
avant la croissance » perd son contrepoids.

## 2. L'arbitrage, et pourquoi deux des trois options tombent

Le surplus de l'ouverture D2 (+2/tick) est payé par **deux ateliers que
personne n'occupe** : 10 colons pour 10 postes de fermes et de puits, donc les
deux ateliers restent vacants. Toute politique qui retire ce revenu, ou qui
renchérit le bâtiment, retire le surplus de l'ouverture. C'est vérifiable :

| politique | opening | balanced | age2 | age3 | idle-industry |
|---|---|---|---|---|---|
| **livrée (Step064)** | HEALTHY · pop 10 · 700$ · air 0 | HEALTHY · pop 16 · 773$ | HEALTHY · pop 16 · 853$ | HEALTHY · pop 22 · 2285$ | HEALTHY · pop 10 · **1507$** · air 0 · +5/tick |
| **(1) commerce staffé** (Step065) | -2/tick, trésorerie gelée à 0 dès t=120, `balanced` critical | | | | |
| **(2) émission sans staffing, D2 inchangée** | **CRITICAL** air 100 | **CRITICAL** pop 10 · 0$ | **CRITICAL** pop 10 · 0$ | **CRITICAL** pop 10 · 0$ | CRITICAL |
| **(3) upkeep atelier 3** | **CRITICAL** · 0$ · -2/tick | **CRITICAL** pop 10 · 0$ | **CRITICAL** pop 10 · 0$ | **CRITICAL** pop 10 · 0$ | CRITICAL · -5/tick |
| **(2+) émission sans staffing + un parc livré** | HEALTHY · pop 10 · 400$ · air 0 · +1/tick | HEALTHY · pop 16 · 677$ | HEALTHY · pop 16 · 757$ | HEALTHY · pop 22 · 2189$ | **CRITICAL** air 100 · q0 |

Lecture : (1), (2) et (3) sont des impasses mesurées, pas des intuitions — elles
tuent l'ouverture avant même de corriger quoi que ce soit. La seule ligne qui
tienne les deux bouts est (2+) : **l'émission suit l'activité, pas le staffing**,
et l'ouverture paie le prix avec un parc.

## 3. Décision

1. **Le commerce ne bouge pas.** Le plancher de connexion reste
   staffing-independent (Step012) : un atelier relié à une route rapporte
   2/tick, qu'il soit staffé ou non. Le travail n'est pas le seul prix du
   revenu, et lier les deux casse l'économie de l'ouverture.
2. **L'air est le prix.** L'émission n'est plus conditionnée au staffing : un
   atelier ou une carrière actifs émettent leur taux, occupés ou non. Un atelier
   oisif qui encaisse 2/tick coûte 1/tick d'air, et l'absorbeur est un parc à
   25 $ et 0 poste.
3. **L'ouverture est ré-ancrée, pas la règle contournée.** D2 livre un parc (sans
   route : absorption et re-pousse sont des adjacences pures). Il absorbe
   exactement les 2/tick des deux ateliers vacants : air net 0, trésorerie
   +1/tick au lieu de +2. Une sauvegarde existante n'est pas migrée : la
   composition ne fait pas partie du schéma, et le parc n'est qu'un bâtiment.

## 4. Ce que la mesure a décidé

- **L'exploitation se referme.** La ligne `idle-industry` (3 ateliers achetés
  pour 75 $ sur des cellules déjà reliées, 300 ticks) passe de HEALTHY / 1507 $ /
  air 0 / +5 tick à **CRITICAL / 1207 $ / pollution 100 (q0)** : le troisième
  atelier oisif ne peut plus se payer avec l'air de personne.
- **Les lignes historiques ne bougent pas de nature.** `opening`, `balanced`,
  `age2`, `age3` restent HEALTHY avec les mêmes populations (10/16/16/22) et les
  mêmes avancées d'âge (age2 à t=780, age3 à t=1141). Le coût est monétaire et
  assumé : 700 → 400 $ à t=300 sur l'ouverture (upkeep du parc et plancher de
  l'atelier vacant), -96 $ sur `balanced`, -55 $ sur `age2`, -96 $ sur `age3`.
- **La progression n'est pas ralentie.** Le jalon de trésorerie n'est jamais
  l'unique porte : `canAdvanceAge=false` tant que food30 et tech3 ne sont pas
  atteints, à quoi s'ajoute la porte d'air. La trésorerie plus faible ne décale
  aucune des deux lignes qui avancent d'âge.

## 5. Implémentation

- `src/domain/environment/environment.ts` — `pollutionContributionForBuilding`
  ne consulte plus `building.staffed` ; le commentaire porte la décision et
  nomme Step064 comme superseded.
- `src/domain/simulation/state.ts` — `D2_PARKS = 1`, placé sans route, avec le
  raisonnement (le parc paie les deux ateliers) et la composition documentée.
- `tests/environment.test.ts` — le cas Step064 devient « un atelier actif émet
  même non staffé » (pop 0 : 2 ticks d'émission, pas 1), et un cas **Step083**
  verrouille la décision : le parc de l'ouverture absorbe exactement ses deux
  ateliers (émissions 2, absorption 2, net 0), et un troisième atelier oisif
  relié à une route porte le net à +1 tout en restant `staffed === false`.
- `tests/regrowth.test.ts` — `placeParkNextTo` retourne l'id du parc qu'il pose :
  depuis que D2 embarque un parc, chercher « le parc » par type trouvait le
  mauvais bâtiment (le test mothballait celui de l'ouverture).
- `src/domain/environment/environment.ts` — `pollutionIfMothballed` (loi pure :
  flux sans ce bâtiment + compte à rebours) et un `netOverride` optionnel sur
  `pollutionTicksToAdmissionBlock`, pour que l'hypothèse ne duplique pas la
  formule.
- `src/app/input.ts` — la ligne d'inspection d'un absorbeur nomme la dépendance
  (« load-bearing ») ; la branche morte « pollution · none (unstaffed) »
  disparaît, l'émission ne dépend plus du staffing.
- `src/app/details.ts` — la fiche statique de l'atelier disait « +2 commerce/tick
  when staffed and connected », faux depuis Step012 (plancher
  staffing-independent) : corrigée et complétée de l'émission.
- `tests/worldState.test.ts` — 24 bâtiments, et `count("park") === 1` pinné.
- `tools/agent/scenarios/idle-industry.jsonl` — la ligne d'exploitation devient
  un scénario du dépôt : la décision est rejouable, pas racontée.

## 6. Validation (2026-11-17, sandbox)

`tsc --noEmit` 0 erreur (3.0 s) · `eslint .` 0 (4.2 s) · audit de vacuité
38 fichiers / 195 déclarations, 0 finding (65 ms) · unitaires **181/181 en
5.2 s** (vitest Duration) · build `vite` 3.6 s, app 77.35 kB (24.83 kB gzip) ·
les cinq scénarios mesurés ci-dessus. Aucun test E2E nouveau : la règle est une
loi de domaine, et l'interface lit les mêmes fonctions (`pollutionFlows`).

## 7. Le parc ne doit pas être un piège silencieux

L'ouverture est viable parce qu'elle contient un absorbeur : un joueur qui
mothball le parc pour économiser 1/tick rouvre le piège de Step064 (air
2/tick, porte fermée en ~38 ticks). Le cockpit ne le disait qu'une fois la
porte **déjà** fermée. Step083 ajoute donc l'alerte de compte à rebours — la
même prévision que la ligne `admission block` du panneau, mais dite tout haut :

> `Environment: air closes admission in 38 ticks (net +2/tick)` — warning

Mesuré : l'ouverture livrée ne déclenche rien (net 0, le parc paie les deux
ateliers) ; dès que le parc est mothballé, l'alerte apparaît au tick même, sans
attendre la fermeture. Verrouillé par `tests/analysis.test.ts` (mutation A5).
Effet de bord bienvenu : une **sauvegarde v22 antérieure** à Step083, sans parc
et avec des ateliers oisifs, reçoit la même alerte au chargement — le cas de
compatibilité est signalé au joueur au lieu d'être découvert.

L'inspection répond à la même question **avant** l'action. La loi est pure et
partagée (`pollutionIfMothballed`) : elle retire la contribution du bâtiment du
flux courant et recalcule le compte à rebours. La ligne d'un parc devient :

> `pollution · -2/tick absorbed · load-bearing: mothballing it closes admission in 38 ticks`

Un parc que la colonie ne dépend pas ne porte aucune mention (net déjà ≤ 0 une
fois retiré) : la ligne distingue donc un parc porteur d'un parc décoratif, ce
que le libellé statique ne savait pas faire. Verrouillé par
`tests/environment.test.ts` (porteur : net +2, 38 ticks ; décoratif : pas de
compte à rebours ; id inconnu : aucun verdict) et mutation A6.

## 8. Risques résiduels

1. **Le parc est visible, pas conseillé.** L'alerte et l'inspection disent ce
   qui va se passer, jamais quoi faire : c'est la ligne du cockpit (états, pas
   instructions). Un joueur peut toujours délibérément fermer sa porte
   d'admission.
2. **Sauvegardes v22 antérieures** : couvertes par l'alerte au chargement, mais
   pas migrées — le joueur doit construire son parc lui-même.
3. **Carrières.** La même règle s'applique : une carrière oisive émet 1/tick.
   Aucun scénario livré n'en contient, donc ce chemin est couvert par la loi
   partagée et non par une mesure dédiée.
