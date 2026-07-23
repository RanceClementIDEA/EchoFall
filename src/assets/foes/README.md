# Assets des ennemis — contrat complet (V0.4)

Dépose ici tes feuilles d'ennemis : **GIF animé** ou **bande PNG** de frames
**carrées** (fond transparent, 32×32 ou 48×48 — auto-détecté ; une seule
taille par personnage). Un `.gif` **prime** sur un `.png` de même nom.
Détection automatique au build — **aucun code à toucher**.

Chaque ennemi bascule sur ses feuilles si SA paire `idle`/`act` est présente,
sinon il garde sa texture procédurale (le jeu est TOUJOURS jouable sans assets).

## Bestiaire des vagues (2 fichiers chacun)

| Ennemi | Comportement | Feuille `idle` | Feuille d'action |
|---|---|---|---|
| **Traqueur** (charger) | fonce au contact | `foe-charger-idle` | `foe-charger-rush` (charge) |
| **Cracheur** (shooter) | kite + tir visé | `foe-shooter-idle` | `foe-shooter-fire` (gonfle & crache, jouée 1×, tir ~frame 5) |
| **Rôdeur** (orbiter) | orbite + ruée | `foe-orbiter-idle` | `foe-orbiter-dash` (ruée) |
| **Gélif** (splitter) | lent, se scinde à la mort | `foe-splitter-idle` | `foe-splitter-move` (reptation) |
| **Sapeur** (bomber) | s'amorce et explose | `foe-bomber-idle` | `foe-bomber-fuse` (mèche allumée) |
| **Sentinelle** (sentinel) | tourelle radiale immobile | `foe-sentinel-idle` | `foe-sentinel-burst` (salve, jouée 1×) |

> Les rejetons du Gélif réutilisent ses feuilles (réduits automatiquement).

## Gardiens (boss de strate)

| Gardien (strate) | Feuilles |
|---|---|
| **Gardien** (1 — Failles d'Ardoise) | `foe-boss-gardien-idle` / `foe-boss-gardien-act` |
| **Cracheur Alpha** (2 — Jardins Fongiques) | `foe-boss-alpha-idle` / `foe-boss-alpha-act` |
| **Avatar de l'Abîme** (3 — Fournaise) | `foe-boss-avatar-idle` / `foe-boss-avatar-act` |

`idle` = déplacement/veille (boucle) ; `act` = action signature — charge,
télégraphe de salve… (boucle, sauf mention). Extensions `.png` ou `.gif`.

> Les fichiers actuels sont des **placeholders générés** — remplace-les par
> ton art définitif, mêmes noms. Style : « Dark Comic » saturé cerné d'encre
> (couleur signature par ennemi, cf. `src/theme.ts`). Prompts :
> [`docs/ART_PROMPTS.md`](../../../docs/ART_PROMPTS.md).
