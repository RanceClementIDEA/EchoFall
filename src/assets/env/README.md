# Assets d'environnement — une ambiance par STRATE

Chaque strate de l'Abîme a son environnement (palette procédurale par défaut,
cf. `src/core/strata.ts`). Tu peux REMPLACER le rendu procédural en déposant
ici des textures PNG nommées par strate — détectées au build, zéro code :

| Fichier | Rôle | Format conseillé |
|---|---|---|
| `env-<id>-floor.png` | sol de la salle, répété en tuile | 192×192 (raccordable) |
| `env-<id>-obstacle.png` | bloc d'obstacle | 64×64 |

## Les `<id>` de strate

| id | Strate | Ambiance par défaut |
|---|---|---|
| `ardoise` | 1 — Failles d'Ardoise | pierre ardoise & pourpre, torches orange |
| `fonge` | 2 — Jardins Fongiques | roche moussue verte, lueurs turquoise |
| `fournaise` | 3 — Fournaise des Profondeurs | roche brûlée, braises orange |

Exemples : `env-fonge-floor.png` (sol moussu), `env-fournaise-obstacle.png`
(rocher de lave). Un fichier absent → rendu procédural de la strate (rien ne
casse). Les murs, torches et pièges restent procéduraux (teintés par la
palette de la strate).

> Astuce : le sol est une **tuile répétée** — vérifie que tes bords se
> raccordent (seamless). Fond opaque conseillé pour le sol, transparent pour
> l'obstacle.
