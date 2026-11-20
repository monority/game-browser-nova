# NOVA — Rebalance roadmap

Version : 0.3 (révisée le 20 novembre 2026, voir §11–§17) — les §1–§10 restent
l'état daté du 18/11 et sont conservés comme historique  
Date : 20 novembre 2026 (première version : 18 novembre 2026)  
Baseline : `94cbff2`, révisée sur `88900bc` (référence corrigée le 20/11 : ce
commit n'existe pas dans le dépôt ; l'état mesuré de référence est `6e7e593` plus
l'arbre de travail D3, voir `D3-stone.md` §7.8)  
Statut : proposition de séquencement, aucune implémentation autorisée par ce document

> **Point d'entrée.** Pour savoir quoi faire ensuite, lire §11–§17. Les §1–§10
> décrivent l'économie du 18 novembre ; trois de leurs constats sont périmés
> (pierre morte, plafond de financement, jalons de trésorerie).

## 1. Objectif global

Passer d'une économie qui se bloque structurellement puis accumule une monnaie sans usage à une progression où :
- les besoins essentiels sont couverts ;
- une marge de workforce rend l'industrie accessible ;
- les chaînes de ressources ont un débit réel ;
- les revenus reflètent une activité économique ;
- les dépenses financent des choix ;
- les âges ouvrent du contenu ;
- la partie possède une destination claire.

## 2. Priorités

Ordre révisé le 18 novembre 2026, après la mesure du correctif D. L'état indiqué
est un état **mesuré**, jamais un état documentaire : un document écrit ne ferme
aucune phase.

| Priorité | Sujet | État au 18/11/2026 |
|---|---|---|
| P0 | Baseline et instrumentation | **Fait** : lois, coûts, ordre de staffing, 20 seeds, contenu mort (`../PHASE0-VERIFICATION-2026-11-18.md`) |
| P1 | **Consolider les décisions de staffing** | **Fait** : ordre conservé et documenté (`../../adr/ADR-016-staffing-priority-order.md`), surface alignée sur le tick, tests de non-régression ; la **marge** de main-d'œuvre reste ouverte |
| P1 | **Étudier la chaîne industrielle avant 13 colons** | **D1 tranchée le 19/11** (techno hors catalogue livré) ; **D2 tranchée le 19/11** : `ceil(N/rendement)+1` est dominée sur la loi livrée ; doctrine nominale appliquée et poussée (`6e7e593`) |
| P1 | **Définir le rôle économique de la pierre** | **Tranchée le 20/11** : les ressources construisent, l'argent arbitre ; l'entrepôt exige 8 pierres (fiche **D3** §7, `02-MVP.md` §4) — reste à implémenter et à mesurer |
| P2 | **Diagnostiquer le plafond de population à 60** | **Diagnostiqué**, non corrigé : `DIAGNOSIS-POPULATION-PLATEAU.md` ; le plafond observé n'est pas une loi du jeu mais un plafond de financement du logement |
| P2 | Monnaie et commerce | **En attente** : le commerce dépend encore d'ateliers qui ne tournent pas ; le rebalancer maintenant reviendrait à équilibrer sur une chaîne morte. Débouchés comparés dans la fiche **D4** |
| P3 | Âges, technologies, déblocages | **En attente** : l'âge 3 n'est satisfait par aucune des deux lignes de référence à t≤1 500 ; le prototype de l'option C le rend satisfaisable (18 nov. 2026, `GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8), décision non prise |
| P3 | Endgame et états terminaux | **En attente** : options comparées dans la fiche **D5**, aucune retenue à ce jour |
| P4 | UX de diagnostic et accessibilité | **Partiellement fait** : causes d'inactivité (`no-workers`), rang et affectation affichés sont ceux du tick ; les travailleurs libres ne sont pas exposés |

## 3. Phases et gates

### Phase 0 — Verrouiller la baseline

**But :** transformer le bilan ponctuel en scénarios de référence fiables.

Travail :
- confirmer les valeurs de coûts dont l'unité est ambiguë ;
- enregistrer le scénario de départ et les commandes ;
- relever les flux par tick et les états de staffing ;
- vérifier les mêmes mesures sur plusieurs seeds ;
- définir au moins une politique prudente et une politique orientée croissance.

Gate de sortie :
- les mesures sont reproductibles ;
- les différences entre seeds sont documentées ;
- les lois existantes et les hypothèses de conception sont séparées ;
- aucune valeur économique ambiguë n'est utilisée comme fondation d'un arbitrage.

### Phase 1 — Résoudre la workforce

**But :** libérer une marge de travail sans rendre la survie triviale.

Travail :
- comparer les modèles de workforce documentés ;
- fixer les coûts de main-d'œuvre par bâtiment ;
- définir l'ordre déterministe d'allocation ;
- définir les états d'inactivité et leurs causes ;
- tester la première industrie dans une partie normale.

Gate de sortie :
- les besoins essentiels peuvent être couverts ;
- une première chaîne industrielle peut être staffée sans sacrifier immédiatement la survie ;
- les pénuries restent possibles et compréhensibles ;
- les affectations sont déterministes ;
- le tick et les prévisions partagent la même règle.

### Phase 2 — Rendre les ressources industrielles accessibles

**But :** vérifier que la chaîne wood → planks → stone → warehouse fonctionne réellement.

Travail :
- revoir l'accès initial aux dépôts et l'emplacement du centre ;
- vérifier les prérequis de construction et de connectivité ;
- valider les flux d'entrée/sortie de chaque maillon ;
- confirmer l'utilité et le timing du stockage supplémentaire.

Gate de sortie :
- le joueur peut atteindre chaque maillon dans une partie normale ;
- aucune étape ne dépend d'une production passive inexistante ;
- les stocks et capacités restent cohérents ;
- plusieurs seeds ne produisent pas de softlock industriel.

### Phase 3 — Rebalancer revenus, coûts et commerce

**But :** faire dépendre les revenus commerciaux de conditions de gameplay réelles et maintenir une trésorerie décisionnelle.

Travail :
- définir les conditions du revenu commercial ;
- comparer commerce connecté/non staffé et staffé ;
- mesurer l'effet sur le budget d'ouverture ;
- réévaluer taxes, entretien et coût de croissance ;
- définir les signaux de trésorerie nulle et d'impasse.

Gate de sortie :
- l'ouverture n'est pas condamnée par une règle de revenu trop brutale ;
- une croissance démographique a un coût lisible ;
- les revenus ne sont pas générés par des bâtiments inactifs sans justification ;
- le joueur dispose de dépenses utiles sans inflation artificielle ;
- aucune impasse silencieuse connue ne subsiste.

### Phase 4 — Donner une fonction à la progression

**But :** rendre les âges, technologies et déblocages effectifs.

Travail :
- fixer le nombre et les conditions des âges ;
- associer du contenu réel à chaque âge ;
- décider du sort de `requiredAge` ;
- définir les effets utiles des technologies ;
- borner l'avancement au dernier âge.

Gate de sortie :
- aucun âge inexistant ne peut être atteint ;
- chaque âge change les possibilités du joueur ;
- les déblocages sont cohérents entre domaine, commandes et UI ;
- les technologies créent des choix mesurables.

### Phase 5 — Définir l'endgame et le cycle complet

**But :** donner une destination au développement de la colonie.

Travail :
- choisir une condition de victoire ou un objectif final ;
- définir les conditions de défaite ou de stagnation, si retenues ;
- relier l'objectif final à plusieurs systèmes réellement fonctionnels ;
- vérifier qu'il ne se résume pas à accumuler de la monnaie.

Gate de sortie :
- une partie peut atteindre un état final explicite ;
- l'objectif est compréhensible et atteignable ;
- les conditions d'échec sont prévisibles ;
- le cycle complet a été testé du départ à la fin.

### Phase 6 — UX, accessibilité et balance globale

**But :** rendre les règles lisibles et vérifier la robustesse globale.

Travail :
- afficher les causes réelles d'inactivité ;
- améliorer les alertes de budget et de blocage ;
- auditer clavier, focus, labels et annonces accessibles ;
- jouer plusieurs stratégies et plusieurs seeds ;
- mesurer les durées et les courbes de progression.

Gate de sortie :
- les blocages indiquent une cause vérifiée ;
- les actions suggérées sont réalisables ;
- les parcours essentiels sont accessibles au clavier ;
- les scénarios de référence ne présentent pas de stratégie dominante évidente ;
- les résultats sont documentés.

## 4. Dépendances

```text
Baseline
   |
   v
Workforce
   |
   v
Accès aux ressources industrielles
   |
   v
Économie / commerce / dépenses
   |
   v
Progression / déblocages
   |
   v
Endgame
   |
   v
UX et balance globale
```

Les phases peuvent se chevaucher au niveau documentaire, mais les arbitrages économiques ne doivent pas être figés avant la validation de la workforce et des chaînes de ressources.

## 5. Invariants à préserver

- Déterminisme de la simulation.
- Une seule source de vérité pour les règles et les prévisions.
- Lois de crise hydrique déjà validées : seuil sévère 75 %, conséquences graduelles, récupération graduelle.
- Aucun changement de nourriture ou d'eau utilisé comme compensation indirecte d'un problème de workforce.
- Pas de valeur de balance définitive sans scénarios chiffrés.
- Pas de changement structurel large sans nécessité démontrée.

## 6. Protocole de validation commun

Pour chaque phase :

1. Capturer l'état initial, le commit et le seed.
2. Énoncer l'hypothèse testée et le résultat attendu.
3. Exécuter les scénarios sur le tick réel, pas dans une simulation parallèle.
4. Mesurer les flux, stocks, budgets, affectations et jalons pertinents.
5. Répéter les scénarios avec plusieurs seeds.
6. Vérifier le déterminisme et la cohérence des prévisions.
7. Exécuter les tests ciblés, typecheck, lint et build pertinents.
8. Effectuer une validation cockpit / navigateur pour les changements visibles.
9. Documenter les écarts, régressions et limites.
10. N'accepter la phase que si son gate est satisfait.

## 7. Scénarios de référence minimum

| Scénario | Intention |
|---|---|
| Développement équilibré | Couvrir les besoins, développer l'industrie et progresser |
| Croissance rapide | Tester le coût marginal des colonists et la pression sur les ressources |
| Industrie précoce | Tester l'accès au bois et la chaîne de transformation |
| Économie prudente | Vérifier qu'une partie lente ne se bloque pas |
| Dépenses minimales | Détecter l'accumulation monétaire sans débouché |
| Seed défavorable | Détecter les problèmes de placement et d'accès aux dépôts |
| Impasse budgétaire | Vérifier la détection et les possibilités de reprise |

## 8. Hors périmètre immédiat

À ne pas lancer avant les gates correspondants :
- refonte générale de l'architecture ;
- réécriture du moteur de simulation ;
- ajout de nouvelles ressources sans boucle complète ;
- ajout de classes de population ;
- ajout de systèmes sociaux ou de besoins supplémentaires ;
- modification des lois hydriques validées ;
- ajout de dépenses artificielles pour absorber la monnaie.

## 9. Prochaine étape concrète (révisée le 18 novembre 2026)

1. **Consolider les décisions de staffing.** Fait pour l'ordre (ADR-016) ; reste à
   décider si la survie doit rester une couverture exacte ou recevoir une marge
   explicite (voir `GAME-DESIGN-INDUSTRY-BEFORE-13.md`, options A à E).
2. **Étudier la chaîne industrielle avant 13 colons.** Fait pour la mesure :
   option C prototypée puis mesurée (`GAME-DESIGN-INDUSTRY-BEFORE-13.md` §8). Elle
   accélère la croissance et rend l'âge 3 franchissable, mais ne libère aucun poste
   tant que le plan bâtit `ceil(N/2)+1` puits, et elle laisse près de 6 000 pièces
   sans emploi. **D1 est tranchée (19 novembre 2026)** : la techno sort du catalogue livré et
   reste en prototype mesurable. L'étape suivante est **D2** (politique des
   puits). Aucun coefficient n'est fixé avant cette décision.
3. **Définir le rôle économique de la pierre.** Décision du propriétaire du design :
   consommateur réel ou retrait de la carrière et des technologies associées.
4. **Diagnostiquer le plafond à 60.** Diagnostic livré ; la correction éventuelle
   vient après la décision de la ligne 2, parce qu'une marge industrielle change la
   trajectoire du logement.
5. **Reprendre le rééquilibrage monétaire et la progression** seulement ensuite.

Critère de sortie commun : une étape n'est terminée que si son résultat est observé
en partie sur le tick réel, avec ses mesures consignées — pas parce que ce document
la décrit.

## 10. Fiches de décision ouvertes (18 novembre 2026)

Les arbitrages sont séparés en cinq fiches, dans `decisions/`. Chacune distingue
le vérifié, le mesuré, le dérivé, l'hypothèse et la donnée manquante, et propose
une recommandation argumentée — sans décider.

| Fiche | Question | État | Recommandation de la fiche |
|---|---|---|---|
| `decisions/D1-option-c.md` | Garder, modifier ou retirer la technologie de puits ? | **tranchée 19/11** | appliquée : hors catalogue livré (`shipped: false`), refus `techNotAvailable`, mesures conservées ; réouverture après D2/D4 |
| `decisions/D2-well-build-policy.md` | Dimensionner les puits sur `ceil(pop/rendement)` ? | **tranchée 19/11**, appliquée (`6e7e593`) | conserver `ceil(N/2)+1` (la variante coûte 1 917 pièces et 126 planches pour zéro colon servi) et exposer le besoin au joueur |
| `decisions/D3-stone.md` | Donner un consommateur à la pierre, ou retirer la carrière ? | **tranchée 20/11** (D3 §7) | les ressources construisent, l'argent arbitre : planches pour l'habitat et la production, pierre pour l'entrepôt et les bâtiments lourds, la carrière jamais en pierre ; mise en œuvre à mesurer |
| `decisions/D4-money-sinks.md` | À quoi sert la monnaie après l'ouverture ? | ouverte | une dépense **récurrente** liée au parc, jamais un jalon de trésorerie |
| `decisions/D5-endgame.md` | Comment la partie se termine-t-elle ? | ouverte | objectif de développement multicritère ; état terminal à population 0 uniquement |

Ordre de dépendance : D1 → D2, D1/D3 → D4 → D5. Aucune de ces fiches n'autorise
une implémentation : une recommandation n'est pas une décision — D1 a suivi le
chemin complet (recommandation → arbitrage daté → application mesurée).

---

# Version 0.3 — révisée le 20 novembre 2026

> **Pourquoi une révision.** D3 n'est plus une intention : elle est implémentée
> et mesurée. Cela change l'état de trois priorités, crée un verrou nouveau (le
> débit de l'atelier) et invalide deux constats du §2 (le plafond de population
> n'est plus un plafond de financement ; la pierre n'est plus morte). Les
> sections 1 à 10 restent l'historique daté ; **ce qui suit les remplace** pour
> le séquencement. Aucune valeur de balance n'est fixée ici.

## 11. Ce qui a changé depuis la v0.2

| Fait | Preuve | Conséquence sur l'ordre du travail |
|---|---|---|
| Le barème D3 est chargé (planches, pierre, argent) et mesuré | `D3-stone.md` §7.2, §7.8 | la pierre n'est plus un chantier ; la population le devient |
| Trois parcours de référence échouent (28 colons au lieu de 86) | `tests/selfplay.test.ts`, 3 assertions rouges | on ne peut plus « mesurer la monnaie » sur une croissance qui n'arrive pas |
| Le débit de l'atelier est le plafond : 2 planches/tick → 78 colons | D3 §7.8 | **passe en P1** : c'est le verrou de tout le reste |
| L'argent finit à 2 839–8 843 pièces sans achat | D3 §7.8, D4 §2 | D4 reste ouverte, mais ne peut plus être traitée avant l'accès à l'industrie |
| Aucun bâtiment n'est gaté par l'âge (`requiredAge` jamais renseigné) | `buildings.ts`, `placement.ts` | la phase « progression » inclut désormais le **contenu** des âges, pas seulement leurs jalons |
| Les jalons de trésorerie sont supprimés depuis Step070 | `progression.ts` | la phase « économie » ne doit pas les réintroduire sous un autre nom |
| Plusieurs documents décrivent un état faux | `DESIGN-ALIGNMENT.md` §5.5 | une passe documentaire fait partie du travail, pas de la décoration |

## 12. Priorités révisées (20/11/2026)

L'état indiqué est un état **mesuré**, jamais documentaire.

| Priorité | Sujet | État au 20/11/2026 | Ce qui la ferme |
|---|---|---|---|
| P0 | Baseline, invariants, harnais | **Fait** : lois, ordre de staffing, 20 seeds, auto-jeu | — |
| P0 | Instrumentation de la mesure | **Fait** : lignes de 1 500 ticks reproductibles | — |
| P1 | **Débit industriel (débit de l'atelier)** | **Tranché et appliqué le 20/11 (D6)** : 2 planches/tick ; ligne de croissance 28 → 78 colons ; six scénarios joués aux deux débits (D6 §4) | rejouer les 3 parcours du MVP avec D6 (seul reste) |
| P1 | **Marge de main-d'œuvre** | **Ouverte, désormais le verrou n° 1** : 10 postes de survie absorbent 10 colons ; D6 ne l'a pas dégagée (287 → 293 ticks sans atelier staffé, 735 à l'expansion, D6 §4) | une ligne où un atelier est staffé sans famine |
| P1 | Rôle économique de la pierre | **Fait le 20/11** : l'entrepôt coûte 8 pierres, la carrière n'en prend pas | — (second usage = âge 2, plus tard) |
| P1 | Débouchés monétaires (D4) | **Ouverte, parallèle à la marge** : 3 301 pièces dormantes sur 3 000 ticks après D6 (D6 §4) | débit net à pop 86 mesuré + décision de la famille de dépense |
| P2 | Besoins du MVP : une catégorie de biens | **Absent** | un besoin consommé, mesuré, avec son bâtiment |
| P2 | Besoins du MVP : services de base | **Absent** | idem, après les biens |
| P2 | Contenu des âges (bâtiments gatés, transformation) | **Absent** : `requiredAge` jamais renseigné | au moins un bâtiment par âge qui change une décision |
| P2 | Technologies en méthodes | **Contredit** : 7 des 8 sont « +1 par bâtiment » | au moins une techno qui ouvre une méthode, mesurée |
| P2 | Entrepôt : décision ou capacité assumée | **Ouvert** | une phrase de design + un test, ou un poste de travail |
| P3 | Endgame (D5) | **Ouverte** : ni victoire, ni défaite | décision + état terminal à pop 0 |
| P3 | Logistique : congestion ou priorités | **Absent** | une mesure qui prouve que ça change un résultat |
| P4 | UX : marge de travailleurs, pertes | **Partiel** | deux chiffres exposés dans l'inspecteur |
| P4 | Passes documentaires (§5.5 de l'alignement) | **À faire** | documents corrigés, sections datées conservées |

## 13. Dépendances réelles (ce que la mesure impose)

```text
D3 mesuré (fait)
   |
   v
D6 — débit de l'atelier (tranché) ──► marge de main-d'œuvre (verrou) ──► industrie qui tourne
                                   |                          |
                                   |                          v
                                   |                 besoins (biens, services)
                                   |                          |
                                   v                          v
                             D4 — dépense récurrente ──► progression (contenu d'âge)
                                                              |
                                                              v
                                                        D5 — endgame
                                                              |
                                                              v
                                                   UX de diagnostic + balance globale
```

Trois conséquences que la v0.2 n'avait pas :

1. **D4 ne peut pas précéder l'industrie.** Le surplus n'existe que si la
   chaîne tourne ; dimensionner une dépense sur un débit inconnu serait
   exactement l'erreur que ce dossier reproche aux documents antérieurs.
2. **Les besoins ne peuvent pas précéder la marge.** Un atelier de biens qui
   n'est jamais staffé est un bâtiment décoratif ; le mesurer avant O1 ne
   prouverait rien.
3. **L'endgame dépend de D4 *et* des besoins.** Un objectif multicritère
   (D5 option A) mobilise des systèmes qui n'existent pas encore : il se
   dimensionne en dernier, pas en premier.

## 14. Critères d'acceptation (mesurables, un par phase)

| Phase | Critère | Mesure exacte |
|---|---|---|
| D6 | Le débit retenu tient la cible de population | **mesuré le 20/11** : 78 colons sur la ligne gouvernée (cible 86) ; expansion 28 → 40 ; hydrique inchangé (D6 §4). Reste : les 3 parcours du MVP |
| Marge | Un atelier est staffé au plus tard au 11e colon | relevé du staffing tick par tick sur la ligne gouvernée |
| D4 | La trésorerie ne dépasse plus un plafond utile | à t=1 500, la trésorerie est absorbée par des achats **choisis**, pas par une taxe |
| Biens | Un besoin non vital est consommé et observable | un colon sans biens produit un effet graduel, pas binaire |
| Services | Un service change un résultat mesurable | ex. école → un rendement, une admission ou une spécialisation |
| Âges | Un âge change une possibilité | au moins un bâtiment refusé avant l'âge, accepté après, testé |
| Technos | Une techno change une méthode | une techno qui débloque un bâtiment ou une substitution, pas un +1 |
| D5 | Une partie peut se terminer | un état final atteint par le harnais, expliqué à l'écran |
| UX | La marge et les pertes sont lisibles | deux valeurs présentes dans l'inspecteur, testées |

## 15. Scénarios de validation (le §7 reste valable, on ajoute)

| Scénario | Ce qu'il doit détecter | Pourquoi il manquait |
|---|---|---|
| **Tout en logements** | partie industrielle morte : les 12 planches dépensées, aucun camp possible | risque P0 conditionnel (`DESIGN-ALIGNMENT` §5.6) |
| **Ouverture sans camp** | dépendance réelle au gisement adjacent au centre | conditionne le scénario précédent |
| **Ligne de 3 000 ticks** | une colonie de 86+ tient-elle ? | aucune mesure au-delà de 1 500 (D5 §6.1) |
| **Trois parcours avec D6 = 2** | la cible de population est-elle atteinte partout, pas seulement sur la ligne gouvernée | la grille D6 couvre six scénarios du gouverneur, aucun des trois parcours du MVP |
| **Un âge sans contenu** | vérifier qu'un âge refuse bien un bâtiment avant et l'accepte après (quand `requiredAge` existera) | rien ne teste aujourd'hui le déblocage par âge |

## 16. Invariants de cette révision (inchangés, réaffirmés)

- Déterminisme strict, tick fixe, simulation indépendante du rendu.
- Une seule source de vérité par loi (`waterPerWell`, `staffingOrder`, capacités
  dérivées de `D2_*`).
- Lois de crise hydrique : 75 %, graduelles, récupérables, plancher 2 — non
  rouvertes.
- ADR-016 : ordre ferme → puits → reste — non rouvert sans mesure contraire.
- D1 et D2 : non rouvertes par cette révision.
- Step070 : aucun jalon de trésorerie, sous aucun nom.
- Aucune compensation croisée entre ressources.
- Aucune valeur de balance sans mesure ; les 3 assertions rouges restent rouges
  jusqu'à décision, elles ne se réécrivent pas.

## 17. Ce que cette révision ne fait pas

Elle ne décide ni O1, ni D4, ni D5, ni le premier besoin non vital. Elle ne
change aucune valeur, aucun coût, aucune production. Elle ordonne le travail
selon les dépendances mesurées et nomme, pour chaque phase, la mesure qui la
ferme.

## 18. Mise à jour du 20 novembre 2026 — D6 appliquée

Le propriétaire a tranché le débit de l'atelier : **2 planches pour 2 bois** par
tick et par atelier staffé (`decisions/D6-workshop-rate.md`). Le code la porte
déjà ; la grille des six scénarios de l'ADR a été jouée aux deux débits.

Ce que cela change dans **l'ordre du travail** :

1. Le verrou passe de « débit » à « **marge de main-d'œuvre** » : D6 a levé le
   plafond des planches (×3,7 au scénario standard) et fait monter la population
   quand le logement est ouvert (28 → 40 ; 78 sur la ligne gouvernée), mais les
   ateliers restent sans ouvrier aussi souvent qu'avant (287 → 293 ticks).
2. **D4 devient parallèle, plus séquentielle.** D6 a réduit l'argent dormant
   (20 837 → 3 301 sur 3 000 ticks) sans le supprimer : la dépense récurrente
   n'attend plus que le débit net, pas la croissance.
3. Les trois parcours du MVP restent à rejouer : c'est le seul critère de D6 qui
   n'est pas satisfait par la grille.
4. Les 3 assertions rouges restent rouges, et pour les mêmes raisons (trésorerie,
   dotation de travail, besoins) : D6 n'en maquille aucune.

La leçon à garder : un débit ne crée pas d'ouvrier. La prochaine fiche doit
porter sur la **dotation** (ce que consomme un puits ou une ferme en bras), pas
sur une production.
