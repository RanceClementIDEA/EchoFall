# Assets du héros — GIF animés, bandes PNG, ou image statique

Dépose tes fichiers **dans ce dossier** (`src/assets/hero/`). Le jeu les
détecte au build (`npm run build:single` ou `npm run dev`) — **aucun code à
toucher**. Convention de nommage commune aux 3 formats (ci-dessous).

> **Modèle test fourni** : ce dossier contient déjà un héros COMPLET en **GIF
> animés** (les 8 directions + idle/aim/hurt). Remplace n'importe quel fichier
> par le tien (même nom) — GIF, PNG ou image seule.

## 3 façons de fournir un asset (au choix, par fichier)

1. **GIF animé** — `hero-run-est.gif` : décodé frame par frame (transparence
   conservée), la cadence vient des délais du GIF. Le plus simple à produire
   (n'importe quel logiciel exporte du GIF). *Nécessite un navigateur récent —
   Chrome/Edge/Opera, Firefox ≥ 133, Safari ≥ 16.4 — sinon repli PNG/procédural.*
2. **Bande PNG** — `hero-run-est.png` : frames CARRÉES collées horizontalement
   `[f1][f2]…`, fond transparent. Taille auto-détectée (32×32, 48×48…). Marche
   partout, le plus léger.
3. **Image STATIQUE** — un seul `hero-idle.png` (1 frame, taille libre) : sert
   à tout, juste retournée gauche/droite. Zéro animation.

Un **GIF prime** sur un PNG de même nom. Tu peux **mélanger** les formats
selon les fichiers.

## Les 8 directions (noms EXACTS, `.gif` ou `.png`)

```
        hero-run-nord            ↑ N
 hero-run-nord-ouest  ↖      ↗  hero-run-nord-est
       hero-run-ouest  ←  •  →  hero-run-est
  hero-run-sud-ouest  ↙      ↘  hero-run-sud-est
        hero-run-sud             ↓ S
```

| Fichier (`.gif` ou `.png`) | Direction |
|---|---|
| `hero-run-nord` | Nord ↑ |
| `hero-run-nord-est` | Nord-Est ↗ |
| `hero-run-est` | Est → |
| `hero-run-sud-est` | Sud-Est ↘ |
| `hero-run-sud` | Sud ↓ |
| `hero-run-sud-ouest` | Sud-Ouest ↙ |
| `hero-run-ouest` | Ouest ← |
| `hero-run-nord-ouest` | Nord-Ouest ↖ |

+ interactions : `hero-idle` (arrêt), `hero-aim` (tir), `hero-hurt` (coup reçu).

## 🌀 Cas spécial : UN seul GIF « rotation » (chaque image = une direction)

Si ton perso est **un seul GIF où chaque image le montre tourné dans une
direction** (au lieu d'un fichier par direction), nomme-le **`hero-turn.gif`**
(ou `.png` en bande). Le jeu affiche alors **UNE image figée = la direction où
le héros MARCHE** (pas d'animation qui défile), et l'agrandit **2×**.

- Il détecte tout seul le **nombre de directions** (4, 8, 16…).
- Règle l'ordre des images dans **`src/entities/Player.ts`** (tout en haut) si
  le héros regarde de travers :
  - `TURN_OFFSET` = quelle direction montre la **1re image** (0 = Est, 2 = Sud,
    4 = Ouest, 6 = Nord) ;
  - `TURN_CLOCKWISE` = les images tournent-elles dans le sens horaire ?
- Taille : constante `HERO_TURN_SCALE` (2 par défaut).

`hero-turn` est **prioritaire** : présent, il remplace tout le reste (idle,
course…). C'est le mode le plus simple pour un sprite « tourne-toi ».

## Repli automatique (tu n'es pas obligé de tout fournir)

`direction dédiée` → `Ouest/SO/NO = Est/SE/NE en miroir` → `cardinale dominante
(est/nord/sud)` → `hero-run` générique → **image statique** → rendu procédural.
Donc : un seul `hero-idle` suffit à jouer ; est+nord+sud donnent déjà un rendu
fluide 8 voies ; les 8 fichiers = chaque direction avec TON image, sans miroir.

La visée/tir est indépendante de l'orientation (angle calculé vers la souris).
Prompts/inspiration : [`docs/ART_PROMPTS.md`](../../../docs/ART_PROMPTS.md).
