# NOVA — Registre des décisions de design

> **Rôle.** Une seule question : *quelle décision est prise, par qui, quand, et
> qu'est-ce qui serait nécessaire pour la rouvrir ?* Ce registre ne crée aucune
> règle : il renvoie à la fiche ou au document qui la porte. Il existe parce
> qu'une décision rejetée revient toujours sous un autre nom si personne ne se
> souvient qu'elle a été rejetée, et pourquoi.
>
> Audit du 2026-11-20. Aucune décision n'a été prise ici ; D6 (débit de
> l'atelier) y est **enregistrée** le 20/11 parce que le propriétaire l'a tranchée
> et qu'elle est appliquée (fiche `decisions/D6-workshop-rate.md`).

## 1. Légende

| Statut | Sens |
|---|---|
| **Adoptée** | décidée par le propriétaire (ou par une mesure qui la rend nécessaire), appliquée, mesurée |
| **Adoptée, non mesurée** | décidée et appliquée, sans mesure de son effet complet |
| **Rejetée** | examinée puis écartée ; sa réapparition exige une preuve nouvelle |
| **Ouverte** | question posée, aucune réponse ; une recommandation existe, elle n'engage rien |
| **Expérimentation** | code conservé mais hors du jeu livré, pour garder une mesure reproductible |
| **Hypothèse à mesurer** | affirmée sans preuve ; ne doit jamais servir de fondation |

## 2. Décisions adoptées (ne se rouvrent pas sans preuve)

| # | Décision | Date | Source | Ce qu'elle interdit |
|---|---|---|---|---|
| ADR-001 | Simulation indépendante du rendu | — | `docs/adr/ADR-001` | mettre une règle de jeu dans `src/renderer` |
| ADR-002 | Tick fixe et déterministe | — | `docs/adr/ADR-002` | toute animation ou `Math.random` qui pilote l'état |
| ADR-003 | Logistique agrégée au MVP | — | `docs/adr/ADR-003` | simuler des coursiers individuels |
| ADR-004 | Population agrégée au MVP | — | `docs/adr/ADR-004` | simuler des citoyens |
| ADR-005 | Génération de monde par graine | — | `docs/adr/ADR-005` | un monde non reproductible |
| ADR-006 | Persistance versionnée | — | `docs/adr/ADR-006` | casser les sauvegardes sans migration |
| ADR-007 | Événements contrôlés par graine | — | `docs/adr/ADR-007` | des événements narratifs arbitraires |
| ADR-015 | Vite + DOM vanilla (écart assumé) | — | `docs/adr/ADR-015` | réintroduire un framework sans décision |
| ADR-016 | Ordre de staffing : ferme → puits → reste | 18/11 | `docs/adr/ADR-016` | réordonner la file comme levier de croissance (mesuré : camp d'abord → pop 60 au lieu de 86) |
| D1 | Technologie de puits hors du catalogue livré | 19/11 | `decisions/D1-option-c.md` | la réintroduire sans rouvrir D2 et D4 |
| D2 | Dimensionnement des puits sur le rendement nominal (`waterPerWell`) | 19/11 | `decisions/D2-well-build-policy.md` | réécrire `ceil(N/2)` en dur dans une seconde loi |
| D3 | Les ressources construisent, l'argent arbitre | 20/11 | `decisions/D3-stone.md` §7 | un bâtiment payé uniquement en argent (hors infrastructure/civique) ; la carrière payée en pierre |
| D6 | Débit de l'atelier : **2 planches pour 2 bois** par tick et par atelier staffé | 20/11 | `decisions/D6-workshop-rate.md` | produire sans ouvrier, sans bois ou hors activité ; rouvrir le débit sans rejouer la grille des six scénarios |
| Step065 | Le marché d'âge 2 est retiré | — | `docs/game/07` §10.1 | réintroduire un jalon de marché sans marché |
| Step070 | Les jalons de trésorerie sont supprimés ; deux technos d'âge 3 à 800/1 200 $ | — | `progression.ts`, `techs.ts` | gaté un âge sur « avoir N pièces » |
| Step083 | Émissions liées à l'activité (un parc au jour 0 absorbe les 2 ateliers) | — | `state.ts` (commentaire), `environment.ts:133` | faire émettre un bâtiment en veille comme s'il tournait |
| Crise hydrique | Seuil sévère 75 %, conséquences graduelles, récupération graduelle, plancher 2 colons | — | `water.ts`, 46 tests | toucher aux seuils sans rejouer la suite de crise |

**Décisions adoptées mais non mesurées complètement** : D2 (la doctrine est
appliquée et la loi unique vérifiée, mais son effet sur la population n'a pas
été rejoué sur les trois parcours) ; D3 (barème chargé et mesuré, mais le
critère d'acceptation §7.5.4 échoue — voir §4) ; D6 (les six scénarios de l'ADR
sont joués aux deux débits, mais deux de ses critères — marge de travailleurs,
surplus sans conséquence — ne dépendent pas du débit).

## 3. Décisions rejetées (et pourquoi)

| # | Proposition rejetée | Date | Raison mesurée | Ce qui la ferait revenir |
|---|---|---|---|---|
| R1 | Jalon d'âge « avoir N pièces » | Step070 | la trésorerie monte sans jouer ; un jalon de trésorerie achète l'âge | rien : contredit `07` §3 (jalons = faits, pas d'accumulation) |
| R2 | Marché d'âge 2 comme condition de passage | Step065 | le marché n'existe plus ; le jalon demandait un bâtiment absent | un modèle de commerce décidé |
| R3 | Camp de bûcherons classé avant les ateliers | 18/11 (ADR-016) | planches 27–36 mais population 86 → 60 | une mesure qui montre l'inverse sur une ligne de croissance |
| R4 | `staffed ? revenu : 0` appliqué d'emblée au commerce | GAME-DESIGN-ECONOMY §4 | risque d'assécher l'ouverture (−2 $/tick) sans mesure | une mesure du budget d'ouverture avec la règle |
| R5 | « Dépense artificielle » pour vider la trésorerie | D4 §3 | ne crée aucune décision, seulement une fuite | aucune : `03` §5 l'interdit |
| R6 | Objectif de fin de partie « population 60 » | D5 §2 | 60 est un plafond de financement, 86 un plafond de harnais | une population cible décidée et mesurée |
| R7 | Objectif « tenir N ticks » | D5 §2 | récompense l'inaction (le témoin survit 1 500 ticks) | aucune |
| R8 | Option C **livrée** (techno de puits) | D1, 19/11 | libère un poste mais laisse ~6 000 pièces sans emploi | rouvrir après D2 **et** D4 |
| R9 | Simuler chaque citoyen / chaque coursier | ADR-003/004 | aucun gain de décision, coût de simulation | une mécanique qui l'exige réellement |
| R10 | Prix indexés sur la population (D4 option C) | D4 §3 | rend toutes les mesures antérieures incomparables | une décision explicite du propriétaire |

## 4. Décisions ouvertes

| # | Question | État | Recommandation de la fiche | Ce qui bloque |
|---|---|---|---|---|
| **D4** | À quoi sert l'argent après l'ouverture ? | ouverte | dépense **récurrente** liée au parc, jamais un jalon de trésorerie | manque le débit net à pop 86 (§6 de la fiche) |
| **D5** | Comment une partie se termine-t-elle ? | ouverte | objectif de développement multicritère + état terminal à pop 0 | dépend de D4 et de besoins livrés |
| **O2** | Le stock de 12 planches du jour 0 est-il suffisant ? | ouverte | à mesurer (risque de boucle industrielle morte, `DESIGN-ALIGNMENT` §5.6) | aucune mesure du gisement adjacent au centre |
| **O3** | La pierre doit-elle avoir un second consommateur ? | ouverte | un seul usage (8 pierres par entrepôt) est le minimum qui satisfait la règle 9 ; un second usage viendra avec les bâtiments lourds d'âge 2 | pas de bâtiment lourd existant |
| **O4** | Le commerce doit-il dépendre du staffing ? | ouverte (R4) | oui, mais après mesure du budget d'ouverture | mesure manquante |
| **W1** | Où part la main-d'œuvre, et comment en libérer ? | **tranchée le 20/11 : modèle C livré** (allocation conditionnelle) | le blocage mesuré n'était pas la dotation mais l'ordre du seau « reste » : le bûcheron était staffé 2 % des ticks, les ateliers 3,07 sur 4 ; la loi fait 0,74 et 0,39 et supprime les ateliers-ticks sans bois | `decisions/W1-conditional-workforce-allocation.md` ; reste D4 et la langue des libellés |
| **O5** | Quels besoins après l'eau et la nourriture ? | ouverte | une catégorie de biens d'abord, puis les services | P1-1 : sans marge de main-d'œuvre, un atelier de biens ne serait jamais staffé |
| **D7** | L'usure des bâtiments remplace-t-elle un besoin de confort ? | ouverte : principe retenu le 21/11, **valeurs non tranchées** | 1 outil par poste tous les 20 ticks, pris sur le **bois** ; un poste sans outil rate son tick (ordre canonique) | la filière bois n'est jamais ouverte (0 camp, gisements 100/100) et `age3` tourne à `workforce 17/22` — fiche `decisions/D7-tools-wear.md` §3 |

**D4 est le verrou du projet.** O1 (débit de l'atelier) est tranchée et
appliquée depuis le 20/11 : elle a fait passer la ligne de croissance de 28 à
78 colons sans rendre les trois tests de parcours verts. Ces trois rouges
attendent maintenant D4 (trésorerie finale 2 839) et O5 (aucun besoin au-delà de
manger et boire) ; les réécrire pour faire vert serait maquiller la régression,
ce que la discipline du dépôt interdit.

## 5. Expérimentations (code présent, jeu livré inchangé)

| # | Objet | État | Où | Pourquoi conservé |
|---|---|---|---|---|
| E1 | Option C : techno de puits (`wellShafts`) | `shipped: false` | `techs.ts:52-60` | la mesure qui l'a produite reste reproductible ; le joueur ne peut pas l'acheter |
| E2 | Taux de conservation 3 %/tick | livré mais « expérimental » (contrat §11) | `conservation.ts:15` | 5/7 garde-fous passent, 2 échecs dus à une réserve de gouverneur |
| E3 | Événements (`bountifulHarvest`, `tradeClosure`, sécheresse) | implémentés, **désactivés par défaut** | `state.ts`, `analysis.ts:207` | pression systémique testable, pas de punition arbitraire |
| E4 | Harnais d'auto-jeu (`playGame`) | outil de mesure | `tests/selfplay.test.ts` | seule façon de mesurer une ligne de 1 500 ticks |
| E5 | Mode « haut débit d'atelier » | **livré le 20/11** (D6), mesure conservée | `D6-workshop-rate.md` §4, `tests/measure-throughput.test.ts` | rejouer la grille des six scénarios aux deux débits quand une loi change |
| E6 | Allocation conditionnelle bûcheron / atelier (`conditional-wood`) | **loi officielle** (20/11) : défaut du jeu ; `baseline` ne sert plus qu'à la mesure | `jobs.ts` (`staffingDecision`), `building/activity.ts`, `W1-conditional-workforce-allocation.md` | bûcheron 2 % → 74 % des ticks, planches ×19, ateliers-ticks sans bois 0 ; trésorerie en baisse (D4) |

Aucune expérimentation ne doit être présentée comme une valeur livrée. C'est la
faute que D1 a corrigée : le paragraphe §10.7 de
`GAME-DESIGN-WORKFORCE.md` le dit explicitement depuis le 19/11.

## 6. Hypothèses à mesurer (jamais des règles)

1. **Débit monétaire net à pop 86** : inconnu ; condition pour dimensionner une
   dépense récurrente (D4 §6.1).
2. **Courbe de trésorerie tick par tick** : on connaît le stock final, pas le
   moment où il décolle (D4 §6.2).
3. **Seuil de douleur d'un joueur** : aucun test humain (D4 §6.3).
4. **Effet d'une dépense récurrente à pop 10–15** : risque d'assécher la
   croissance, non mesuré (D4 §6.4).
5. **Ligne de 3 000 ticks** : aucune jouée ; on ignore si 86+ colons tiennent
   (D5 §6.1).
6. **Scénario d'événements complet** : la résilience (D5 option C) n'a aucune
   base mesurée (D5 §6.2).
7. **Affichage de l'âge 4** : personne n'a vérifié ce que l'interface montre
   quand `state.age = 4` (D5 §6.4).
8. **Gisement de bois adjacent au centre au jour 0** : conditionne le risque de
   boucle industrielle morte (`DESIGN-ALIGNMENT` §5.6).
9. **Un atelier à 2 planches/tick sur les trois parcours de référence** :
   mesuré le 20/11 sur six scénarios et sur la ligne gouvernée (78 colons), mais
   pas rejoué sur les trois parcours du MVP (D6 §4).

## 7. Décisions qui exigent l'accord du propriétaire

| Question | Pourquoi ce n'est pas à l'agent de trancher |
|---|---|
| D4 — dépense récurrente | définit ce que l'argent achète, donc la boucle économique entière |
| D5 — destination de la partie | définit ce qu'est « gagner » ; aucune mesure ne peut décider à la place du design |
| O5 — premier besoin non vital | définit ce que le MVP doit contenir en plus de survivre |
| Prix indexés (R10) | rendrait toutes les mesures du dossier incomparables |
