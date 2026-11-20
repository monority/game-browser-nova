# NOVA — Plan de réalignement sur les documents d'origine

> **Règle de base.** Les décisions du propriétaire (vault `05-Projects/nova/product`)
> sont l'autorité. Le code et les docs d'état s'y alignent. Quand le build s'en
> écarte, c'est l'écart qui est corrigé — jamais le document, sauf décision
> explicite du propriétaire (cas D3, voir §2).
>
> **Règle de preuve.** Aucune phase n'est déclarée faite sans : mesure avant /
> après sur les trois parties de référence, suite unitaire verte (et E2E ciblé
> quand il y a de l'interface), document mis à jour, commit lisible.
>
> **Règle de taille.** Une phase = une session de travail, pas un chantier. Si
> une phase déborde, elle est coupée en deux, jamais allongée en silence.

## 1. Où l'on en est

`docs/MVP-REFERENCE.md` recense les écarts exigence par exigence, avec la preuve
dans le code. Résumé : **10 critères du MVP tenus, 3 partiels, 6 manques durs**
(biens, services, satisfaction progressive, quatre familles de bâtiments, la
pierre, l'entrepôt). Deux décisions sont déjà prises : D1 (techno de puits hors
catalogue) et D2 (dimensionnement nominal des puits). D3 (la pierre) vient d'être
tranchée : les ressources construisent, l'argent arbitre.

## 2. Registre des écarts

| # | Écart | Source (doc d'origine) | Phase | Statut |
|---|---|---|---|---|
| E1 | Le document de design range le coût de construction dans l'argent | `02-MVP` §4 | 0 | **corrigé le 20/11** (vault + copie projet : la construction quitte l'argent) |
| E2 | `docs/STATE.md` nomme un commit inexistant (`88900bc`) | doc d'état | 0 | à corriger |
| E3 | La feuille de route dit D2 « arbitrage en attente » | `REBALANCE-ROADMAP` §10 | 0 | à corriger |
| E4 | La hiérarchie « vault = copie durable de tout » est fausse pour l'état | `docs/game/README.md` | 0 | à corriger (intention ≠ état) |
| E5 | Aucun bâtiment ne consomme de pierre | `03-DESIGN-RULES` règle 9 | 1 | **fait le 20/11** : l'entrepôt coûte 8 pierres, déduites atomiquement |
| E6 | Tous les bâtiments coûtent 25 pièces, aucun matériau | `01` §10, `02` §4 | 1 | **fait le 20/11** : barème matériaux chargé (D3 §7.2) |
| E7 | Population plafonnée à 60 au lieu de ~100 | `01` §7, `02` §4 | 2 | ouvert |
| E8 | Aucune catégorie de biens | `02` §4, `08` §6 | 3 | ouvert |
| E9 | Aucun service de base (école, santé) | `02` §4, `08` §6 | 4 | ouvert |
| E10 | Satisfaction binaire (nourri / non nourri) | `08` §7 | 3 | ouvert |
| E11 | Marché, pêcherie absents du catalogue | `02` §6 | 5 | ouvert |
| E12 | Technos toutes en +1 par bâtiment | `07` §6 | 6 | ouvert |
| E13 | L'entrepôt est une non-décision | `03` règle 8, audit F16 | 7 | ouvert |
| E14 | L'argent n'a pas assez de postes de dépense : la trésorerie finit entre 2 800 et 8 800 pièces | `08` §9, fiche D4 | 7 | **mesuré le 20/11**, à trancher |
| E15 | Le débit de planches (1/tick/atelier) plafonne la croissance à 28 colons | `02` §4, loi Step006 | 1 | **mesuré le 20/11**, décision du propriétaire |

## 3. Les phases

### Phase 0 — Vérité documentaire (petite, aucune ligne de code)

**But** : que les documents ne mentent plus, avant de toucher au jeu.

Livrables :
- `docs/STATE.md` : ligne HEAD corrigée sur le commit réel ;
- `REBALANCE-ROADMAP` : D2 et D3 à jour ;
- `docs/game/README.md` : la hiérarchie devient « l'intention vit dans le vault,
  l'état vit ici » — et non « le vault est la copie durable de tout » ;
- `product/02-mvp.md` §4 : la construction quitte l'argent pour les ressources
  (décision D3, avec accord du propriétaire) ;
- `product/` : une ligne par document disant que l'état d'avancement se lit dans
  `docs/MVP-REFERENCE.md`, et non dans les annotations de novembre.

**Critère d'acceptation** : le hash cité dans `STATE.md` répond à `git log -1` ;
aucun document ne contredit D1, D2 ou D3 ; le vault et le projet ne se
contredisent plus sur qui fait autorité.

**Risque** : réécrire l'intention au lieu de la citer. On ne touche pas aux
décisions, seulement à leurs annotations d'état.

### Phase 1 — Les ressources construisent (moyenne)

**État au 20/11 : implémentée et mesurée.** Le critère 4 n'est pas satisfait :
les parcours de référence plafonnent à 28 colons au lieu de 86, et la trésorerie
finit sans emploi (D3 §7.8). Deux leviers mesurés attendent une décision du
propriétaire : le débit de l'atelier (1 → 2 planches/tick, qui ramène la
population à 78) et un poste de dépense récurrent pour l'argent (phase 7).

**But** : appliquer D3 §7.2. Le bois transformé devient le coût de construction ;
la pierre entre dans le stockage lourd ; l'argent garde l'infrastructure, le
civique et l'entretien.

Livrables :
- champ `stoneCost` dans le modèle de bâtiment, à côté de `plankCost` / `waterCost` ;
- validation et déduction atomiques, comme les deux autres ;
- libellé de la palette qui affiche la pierre ;
- tableau de coûts de D3 §7.2 ;
- tests : refus si pierre insuffisante, déduction exacte, carrière sans pierre.

**Critère d'acceptation** (D3 §7.5) : la pierre produite est dépensée sur 300
ticks ; l'argent ne s'accumule pas sans emploi ; les trois parties de référence
restent franchissables.

**Risque principal** : les planches deviennent le seul goulot. Réponse prévue :
baisser d'abord le coût des logements, jamais retirer la règle.

### Phase 2 — Le plafond de population (moyenne à grosse)

**But** : rendre les ~100 habitants atteignables. La cause mesurée du plafond à
60 est le financement du logement, pas une loi démographique.

Livrables : une politique de logement qui ne s'effondre pas quand la ville
grandit (impôt, commerce, entretien), et une mesure de croissance jusqu'à 90+.

**Critère d'acceptation** : une partie seed `selfplay` dépasse 90 colons sans
famine ni pénurie d'eau, et sans trésorerie infinie.

**Dépend de** : phase 1 (les coûts changent la vitesse de croissance).

### Phase 3 — Les besoins : biens et satisfaction progressive (grosse)

**But** : introduire **une** catégorie de biens et une satisfaction progressive.

Livrables : une ressource de biens produite et consommée ; un besoin « biens » ;
des bandes de satisfaction (3 ou 5, à trancher) avec effets graduels sur la
croissance ; l'affichage correspondant.

**Critère d'acceptation** : la satisfaction n'est plus binaire ; couper les biens
dégrade la croissance de façon graduelle et traçable ; le besoin est visible dans
l'inspection.

**Dépend de** : phase 2. **À trancher avant** : quelle catégorie de biens, et 3 ou
5 bandes.

### Phase 4 — Les services (grosse)

**But** : un besoin « services » avec école et santé, chacune staffée.

**Critère d'acceptation** : deux bâtiments, deux effets distincts et mesurés
(pas deux variantes de la même jauge), et un besoin lisible par le joueur.

**Dépend de** : phase 3 (même mécanique de satisfaction).

### Phase 5 — Les bâtiments manquants (moyenne)

**But** : marché et pêcherie ; école et santé arrivent en phase 4.

**Critère d'acceptation** : chaque bâtiment répond au test de décision de
`03-DESIGN-RULES` §2 — quelle décision, quel système, quelle observation.

**Dépend de** : phase 3 (sinon les bâtiments n'ont rien à satisfaire).

### Phase 6 — Les technos en méthodes (moyenne)

**But** : sortir du « 50 pièces pour +1 par bâtiment ». Chaque techno doit ouvrir
une méthode, une substitution, un bâtiment ou une capacité.

**Critère d'acceptation** : plus aucune techno dont le seul effet est une hausse
de rendement linéaire ; chacune change une décision observable.

**Dépend de** : phases 3 à 5 (il faut des systèmes à ouvrir).

### Phase 7 — L'entrepôt et les puits à argent (moyenne)

**But** : fermer la non-décision de l'entrepôt (audit F16) et donner à l'argent
des emplois choisis, pas seulement subis (fiche D4).

**Critère d'acceptation** : l'entrepôt crée un arbitrage réel (emplacement,
main-d'œuvre ou entretien), mesuré ; l'argent a au moins deux postes de dépense
concurrents.

**Dépend de** : phase 1 (les coûts) et phase 2 (la croissance).

### Phase 8 — Gel de périmètre (petite)

**But** : empêcher la dérive inverse — ajouter de l'âge 3 ou des factions pendant
que le MVP est incomplet.

**Livrable** : une liste explicite de ce qui est gelé, reprise de `MVP-REFERENCE`
§7. **Critère d'acceptation** : aucune fonctionnalité hors MVP n'est ajoutée
pendant les phases 1 à 7.

## 4. Ordre et parallélisme

```
0 ──> 1 ──> 2 ──> 3 ──> 4 ──> 6
                    └──> 5 ──┘
             1 ──> 7
```

Les phases 5 et 7 peuvent avancer en parallèle de 4 et 6. Aucune phase ne
commence avant que sa dépendance soit mesurée, pas seulement codée.

## 5. Ce qu'on ne fait pas

- Pas de nouvelle ressource sans usage immédiat (règle 9) — c'est la leçon de la
  pierre.
- Pas de nouveau bâtiment sans décision (règle 8) — c'est la leçon de l'entrepôt.
- Pas d'extension d'âge avant la fin de la phase 7.
- Pas de refonte de l'interface sans besoin exprimé par une phase.
- Pas de rééquilibrage « au feeling » : chaque nombre déplacé est mesuré.

## 6. Gouvernance des documents

| Nature | Où | Qui fait autorité |
|---|---|---|
| Intention, décisions | vault `product/` | le propriétaire |
| Décisions de rééquilibrage | `docs/rebalance/v0.1/decisions/` | propriétaire, formalisées ici |
| État, écarts, plan | `docs/MVP-REFERENCE.md`, ce fichier | l'agent, corrigé par le propriétaire |
| Compte rendu technique | `docs/STATE.md`, `docs/roadmap/` | l'agent |

Le vault ne recopie plus l'état. Le projet ne réécrit plus l'intention.

## 7. Tableau de bord

Une phase est terminée quand ces cinq lignes sont vraies :

- [ ] les livrables existent ;
- [ ] le critère d'acceptation est mesuré et écrit ;
- [ ] les trois parties de référence passent ;
- [ ] la suite unitaire est verte, l'E2E ciblé aussi s'il y a de l'interface ;
- [ ] le document d'origine et le registre §2 sont à jour.

Prochaine action : **phase 0, puis phase 1**.
