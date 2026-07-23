# Echofall — Prototype

Rogue-lite 2D **top-down** (donjon en salles façon *The Binding of Isaac*),
décrit dans [`docs/GDD.md`](docs/GDD.md) ; choix techniques et architecture
dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

- **[Phaser 3](https://phaser.io/)** — moteur 2D (boucle 60 FPS, physique arcade, scènes).
- **TypeScript** · **[Vite](https://vitejs.dev/)** · **Vitest** (tests des modules purs).

100 % web : rien à installer côté joueur, le jeu tourne dans un navigateur.

## Commandes

```bash
npm install          # dépendances
npm run dev          # serveur de dev  → http://localhost:3000
npm run test         # tests unitaires (générateur de donjon, RNG)
npm run build        # typecheck + build de production dans dist/
npm run build:single # build « 1 seul fichier » autonome → dist-single/index.html
npm run preview      # sert le build de production localement
npm run typecheck    # vérifie les types sans compiler
```

### Test lançable (sans rien installer)

`npm run build:single` produit **`dist-single/index.html`** : un seul fichier
autonome (Phaser + jeu + CSS inlinés, aucune requête réseau). Renomme-le si tu
veux, puis **double-clique** dessus — il s'ouvre dans le navigateur en `file://`
et se joue directement, sans serveur ni installation (adapté à un poste
verrouillé en entreprise).

> Le build `dist/` classique, lui, ne s'ouvre pas en `file://` (modules ES) :
> il faut `npm run dev` ou déployer `dist/` en statique (Pages, Vercel, itch.io).
> C'est précisément ce que contourne `build:single`.

## Contrôles

**Clavier / souris (desktop)**

| Action | Touches |
|---|---|
| Se déplacer (8 directions) | `ZQSD` (AZERTY) / `WASD` (QWERTY) / flèches |
| Dash (invincible pendant) | `Maj` ou `Espace` |
| Tirer | clic gauche — visé à la souris, maintien = tir continu |
| Objet actif | `F` (une fois chargé) |
| Couper / rétablir le son | `M` |
| Pause | `Échap` |

**Tactile (téléphone / tablette)** — `systems/TouchControls.ts`, activé
automatiquement sur écran tactile (rien ne change sur desktop) :

| Action | Geste |
|---|---|
| Se déplacer | **joystick gauche** (apparaît au doigt sur la moitié gauche) |
| Viser + tirer | **joystick droit** (pousser = tirer dans cette direction) |
| Dash | bouton **⤢** (bas) |
| Objet actif | bouton **F** (bas) |
| Pause | bouton **II** (haut) |

> Le jeu est en **paysage** (960×540) : sur téléphone tenu à la verticale, un
> écran invite à tourner l'appareil. Idéal via le fichier autonome
> `dist-single/index.html` (hébergé, ou ouvert localement).

## Ce qui est en place (V0.4)

- **Descente MULTI-STRATES (V0.4)** (`core/strata.ts`) : la run traverse
  **3 mondes** — Failles d'Ardoise (7 salles) → **gouffre de descente** →
  Jardins Fongiques (9) → Fournaise des Profondeurs (11). Chaque strate a son
  **environnement** (palette de pierre, torches, runes — sol/obstacles
  remplaçables par des assets `env-*`), son **bestiaire pondéré**, ses
  **pièges** (poches de spores, évents de braises — cycle télégraphié) et son
  **Gardien** ; PV/vitesse des ennemis et taille des vagues croissent avec la
  profondeur. PV, stats, reliques et butin TRAVERSENT les descentes ; la
  victoire n'arrive qu'au bout de la dernière strate. Toute la descente est
  reproductible par une seule seed (`?seed=n`).
- **Bestiaire élargi (V0.4)** : 6 ennemis de vague — Traqueur (fonce),
  Cracheur (kite + tir), **Rôdeur** (orbite + ruée télégraphiée), **Gélif**
  (se scinde en 2 rejetons à sa mort), **Sapeur** (s'amorce et explose en
  zone, avec tir ami — réactions en chaîne), **Sentinelle** (tourelle à
  salves radiales pivotantes) — plus 3 **Gardiens** : Gardien (charge),
  **Cracheur Alpha** (anneaux radiaux + éventail visé) et **Avatar de
  l'Abîme** (radial + visé + ruées, boss final). Plans de vagues purs et
  testés (`core/waves.ts`).
- **Structure d'assets complète (V0.4)** : un contrat de nommage par dossier —
  `src/assets/hero/` (8 directions, GIF/PNG, ou **feuille de rotation**
  `hero-turn` : une frame figée par direction de marche, agrandie 2×),
  `src/assets/foes/` (paire `idle`/`act` par ennemi et par Gardien),
  `src/assets/echo/` (skin du revenant), `src/assets/env/` (sol/obstacle par
  strate). TOUT est optionnel : chaque asset absent retombe sur le rendu
  procédural (README détaillé dans chaque dossier).
- **Échos — revenants (V0.3)** (`core/echoes.ts`, `entities/Echo.ts`) : chaque
  mort grave un Écho **à l'endroit exact où vous êtes tombé·e** (coordonnée de
  grille). Une descente future qui régénère cette cellule en salle de combat y
  fait resurgir un **revenant** portant votre équipement, calibré sur votre
  force et l'étage atteint. Il apparaît **en sommeil** : approchez-vous sans
  tirer pour vous **recueillir** (soin + regain de force contre un peu de
  Lumen) — ou **tirez** pour l'affronter (kiting + volées visées + ruées, écho
  de votre dash). Vaincu, il lâche un **butin bonifié** ; apaisé d'une façon ou
  de l'autre, il ne resurgit plus et rapporte des Fragments. Signalé sur la
  minimap (point spectral) et compté au bilan. Placement **déterministe et
  testé** (`core/echoes`).
- **FSM du flux** : menu → jeu → pause → résultat, transitions validées.
- **Donjon procédural seedé** : salles sur grille reliées par des portes
  (départ, combats, trésor, boss) ; minimap ; portes verrouillées en combat.
- **Vagues de combat** (`systems/Spawner.ts`) : à l'entrée les portes se
  ferment, les ennemis surgissent par vagues (apparition télégraphiée), et les
  portes ne se rouvrent qu'une fois la dernière vague vaincue.
- **Joueur** : 8 directions (accélération + frottements, diagonales
  normalisées), dash à i-frames, tir visé, hurtbox réduite.
- **Ennemis** : classe abstraite `EnemyBase` (PV, détection, patrouille) et
  deux types — `Charger` (fonce) et `Shooter` (garde ses distances, tire) ;
  Gardien (boss) avec barre de vie.
- **Loot** (`systems/loot.ts`) : table de drop probabiliste — pièces (monnaie),
  cœurs (soin), clés, bombes ; ramassage au contact.
- **Objets modulaires** (`items/`) : registre extensible d'objets **passifs**
  (mutent les stats : +vitesse, tirs multiples, +cœur max…) et **actifs**
  rechargeables (soin, onde de dégâts) — obtenus en salle trésor, actif
  déclenché à la touche `F`.
- **HUD « Dark Comic » percutant** (`ui/Hud.ts`) : **cadres épais noirs**
  (encre) à liseré pourpre, **icônes vectorielles pleines de pep's** (cœurs
  stylisés cernés d'encre à reflet, bombe à **mèche allumée qui vacille**,
  pièce/clé cerclées), **chiffres en police grasse et massive** (`FONTS.comic`).
  Cœurs pleins/vides, compteurs pièces/clés/bombes en pastilles encadrées,
  jauge de dash, et objet actif (emplacement + jauge de charge segmentée
  encrée). **Urgence** : sous 25 % de PV, toute l'interface des cœurs **pulse
  en rouge** (voile clignotant + battement des cœurs) — le danger se lit d'un
  coup d'œil.
- **Menu principal** (`scenes/MenuScene.ts`) : logo **ECHOFALL** massif orange
  cerné d'encre qui claque à l'entrée (slam-in), emblème-braise battant,
  braises ascendantes et vignette, pastille de Fragments, grand bouton
  **DESCENDRE**, et **Sanctuaire** en panneau encadré où chaque
  amélioration/objet est une **carte cliquable** (liseré vert + survol si
  abordable, grisée sinon) ; bouton de son encadré. Méta-progression
  inchangée (achats persistés, rafraîchissement à l'achat).
- **Juice & polish** (`systems/Fx.ts` + entités) : particules (poussière,
  traînées de tirs, gerbes d'éclats teintés), **impacts BD** — étoiles à
  4 branches blanc chaud (rendu additif) + éclats géométriques saturés sur
  chaque tir qui touche un mur ou un ennemi —, **pop-ups de dégâts comics**
  (« -N » cerné d'encre ; **coups critiques** 10 %, ×2 : « POW ! », « BAM ! »,
  « CRAC ! » en jaune solaire, RNG seedé par salle), ondes de choc,
  **screen shake** calibré (coup reçu / kill / mort de boss), flashs de dégâts
  + voile d'écran, halo-lanterne du joueur, vignette d'atmosphère,
  squash & stretch (respiration, course, dash, recul de tir), wobble des
  ennemis, annonces et titres animés, jauge de boss fluide (lerp), fondus
  d'écran entre scènes.
- **Direction artistique — « Retro-Cartoon Punchy » (Dark Comic)** : fonds
  sombres et terreux (gris ardoise, pourpre profond) contre entités
  ultra-saturées cernées d'un trait d'encre — joueur & tirs alliés **orange
  feu**, charger **violet électrique**, shooter **jaune solaire**, boss **rouge
  feu**, tirs ennemis **magenta** ; le contraste garantit la lisibilité
  immédiate du combat. Charte centralisée dans `src/theme.ts` (`COLORS`).
- **Décor du donjon** (`systems/tileset.ts`) : dalles de pierre **taillées**
  (biseau éclairé haut-gauche / ombré bas-droite, joints d'encre francs,
  fissures, éclats et **runes ambiantes** déterministes), murs en **appareil
  de pierre** (assises de blocs à joints décalés) avec **ombre portée** sur le
  sol et **liseré de crête éclairé**, obstacles en blocs taillés, et
  **torches murales à flamme + halo chaud VACILLANT** (atmosphère) — 100 %
  généré, purement visuel (les corps physiques restent des rectangles intacts).
- **Pipeline de spritesheets (héros & ennemis)** : prompts de génération
  précis dans [`docs/ART_PROMPTS.md`](docs/ART_PROMPTS.md) — héros (Idle,
  Course, Visée/Tir, Hurt) et ennemis « cartoon menaçant » (Traqueur
  anguleux affût/charge, Cracheur qui **gonfle avant de tirer**), 32×32.
  Déposer les PNG dans `src/assets/hero/` / `src/assets/foes/` et rebuild :
  détection automatique (`BootScene` via `import.meta.glob`), machines à
  états d'animation dans `Player` (hurt > visée > course/idle) et
  `EnemyBase` (`act` > engagé > idle), **squash & stretch** par-dessus les
  frames (dash étiré + atterrissage compressé, gonflement télégraphié du
  Cracheur ~340 ms avant chaque crachat), **flash blanc d'impact** du héros
  et **recul visuel** des ennemis (silhouette projetée + jolt d'angle,
  hitbox immobile) ; sans fichiers, le jeu garde ses textures procédurales.
- **Audio** (`systems/Sound.ts`) : son 100 % procédural (Web Audio, aucun
  fichier) — musique de donjon en boucle + bruitages (tir, dégâts subis,
  dégâts ennemis, coffre, mort) ; mute (`M`), pause de la musique en pause.
- **Menus** : Pause (aperçu des stats), Game Over et Victoire de fin de donjon
  avec bilan de run (ennemis vaincus, temps, étage) et bouton « Recommencer ».
- **Boucle complète** : exploration → combat (vagues) → loot →
  objet (salle trésor) → boss → victoire/permadeath.
- **Sauvegarde méta** (`core/meta.ts`) : sauvegarde versionnée et tolérante à
  la corruption, persistée en localStorage entre les sessions — Fragments
  (monnaie persistante), améliorations permanentes (+1 PV max), **objets
  débloqués** au Sanctuaire (qui rejoignent le pool des runs), **préférences**
  (audio), et Échos enregistrés à chaque mort.

Debug : `npm run dev` expose `window.__game` / `window.__run` / `window.__items`,
et `?seed=n` force la seed du donjon.

## Structure

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour l'arborescence
commentée et les principes (modules purs testables, une scène = un état,
`RunState` = permadeath, `core/meta.ts` = persistance).
