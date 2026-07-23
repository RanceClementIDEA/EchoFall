# Echofall — Architecture technique

## 1. Choix de la stack

**Retenu : TypeScript + Phaser 3 + Vite.**

| Critère | TS + Phaser + Vite ✅ | React + Canvas | Godot |
|---|---|---|---|
| Boucle 60 FPS | RAF piloté par le moteur | React re-render inadapté à une boucle impérative ; tout finit dans un `useRef` hors React | native |
| Physique / collisions | moteur arcade intégré | à écrire à la main | native |
| Scènes / états | système de Scenes natif | à écrire | native |
| Contrainte « poste d'entreprise » | joue dans le navigateur, dev dans le cloud | idem | éditeur desktop à installer ❌ |
| Testabilité | Vitest sur les modules purs (génération, RNG) | idem | GDScript, moins outillé |

React reste excellent pour de l'UI applicative, mais un jeu d'action est
une boucle impérative à 60 Hz sur un canvas : le modèle déclaratif de React
n'y apporte rien et gêne. Phaser fournit boucle, physique, entrées,
scènes et scaling — on n'écrit que le jeu.

## 2. Initialisation de l'environnement

```bash
# création du projet (déjà fait dans ce dépôt, pour référence)
npm create vite@latest echofall -- --template vanilla-ts
cd echofall && npm install phaser
npm install -D vitest

# cycle de développement
npm install        # dépendances
npm run dev        # serveur de dev (HMR) → http://localhost:3000
npm run test       # tests unitaires (génération procédurale, RNG)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + bundle de production → dist/
npm run preview    # sert dist/ localement
```

Déploiement : `dist/` est 100 % statique → GitHub Pages, Vercel ou itch.io
(chemins relatifs via `base: './'`).

## 3. Boucle principale et 60 FPS

Phaser pilote la boucle via `requestAnimationFrame` (cadencé par l'écran,
60 Hz typique). `fps.target = 60` est déclaré dans la config ; surtout,
**tout mouvement est fonction du temps** (vitesses en px/s intégrées par le
moteur avec le delta), donc le jeu reste correct à 30 comme à 144 Hz.

## 4. Architecture des dossiers

```
rogue-lite-2d/
├── docs/                    # GDD, architecture
├── index.html               # page hôte (conteneur #game)
├── src/
│   ├── main.ts              # point d'entrée : new Phaser.Game(config)
│   ├── config.ts            # config moteur (scale, physique, fps, scènes)
│   ├── theme.ts             # dimensions + palette (aucune dépendance)
│   ├── core/                # logique pure, sans Phaser → testable
│   │   ├── rng.ts           #   RNG seedé (mulberry32) : génération déterministe
│   │   ├── stats.ts         #   statistiques du joueur (données, cf. GDD §3)
│   │   └── meta.ts          #   persistance méta (localStorage) : fragments, échos
│   ├── dungeon/
│   │   ├── types.ts         #   RoomNode, RoomType, Side, Dungeon
│   │   └── DungeonGenerator.ts  # marche aléatoire sur grille, BFS, types de salles
│   ├── state/
│   │   ├── GameState.ts     #   états + table des transitions autorisées
│   │   ├── GameFlow.ts      #   machine à états du flux (valide + exécute)
│   │   └── RunState.ts      #   état d'une run : stats, PV, éclats, donjon, permadeath
│   ├── entities/
│   │   ├── Player.ts        #   8 directions, frottements, dash, hurtbox
│   │   └── Enemy.ts         #   ennemi générique : patrouille/détection/poursuite
│   ├── scenes/              # une scène par état de la FSM
│   │   ├── BootScene.ts     #   amorçage (assets) → menu
│   │   ├── MenuScene.ts     #   Citadelle : jouer, Sanctuaire (méta)
│   │   ├── GameplayScene.ts #   construit la salle courante, combat, portes
│   │   ├── PauseScene.ts    #   overlay de pause
│   │   └── ResultScene.ts   #   victoire / game over + bilan de run
│   ├── systems/             # (réservé) échos, sauvegarde de run, audio
│   └── ui/
│       ├── background.ts    #   fond de l'Abîme (partagé)
│       ├── Button.ts        #   bouton (partagé)
│       ├── Hud.ts           #   orbes de PV, éclats, jauge de dash
│       └── Minimap.ts       #   minimap du donjon (salles découvertes)
├── tests/
│   └── dungeon.test.ts      # invariants du générateur (connexité, symétrie, seed)
├── vite.config.ts / tsconfig.json / package.json
```

Principes :
- **`core/` et `dungeon/` ne touchent jamais Phaser** → testables avec
  Vitest sans navigateur, réutilisables.
- **Une scène = un état** de la FSM ; les transitions passent toutes par
  `GameFlow` (aucune scène ne lance une autre scène directement).
- **Changement de salle = `scene.restart`** de GameplayScene : Phaser
  nettoie timers, listeners et corps physiques — pas de fuite ; ce qui
  survit à la salle (PV, stats, donjon) vit dans `RunState`, ce qui
  survit à la mort vit dans `core/meta.ts` (localStorage).
- **Hitbox ≠ visuel** : chaque entité règle explicitement son corps
  physique (hurtbox du joueur plus petite que le sprite).

## 5. Débogage

- `npm run dev` expose `window.__game` (instance Phaser) et
  `window.__run` (RunState) — en dev uniquement, éliminés du build.
- `?seed=123` force la seed du donjon (reproduction de bugs).

## 6. Conventions

### Course directionnelle & miroir des personnages animés

Le héros gère une **course jusqu'à 8 DIRECTIONS** (`Player.runAnim`) : une
feuille dédiée par direction — `hero-run-{est,nord-est,nord,nord-ouest,ouest,
sud-ouest,sud,sud-est}` — choisie selon l'octant de la **vitesse réelle**.
Repli en cascade quand une feuille manque : **direction dédiée** (jouée telle
quelle, sans miroir) → **Ouest/SO/NO = Est/SE/NE en MIROIR** → **cardinale
dominante** (est/nord/sud, Ouest = est miroir) → **course générique**
`hero-run` → **textures procédurales**. Où déposer ses PNG :
[`src/assets/hero/README.md`](../src/assets/hero/README.md). Toutes tailles
carrées acceptées (32, 48… — auto-détectées, cf. `BootScene.sliceSheets`).

Le **miroir** (`setFlipX`) est décidé **par animation, chaque frame**
(`Player.updateAnim`) : une feuille dédiée à sa direction n'est **jamais**
retournée ; seules les feuilles de repli (Est, générique, procédurale) sont
flippées pour aller vers la gauche. À l'arrêt et pour les poses visée/hurt, le
sprite conserve sa dernière orientation horizontale (`facingLeft`, mis à jour
si `dir.x !== 0` dans `controlUpdate`).

Les **ennemis** restent sur une feuille de déplacement unique retournée selon
le signe de la vitesse horizontale (`EnemyBase.update` : `velocity.x < 0`) —
tout nouveau type qui étend `EnemyBase` en hérite.

La **visée/tir** est indépendante de l'orientation (l'angle des projectiles
est calculé vers la souris/le joystick dans `GameplayScene.fire()`) : on peut
se déplacer dans un sens en tirant dans l'autre.

Le flip des ennemis vit dans **`EnemyBase.update`** : tout nouveau type
d'ennemi qui étend `EnemyBase` (et n'override que `engage()`) l'hérite
**automatiquement**. Un nouveau personnage animé hors hiérarchie ennemie doit
reproduire le même appel `setFlipX` par frame (cf. `Player`).
