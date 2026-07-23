# Game Design Document — ECHOFALL

**Genre :** Rogue-lite 2D top-down (dungeon-crawler d'action)
**Statut :** V0.4 — descente MULTI-STRATES (3 mondes), bestiaire élargi (6 ennemis + 3 Gardiens), pièges
**Date :** 2026-07-22

> V0.1 posait le concept en vue de côté (platformer). La V0.2 rebase le jeu en
> **vue de dessus, salles connectées** (façon *The Binding of Isaac* / *Hades*) :
> plus adapté au combat visé à la souris, à la génération procédurale par
> salles et à la lisibilité des patterns ennemis.

---

## 1. Pitch

La dernière cité humaine, **Ashport**, est bâtie au bord d'un gouffre sans
fond, **l'Abîme**, dont on extrait le **Lumen** — une lumière-énergie qui seule
tient les ténèbres à distance. Le Lumen s'épuise. Chaque cycle, un·e
**Plongeur·se** descend dans les strates de l'Abîme — des réseaux de chambres
taillées dans la roche — pour en rapporter.

Le twist : **l'Abîme se souvient de vous**. Quand un·e Plongeur·se meurt, il
reste de lui/elle un **Écho** à l'endroit exact de sa mort. Les descentes
suivantes peuvent retomber dessus : l'affronter (revenant hostile, butin
garanti) ou s'y recueillir (bref soutien). Chaque échec laisse une trace
physique dans le monde.

**Logline :** *Descendez chambre après chambre dans un gouffre qui garde le
souvenir de chacune de vos morts, pour arracher à l'obscurité la lumière qui
maintient la dernière ville humaine en vie.*

| Référence | Ce qu'on en garde |
|---|---|
| *The Binding of Isaac* | Structure en salles sur grille, portes, salle trésor/boss |
| *Hades* | Combat nerveux lisible, dash à i-frames, hub de méta-progression |
| *Enter the Gungeon* | Tir visé à la souris, esquive au cœur du gameplay |
| *Rogue Legacy* | Les runs précédentes laissent une trace durable |

---

## 2. Boucle de gameplay

Quatre boucles imbriquées, de la seconde à la dizaine d'heures :

### 2.1 Boucle seconde (moment-à-moment)
Se déplacer (8 directions) · viser à la souris · tirer · dasher (i-frames)
· lire les patterns ennemis.

### 2.2 Boucle salle — **exploration → combat → loot → amélioration**
```
 EXPLORATION : entrer dans une salle inconnue (portes, minimap)
      ▼
 COMBAT : les portes se verrouillent, vagues d'ennemis
      ▼
 LOOT : Éclats de Lumen lâchés par les ennemis ; salle trésor = relique
      ▼
 AMÉLIORATION : la relique modifie les statistiques de la run
      ▼
 les portes se déverrouillent → exploration de la salle suivante
```

### 2.3 Boucle run (15–30 min) — descente multi-strates (V0.4)
```
 CITADELLE (menu / hub)
   ▼
 STRATE 1 « Failles d'Ardoise »   (7 salles)  ─ Gardien ──┐
   ▼  gouffre de descente                                  │
 STRATE 2 « Jardins Fongiques »   (9 salles)  ─ Cracheur Alpha ──┤ Mort à tout
   ▼  gouffre de descente                                  │ moment =
 STRATE 3 « Fournaise des Profondeurs » (11 salles)        │ PERMADEATH (§4)
   ▼                                                       │
 AVATAR DE L'ABÎME (Gardien final)                         │
   ├─ Victoire → la run est GAGNÉE                         │
   └────────────────────────────────────────────────────────┘
   ▼
 CITADELLE : dépense des Fragments de Mémoire (méta-progression, §5)
```
Chaque strate est un MONDE : environnement (palette, torches, runes),
bestiaire pondéré, pièges d'ambiance et Gardien propres, difficulté croissante
(PV/vitesse des ennemis, taille des vagues, salles plus nombreuses). PV,
statistiques, reliques et butin TRAVERSENT les descentes — c'est là toute la
tension : descendre affaibli ou remonter n'existe pas.

### 2.4 Boucle méta (entre les runs)
Fragments de Mémoire → améliorations permanentes au **Sanctuaire** →
la strate suivante paraît atteignable → « one more run ».

---

## 3. Statistiques du joueur

Toutes les statistiques sont **données, pas codées en dur** : les reliques
(in-run) et le Sanctuaire (permanent) les modifient.

| Statistique | Base | Rôle | Modifiée par |
|---|---|---|---|
| **PV max** (orbes de Lumen) | 6 | points de vie ; 0 = mort | Sanctuaire (+1/achat), relique Vitalité |
| **Vitesse** | 240 px/s | vitesse de déplacement max | relique Célérité |
| **Dégâts** | 1 | dégâts par projectile | relique Puissance |
| **Cadence de tir** | 3,2 tirs/s | délai entre projectiles | relique Cadence |
| **Vitesse de projectile** | 520 px/s | portée effective du tir | reliques (futur) |
| **Dash** : cooldown | 0,6 s | fréquence d'esquive | reliques (futur) |

Règles de ressenti : accélération + frottements (pas de vitesse on/off),
diagonales normalisées (pas plus rapides), i-frames pendant le dash et
0,9 s d'invulnérabilité après un coup reçu (anti « stun-lock »).

---

## 4. Permadeath — ce que la mort emporte, ce qu'elle laisse

La mort est **définitive pour la run** : pas de sauvegarde intermédiaire,
pas de continue.

**Perdu à la mort :**
- la progression dans la strate (le donjon est régénéré — nouvelle seed) ;
- les **Éclats de Lumen** non convertis ;
- toutes les **reliques** ramassées pendant la run ;
- les PV et statistiques temporaires.

**Conservé après la mort :**
- les **Fragments de Mémoire** gagnés (voir formule §5) — la mort n'est
  jamais une perte sèche ;
- les achats permanents du **Sanctuaire** ;
- l'**Écho** : le jeu enregistre la cellule (coordonnée de grille) de chaque
  mort — **désormais joué (V0.3)** : un revenant y resurgit dans une descente
  future (cf. §5.3).

Abandonner une run en cours (quitter vers le menu) ne rapporte **aucun**
fragment : on ne récolte que ce qu'on risque.

---

## 5. Méta-progression

### 5.1 Fragments de Mémoire (monnaie méta)
Gagnés à **chaque fin de run**, victoire comme défaite :

```
fragments = 5 × salles explorées (cumulées sur les strates)
          + 2 × éclats récoltés + 20 × Échos apaisés
          + 40 × Gardiens vaincus
```

### 5.2 Le Sanctuaire (dépense, depuis la Citadelle)
- **Mémoire vive** : +1 PV max de départ (coût croissant). *Implémenté.*
- Nouveaux Plongeurs (kits alternatifs), reliques débloquées dans le pool,
  faveurs de départ. *Roadmap.*

### 5.3 Les Échos — revenants (V0.3, **implémenté**)
L'Abîme se souvient de l'**endroit** de chaque mort : un Écho est gravé sur la
**cellule de grille** (coordonnée `gx,gy`) où le plongeur est tombé — pas sur
une strate précise. Une descente future qui régénère cette cellule en salle de
**combat** y fait resurgir un revenant (au plus 2 par descente ; les morts les
plus récentes reprennent leur place en priorité). Comme les cellules proches du
départ reviennent d'une seed à l'autre, les Échos ressurgissent réellement,
sans jamais garantir qu'une mort donnée retombe pile sur la même descente.

Le revenant **porte votre équipement** : ses PV, ses dégâts et sa cadence sont
calibrés sur la force du plongeur tombé et l'étage atteint. Il combat comme
vous — tir visé télégraphié en *kiting*, et **ruée** brutale (écho de votre
dash). Il apparaît **en sommeil**, inoffensif sur son sigil ; le joueur choisit :

- **Se recueillir** — rester immobile à son contact, sans tirer, remplit une
  jauge : contre un peu de **Lumen** (Éclats), on obtient un **soutien
  temporaire** (soin + regain de force pour la run) et l'Écho s'apaise sans
  combat.
- **L'affronter** — tirer le **provoque** (il s'éveille, les portes restent
  closes). Vaincu, il lâche un **butin garanti et bonifié** (cœur, clé, Éclats
  restitués, prime de profondeur).

Dans les deux cas, l'Écho **apaisé** quitte la sauvegarde (il ne resurgira
plus) et rapporte **+20 Fragments** (§5.1). Les salles hantées sont signalées
sur la minimap (point spectral) et le bilan de run compte les Échos apaisés.

> Découpage technique : le **placement** (quelle cellule est hantée) et le
> **calibrage** (PV/dégâts/butin/coût) sont de la logique **pure et testée**
> (`core/echoes.ts`, `tests/echoes.test.ts`) ; la mise en scène du revenant vit
> dans `entities/Echo.ts` et `scenes/GameplayScene.ts`, la persistance des
> traces dans `core/meta.ts`.

---

## 6. Génération procédurale & strates

- Donjon sur **grille** (façon Isaac) : marche aléatoire depuis la salle
  de départ, N salles connectées par des **portes** (N croît par strate :
  7 → 9 → 11).
- Types : **départ** (sûre) · **combat** (portes verrouillées jusqu'au
  nettoyage) · **trésor** (une relique) · **boss** (la plus profonde).
- **Seed** : toute la génération est déterministe par UNE seed de run
  (`?seed=n` en debug) ; chaque strate dérive sa propre seed de donjon
  (`core/strata.dungeonSeedFor`) → toute la descente est reproductible.
- **Strates** (`core/strata.ts`, données pures) : chaque monde définit sa
  palette d'environnement, son bestiaire pondéré, ses pièges (`spores`,
  `braises`), ses bornes de vagues et son Gardien.

### 6.1 Bestiaire (V0.4)

| Ennemi | Rôle | Signature |
|---|---|---|
| **Traqueur** (charger) | mêlée directe | fonce au contact |
| **Cracheur** (shooter) | harcèlement à distance | kite + crachat télégraphié |
| **Rôdeur** (orbiter) | harceleur mobile | ORBITE autour du joueur + ruée télégraphiée |
| **Gélif** (splitter) | pression de nombre | lent, se SCINDE en 2 rejetons à sa mort |
| **Sapeur** (bomber) | contrôle d'espace | s'amorce à portée et EXPLOSE (zone, tir ami) |
| **Sentinelle** (sentinel) | zone à nettoyer | tourelle immobile, salves RADIALES pivotantes |

### 6.2 Gardiens

| Strate | Gardien | Patterns |
|---|---|---|
| 1 | **Gardien** | charge massive (contact 2) |
| 2 | **Cracheur Alpha** | kiting + anneaux radiaux + éventail visé |
| 3 | **Avatar de l'Abîme** | radial + visé + RUÉES télégraphiées (final) |

### 6.3 Pièges d'ambiance

Salles de combat des strates 2-3 : poches de **spores** / évents de
**braises** — cycle sommeil → télégraphe (gonfle, s'éclaire) → éclat blessant.
Positions et déphasages seedés par salle.

---

## 7. Direction artistique (inchangée V0.1, condensée)

2D stylisée à silhouettes fortes ; palette froide (bleus/violets — l'Abîme)
contre chaleur du Lumen (ambre/or). UI diégétique : les PV sont des orbes
de Lumen. Ennemis marqués de « corruption mémorielle ». Audio : ambiances
par strate, intensité adaptative en combat.

## 8. Cible (inchangée V0.1, condensée)

Joueurs de rogue-lite d'action (*Isaac*, *Hades*, *Gungeon*), 16-35 ans,
PC/navigateur d'abord. Sessions 15-30 min. Exigeant mais équitable.

---

## 9. État d'implémentation (V0.4)

| Système | État |
|---|---|
| FSM du flux (menu/jeu/pause/résultat) | ✅ |
| Joueur 8 directions, frottements, dash i-frames | ✅ |
| Tir visé souris, cadence pilotée par les stats | ✅ |
| Collisions murs/obstacles/portes (hitbox/hurtbox) | ✅ |
| Donjon procédural seedé (départ/combat/trésor/boss) | ✅ |
| Ennemis : patrouille, détection, poursuite, dégâts de contact | ✅ |
| Loot (éclats) + relique de la salle trésor | ✅ |
| Permadeath + Fragments + Sanctuaire (+1 PV) | ✅ |
| Échos joués en jeu (revenants : combat OU recueillement) | ✅ (V0.3) |
| **3 strates** (environnements, descente par gouffre, difficulté croissante) | ✅ (V0.4) |
| Bestiaire élargi : 6 ennemis de vague + 3 Gardiens à patterns | ✅ (V0.4) |
| Pièges d'ambiance (spores, braises) | ✅ (V0.4) |
| Structure d'assets complète (héros, ennemis, Écho, environnements) | ✅ (V0.4) |
| Audio dédié, strates 4+, nouveaux Plongeurs | 🔜 roadmap |
