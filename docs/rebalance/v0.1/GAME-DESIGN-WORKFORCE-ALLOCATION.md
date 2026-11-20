# NOVA — Workforce & Labor Allocation

Dossier de conception — Dotation et allocation de la main-d'œuvre.

| Métadonnée | Valeur |
|---|---|
| Projet | NOVA |
| Domaine | Simulation / Économie / Population |
| Version | 0.1 |
| Date | 20 novembre 2026 |
| Statut | Proposition de conception — décision ouverte |
| Décision associée | Workforce Allocation |
| Dépendances | D6 — Workshop Rate |
| Implémentation | Non autorisée à ce stade |

> **Note du dépôt (20/11/2026).** Ce dossier fixe la question ; il ne contient
> aucune mesure. Les faits qu'il demande au §12 (cartographie, travailleurs
> disponibles et affectés, règles d'allocation vérifiées, analyse des six
> scénarios) sont livrés dans `decisions/W1-workforce-allocation.md`, obtenus sur
> le tick réel avec `tests/measure-throughput.test.ts` (`MEASURE_THROUGHPUT=1`).
> Le dossier précédent sur le même sujet, `GAME-DESIGN-WORKFORCE.md`, garde la
> mesure de l'ordre de staffing du 18/11 (§10) ; celui-ci la remplace pour la
> question de la dotation.

---

## 1. Objectif

NOVA dispose d'une simulation démographique et économique fonctionnelle, mais sa
colonie manque de travailleurs disponibles pour développer son industrie.

Le problème n'est plus principalement la capacité de production.

La décision D6 a porté la production de l'atelier à :

`2 bois → 2 planches / tick`

La capacité industrielle théorique a augmenté, mais les ateliers restent sans
ouvrier pendant une part importante de la simulation.

Le problème à résoudre est donc celui de la **dotation de travail et de
l'allocation des travailleurs**.

L'objectif est de permettre à une colonie de :

- satisfaire ses besoins vitaux ;
- entretenir ses infrastructures ;
- développer son industrie ;
- produire des biens ;
- financer des services ;
- continuer à croître.

Sans transformer la simulation en gestion individuelle des habitants.

### Principe directeur

La main-d'œuvre doit devenir une ressource stratégique.

Le joueur doit pouvoir comprendre pourquoi une activité ne fonctionne pas et agir
sur l'organisation de sa ville pour libérer des travailleurs.

Il ne doit pas simplement recevoir un bonus invisible qui fait disparaître les
contraintes.

---

## 2. État de référence

### 2.1 Faits établis

D'après le bilan du 20 novembre :

- Population agrégée.
- Affectation automatique des travailleurs.
- Ordre de priorité : ferme → puits → reste.
- Les fermes et les puits absorbent ensemble environ un travailleur par habitant.
- Les ateliers sont fréquemment privés de travailleurs.
- Le débit supérieur de D6 ne résout pas le problème.
- L'inversion de l'ordre de priorité fait passer la population de référence de 86 à 60.
- Les ateliers sans travailleur ne produisent rien.
- Les besoins vitaux sont la nourriture et l'eau.

### 2.2 Mesures disponibles

| Scénario | Population après D6 | Ticks sans atelier staffé |
|---|---:|---:|
| Standard | 24 | 293 |
| Bois contraint | 24 | 293 |
| Main-d'œuvre limitée | 10 | 270 |
| Expansion | 40 | 735 |
| Stress hydrique | 10 | 1 500 |
| Partie longue | 40 | 1 373 |

La ligne de croissance du self-play atteint 78 habitants, contre 28 auparavant.

Ces chiffres montrent que la capacité de croissance existe, mais que la
disponibilité de travailleurs ne suit pas.

### 2.3 Ce que nous ne savons pas encore

Les informations disponibles ne suffisent pas à déterminer :

- Le coût exact en travailleurs de chaque bâtiment.
- Le nombre de travailleurs nécessaires par unité de production.
- Le nombre de travailleurs réellement disponibles à chaque tick.
- La part de la population qui ne peut pas travailler.
- La répartition des postes selon les bâtiments.
- Le coût en main-d'œuvre des bâtiments qui ne produisent pas directement.
- Le comportement exact lorsque plusieurs bâtiments sont en concurrence.
- La proportion de la production industrielle perdue faute de travailleurs plutôt que faute de matériaux.

Ces éléments doivent être vérifiés dans le code et dans les traces de simulation
avant de choisir une nouvelle loi.

Aucune valeur de travailleur ne doit être inventée pour compléter ce dossier.

---

## 3. Le problème à résoudre

Le modèle actuel semble produire une situation dans laquelle la croissance
démographique entraîne presque automatiquement une augmentation des besoins de
main-d'œuvre vitale.

Cela crée une concurrence :

`Population → Fermes et puits → Travailleurs restants → Industrie`

La croissance ne garantit donc pas une augmentation proportionnelle de la
capacité productive.

Le problème est structurel :

- davantage d'habitants implique davantage de nourriture ;
- davantage d'habitants implique davantage d'eau ;
- davantage de production vitale nécessite davantage de travailleurs ;
- l'industrie entre en concurrence avec ces besoins.

Une colonie peut ainsi disposer de suffisamment de ressources, de bâtiments et de
logements, mais ne pas avoir les travailleurs nécessaires pour exploiter son
potentiel.

### 3.1 Résultat recherché

Une colonie développée doit disposer d'une marge de travail suffisante pour
exploiter plusieurs activités simultanément.

Cette marge ne doit pas être gratuite : elle doit résulter d'une organisation,
d'une infrastructure ou d'une évolution cohérente de la civilisation.

---

## 4. Invariants de conception

Les règles suivantes ne sont pas remises en question par ce dossier.

| Invariant | Règle |
|---|---|
| Population | Agrégée, jamais individuelle |
| Simulation | Déterministe |
| Tick | Fixe |
| Priorité | Ferme → puits → reste |
| Survie | Prioritaire sur l'industrie |
| Production | Pas de production sans travailleur |
| Matériaux | Pas de production sans matières premières |
| Prévisions | Mêmes lois que la simulation réelle |
| Rendu | Séparé des règles de simulation |
| Sauvegardes | Compatibilité v22 à préserver |

La solution ne doit pas inverser l'ordre de priorité ferme → puits → reste.

Elle ne doit pas rendre l'industrie prioritaire au détriment de la survie.

Elle ne doit pas introduire une gestion individuelle des habitants.

---

## 5. Les modèles à comparer

Trois familles de solutions sont proposées.

Elles représentent des orientations de conception différentes. Elles ne sont pas
encore des décisions.

### Modèle A — Optimisation de la dotation des bâtiments

**Principe :** revoir le nombre de travailleurs nécessaires aux infrastructures
existantes.

L'objectif est de réduire les besoins en travail là où ils sont disproportionnés,
sans modifier arbitrairement les quantités de ressources produites.

Questions à étudier :

- Les fermes nécessitent-elles trop de travailleurs par unité de nourriture ?
- Les puits nécessitent-ils trop de travailleurs par unité d'eau ?
- Existe-t-il une différence cohérente entre bâtiments de même famille ?
- Les rendements et les besoins de travail sont-ils correctement proportionnés ?
- Les bâtiments peuvent-ils fonctionner partiellement ?

Avantages :

- Conserve le modèle actuel.
- Ne nécessite pas de nouveau système de progression.
- Peut résoudre une inefficacité structurelle.
- Facile à mesurer et à comparer.

Risques :

- Une réduction trop importante rend les besoins vitaux presque gratuits.
- Une optimisation excessive peut supprimer les arbitrages.
- Les valeurs peuvent devenir incohérentes entre bâtiments.

**Hypothèse :** le modèle actuel pourrait demander trop de travailleurs pour
assurer les besoins vitaux.

Cette hypothèse doit être vérifiée, pas considérée comme acquise.

### Modèle B — Efficacité du travail par la progression

**Principe :** la civilisation apprend progressivement à produire et distribuer
davantage avec une organisation plus efficace.

L'amélioration de la main-d'œuvre serait liée à des évolutions systémiques.

Exemples de directions possibles :

- Organisation agricole.
- Irrigation et infrastructures hydrauliques.
- Techniques de culture.
- Organisation des chaînes logistiques.
- Outils et méthodes de production.

Ces exemples ne sont pas des technologies décidées.

Avantages :

- Donne un intérêt réel à la progression des âges.
- Introduit une évolution économique lisible.
- Préserve une contrainte forte en début de partie.
- Crée de nouvelles décisions au fil de la progression.

Risques :

- Peut repousser le problème plutôt que le résoudre.
- Peut créer une dépendance à une technologie obligatoire.
- Peut déséquilibrer les scénarios de début de partie.
- Peut transformer la progression en accumulation de bonus.

**Hypothèse :** une colonie doit pouvoir survivre et commencer à se développer
avant de disposer d'améliorations technologiques.

Ce modèle ne doit donc pas être la seule solution à la pénurie initiale.

### Modèle C — Organisation et spécialisation de la main-d'œuvre

**Principe :** améliorer l'organisation générale des activités pour éviter que
les travailleurs soient immobilisés inutilement.

La capacité productive dépendrait davantage de la répartition du travail entre
bâtiments et activités.

Pistes à étudier :

- Fonctionnement partiel des bâtiments.
- Répartition plus souple des travailleurs.
- Différenciation entre bâtiments permanents et activités ponctuelles.
- Mutualisation de certaines fonctions.
- Optimisation des priorités de production.

Avantages :

- Renforce le gameplay de gestion.
- Peut créer des arbitrages intéressants.
- Évite de simplement augmenter les rendements.
- Donne une utilité plus forte à l'analyse de la colonie.

Risques :

- Complexifie la simulation.
- Peut rendre les règles difficiles à comprendre.
- Peut introduire des changements d'allocation instables.
- Peut fragiliser le déterminisme si les règles sont mal définies.

**Hypothèse :** une meilleure organisation pourrait dégager des travailleurs sans
supprimer les besoins fondamentaux.

Ce modèle demande une attention particulière à la lisibilité et à la
prévisibilité.

---

## 6. Comparaison des modèles

| Critère | A — Dotation | B — Progression | C — Organisation |
|---|---|---|---|
| Simplicité | Forte | Moyenne | Moyenne à faible |
| Impact début de partie | Direct | Progressif | Variable |
| Intérêt des âges | Faible | Fort | Potentiellement fort |
| Complexité technique | Faible à moyenne | Moyenne | Élevée |
| Lisibilité | Forte si bien calibré | Forte si bien expliqué | À démontrer |
| Risque de bonus artificiel | Moyen | Élevé | Faible à moyen |
| Compatibilité avec les invariants | Bonne | Bonne | À vérifier |

### Orientation recommandée

Ne pas choisir immédiatement un modèle exclusif.

Étudier d'abord le modèle A pour comprendre si les besoins de travail sont
correctement dimensionnés.

Ensuite, déterminer si B et C apportent une véritable profondeur supplémentaire.

Une solution combinée peut être pertinente, mais uniquement si chaque mécanisme
répond à un problème identifié.

---

## 7. Matrice de validation multi-scénarios

Les six scénarios existants doivent servir de référence.

Aucun scénario ne doit être supprimé simplement parce qu'il met en difficulté un
modèle.

| Scénario | Question principale | Risque à éviter |
|---|---|---|
| Standard | L'industrie devient-elle opérationnelle ? | Aucun travailleur disponible |
| Bois contraint | La pénurie de bois reste-t-elle compréhensible ? | Industrie bloquée sans explication |
| Main-d'œuvre limitée | La colonie reste-t-elle viable ? | Effondrement des besoins vitaux |
| Expansion | La capacité industrielle suit-elle la croissance ? | Pénurie structurelle de travailleurs |
| Stress hydrique | Les priorités vitales restent-elles correctes ? | Industrie alimentée au détriment de l'eau |
| Partie longue | La colonie conserve-t-elle des arbitrages ? | Production excessive ou stagnation |

### Mesures obligatoires

Pour chaque scénario, relever :

#### Population

- Population initiale.
- Population finale.
- Population minimale.
- Population maximale.
- Évolution par période.

#### Main-d'œuvre

- Travailleurs disponibles.
- Travailleurs affectés.
- Travailleurs non affectés.
- Travailleurs demandés.
- Travailleurs effectivement attribués.
- Nombre de ticks sans atelier staffé.
- Nombre de ticks avec au moins un atelier opérationnel.

#### Production

- Nourriture produite.
- Eau produite.
- Bois produit.
- Planches produites.
- Production perdue faute de travailleurs.
- Production perdue faute de matières premières.

#### Survie

- Stocks alimentaires.
- Stocks d'eau.
- Épisodes de pénurie.
- Crises hydriques.
- Évolution démographique associée.

#### Économie

- Trésorerie.
- Recettes.
- Dépenses.
- Entretien.
- Revenus commerciaux.

#### Progression

- Bâtiments construits.
- Technologies acquises.
- Jalons atteints.
- Âges atteints.

---

## 8. Critères d'acceptation

La future décision sera considérée comme validée si les conditions suivantes sont
réunies.

### A. Survie

- La nourriture reste prioritaire.
- L'eau reste prioritaire.
- Une colonie standard ne dépend pas d'un réglage artificiel pour survivre.
- Les crises hydriques restent graduelles et récupérables.
- Les pénuries restent compréhensibles.

### B. Main-d'œuvre

- La disponibilité des travailleurs est mesurable.
- La demande de travail par bâtiment est explicable.
- L'industrie peut fonctionner dans les scénarios où les ressources le permettent.
- La croissance ne provoque pas automatiquement une paralysie industrielle.
- Les activités restent soumises à une véritable contrainte de travail.

### C. Équilibre

- Aucun scénario ne s'effondre uniquement à cause du nouveau modèle.
- Le scénario standard progresse.
- Le scénario d'expansion dispose d'une marge industrielle.
- Le scénario limité conserve une difficulté cohérente.
- Le scénario prolongé ne devient pas trivial.

### D. Déterminisme

- Même état initial et même graine donnent les mêmes résultats.
- Les prévisions utilisent les mêmes lois que la simulation.
- Aucun effet dépend de l'ordre d'exécution non documenté.
- Les tests de référence restent reproductibles.

### E. Gameplay

- Le joueur comprend pourquoi un atelier est inactif.
- Le joueur peut agir pour améliorer la situation.
- Les choix produisent des conséquences observables.
- La main-d'œuvre reste une contrainte stratégique.
- La solution ne transforme pas l'industrie en production automatique gratuite.

---

## 9. Critères de comparaison et décision

Les résultats ne doivent pas être évalués uniquement sur la population finale.

La décision doit considérer cinq dimensions :

1. **Viabilité :** la colonie peut-elle satisfaire ses besoins ?
2. **Productivité :** l'industrie peut-elle réellement fonctionner ?
3. **Résilience :** la colonie résiste-t-elle aux contraintes ?
4. **Intérêt stratégique :** les arbitrages restent-ils intéressants ?
5. **Lisibilité :** le joueur comprend-il les causes et les conséquences ?

Une solution qui augmente la population mais supprime les contraintes économiques
n'est pas nécessairement meilleure.

Une solution qui augmente la production sans créer de demande supplémentaire
n'est pas non plus une réussite.

Le meilleur modèle sera celui qui améliore l'ensemble du fonctionnement sans
sacrifier l'identité du jeu.

---

## 10. Questions à résoudre avant décision

1. Quel est le coût exact en travailleurs de chaque bâtiment ?
2. Quelle proportion de la population peut effectivement travailler ?
3. Les besoins vitaux sont-ils surdimensionnés en main-d'œuvre ?
4. Le travail est-il attribué par bâtiment, par type d'activité ou par production ?
5. Les bâtiments peuvent-ils fonctionner partiellement ?
6. Les bâtiments de survie doivent-ils toujours mobiliser la totalité de leurs effectifs ?
7. Une amélioration de l'efficacité doit-elle être disponible dès le début ou seulement avec la progression ?
8. Quel niveau de disponibilité industrielle doit représenter une colonie standard ?
9. Quelle difficulté doit conserver une colonie limitée ?
10. Comment afficher la marge de travail dans l'interface ?

Aucune de ces questions ne doit recevoir une réponse inventée à partir des seules
mesures actuelles.

---

## 11. Dépendances avec les autres décisions

### D6 — Atelier

Décision adoptée : 2 planches pour 2 bois.

Ne pas modifier ce débit dans le cadre de ce chantier.

### D4 — Économie

Peut être conçu en parallèle.

Le calibrage final des dépenses devra toutefois prendre en compte le nombre réel
de bâtiments opérationnels et leurs coûts de main-d'œuvre.

### O5 — Besoin non vital

Dépend directement de la marge de travail.

Introduire une nouvelle consommation avant de vérifier la capacité productive
risque de rendre le nouveau système inaccessible ou de pénaliser la survie.

### D5 — Endgame

Ne doit pas être calibré avant que les principales boucles économiques soient
fonctionnelles.

---

## 12. Livrables attendus

Avant toute modification de code :

- [x] Cartographie réelle des besoins de main-d'œuvre.
- [x] Mesure des travailleurs disponibles et affectés.
- [x] Vérification des règles d'allocation.
- [x] Analyse des six scénarios existants.
- [ ] Comparaison des trois modèles.
- [ ] Proposition de modèle retenu.
- [ ] Critères d'acceptation définitifs.
- [ ] Décision explicite du propriétaire.

Les quatre premières cases sont remplies par
`decisions/W1-workforce-allocation.md` (mesuré le 20/11/2026). La comparaison des
trois modèles y figure aussi, adossée aux mesures, mais elle ne vaut pas
proposition retenue : le choix reste au propriétaire.

Après validation seulement :

- Implémentation minimale.
- Tests unitaires des règles de travail.
- Tests de simulation.
- Comparaison multi-scénarios.
- Typecheck et lint.
- Validation navigateur si l'interface est touchée.
- Rapport des résultats.

---

## 13. Décision finale

**Statut : OPEN**

Aucun modèle de dotation n'est encore adopté.

La direction retenue est d'identifier et de corriger la cause structurelle du
manque de travailleurs, sans modifier les invariants de survie et sans créer de
bonus artificiels.

**La priorité est de comprendre précisément où part la main-d'œuvre avant de
décider comment en libérer.**
