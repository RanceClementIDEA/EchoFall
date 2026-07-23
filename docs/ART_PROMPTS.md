# Prompts de génération d'assets — style « Dark Comic »

Descriptions textuelles précises des **spritesheets**, prêtes à coller dans
un générateur d'images (Midjourney, DALL·E, Stable Diffusion + LoRA
pixel-art…) ou à donner à un·e artiste. Sections : **Héros** (Idle, Course,
Visée/Tir, Hurt) puis **Ennemis** (Traqueur & Cracheur).

> Intégration : déposer les PNG dans `src/assets/hero/` (héros) ou
> `src/assets/foes/` (ennemis) avec les noms exacts indiqués, puis rebuild.
> Le code les détecte automatiquement (`BootScene` + `Player`/`EnemyBase`) ;
> **sans fichiers, le jeu garde les placeholders procéduraux** — rien ne
> casse.

---

## Contrat de style commun (à préfixer à chaque prompt)

> Sprite de jeu vidéo 2D, style **dark comic / retro-cartoon punchy** :
> **contours noirs épais et marqués** (encre `#120b1c`, 2 px), aplats de
> couleurs ultra-saturées, ombrage dur en 2 tons (pas de dégradés doux),
> **proportions dynamiques et exagérées** (héros trapu ~2,5 têtes, grosses
> mains, jambes courtes nerveuses), silhouette lisible instantanément.
> Personnage : **héros charismatique encapuchonné**, tunique **orange feu
> `#ff6a1e`** avec rehauts `#ffc24a`, **écharpe longue flottante** orange
> clair `#ffc24a` qui claque au vent (queue d'écharpe TOUJOURS en mouvement,
> jamais rigide), visage dans l'ombre de la capuche avec **deux yeux
> lumineux ambre**, gants et bottes sombres `#2a2440`.
> Vue **top-down 3/4** (légère plongée, comme The Binding of Isaac),
> personnage orienté **vers la DROITE** (le moteur retourne le sprite).
> **Fond 100 % transparent**, pixel-art net **sans anti-aliasing** sur les
> bords, pas d'ombre portée au sol (le moteur la gère), éclairage neutre.

**Négatif** (à exclure) : fond, décor, texte, filigrane, flou, dégradés
doux, 3D, réalisme, ombre portée, contours fins ou gris, anti-aliasing.

## Spécifications techniques communes

| Propriété | Valeur |
|---|---|
| Taille d'une frame | **32 × 32 px OU 48 × 48 px** (ou toute taille carrée) — auto-détectée depuis la hauteur de la bande ; **une même taille pour toutes les feuilles d'un personnage** |
| Disposition | **bande horizontale**, frames jointives, sans marge ni gouttière |
| Format | PNG, transparence (RGBA), palette réduite (~12 couleurs) |
| Orientation | dessinée vers la DROITE (profil), le HAUT (dos) ou le BAS (face) selon la feuille ; cohérente sur TOUTES les frames |
| Ancrage | centre du personnage au centre de la frame (le corps physique du moteur est indépendant : 18 × 22 px) |

Course **directionnelle** (façon Zelda) : une feuille par direction. `est`
couvre Est **et** Ouest via le **flip horizontal** (pas de feuille Ouest). Le
haut/bas pur conserve la dernière orientation. Tailles ci-dessous en 48×48 —
remplacer par 32 pour du 32×32.

| Fichier attendu | Frames | Taille totale (48px) | Boucle |
|---|---|---|---|
| `src/assets/hero/hero-idle.png` | 4–6 | 192–288 × 48 | oui |
| `src/assets/hero/hero-run-est.png` | 6–8 | 288–384 × 48 | oui |
| `src/assets/hero/hero-run-nord.png` | 6–8 | 288–384 × 48 | oui |
| `src/assets/hero/hero-run-sud.png` | 6–8 | 288–384 × 48 | oui |
| `src/assets/hero/hero-run.png` *(repli)* | 6–8 | 288–384 × 48 | oui |
| `src/assets/hero/hero-aim.png` *(option)* | 4 | 192 × 48 | non (jouée au tir) |
| `src/assets/hero/hero-hurt.png` *(option)* | 3 | 144 × 48 | non |

---

## 1. `hero-idle.png` — Repos (6 frames, boucle, ~8 fps)

> [Contrat de style] Spritesheet **IDLE en 6 frames** (bande horizontale
> 192×32) : le héros au repos, **cycle de respiration** en boucle parfaite.
> Frames 1→3 : la poitrine se gonfle, le buste s'étire d'1 px vers le haut,
> les épaules se soulèvent. Frames 4→6 : redescente souple, léger
> affaissement (squash d'1 px). **L'écharpe ondule doucement** derrière lui
> sur toute la boucle (vague lente, 2–3 px d'amplitude), les yeux ambre
> clignent une fois sur la frame 5. Posture confiante de héros : jambes
> écartées stables, poings prêts. La boucle 6→1 doit être invisible.

## 2. `hero-run.png` — Course (8 frames, boucle, ~14 fps)

> [Contrat de style] Spritesheet **COURSE en 8 frames** (bande horizontale
> 256×32) : **cycle de course énergique et cartoon** vers la droite, buste
> penché en avant de ~15°, grandes foulées exagérées. Frames 1–4 : première
> foulée (contact talon → poussée → suspension avec LES DEUX pieds décollés
> → réception) ; frames 5–8 : foulée opposée, symétrique. Sur les frames de
> suspension (3 et 7), **étirement vertical** léger du corps (+2 px) ; sur
> les contacts (1 et 5), **compression** (−2 px, silhouette tassée) — le
> squash & stretch doit se lire dans le dessin. **L'écharpe file à
> l'horizontale** derrière lui et claque (zigzag marqué, 4–6 px d'amplitude),
> petits traits de vitesse encrés derrière les bottes sur 2 frames. Boucle
> parfaite 8→1.

## 3. `hero-aim.png` — Visée / Tir (4 frames, jouée une fois, ~16 fps)

> [Contrat de style] Spritesheet **VISÉE/TIR en 4 frames** (bande
> horizontale 128×32) : le héros **braque son éclat de Lumen et tire vers
> la droite**. Frame 1 : posture de visée ancrée — jambes fléchies écartées,
> bras tendus vers la droite, mains jointes autour d'une **lueur orange feu
> naissante** entre les paumes. Frame 2 : **RECUL du tir** — buste compressé
> vers l'arrière (squash horizontal marqué, −3 px), épaules remontées,
> **flash d'étoile à 4 branches** blanc-jaune au bout des mains, écharpe
> projetée vers l'avant par l'inertie. Frame 3 : retour élastique avec
> **léger overshoot** vers l'avant (+1 px d'étirement). Frame 4 : retour à
> la posture de visée stable, prêt à re-tirer. Pas de projectile dessiné
> (géré par le moteur), seulement la lueur en main et le flash de bouche.

## 4. `hero-hurt.png` — Dégâts subis (3 frames, jouée une fois, ~18 fps)

> [Contrat de style] Spritesheet **HURT en 3 frames** (bande horizontale
> 96×32) : le héros **encaisse un coup venant de la droite**, réaction
> cartoon exagérée. Frame 1 : **impact** — corps projeté en arrière (lean
> ~20° vers la gauche), silhouette compressée horizontalement (squash −3 px),
> yeux réduits à deux traits, écharpe plaquée sur le buste, 2–3 **éclats
> d'impact encrés** (petits triangles noirs) côté droit. Frame 2 : recul
> maximal — un pied levé, bras en moulinets, grimace, **trait de tremblement**
> encré autour de la tête. Frame 3 : reprise d'appui — posture presque
> normale, encore penché, poings resserrés, regard furieux (sourcils en V
> sous la capuche). La frame 3 doit enchaîner proprement sur l'Idle.

---

# Ennemis — « cartoon menaçant, contours nets »

Même contrat technique que le héros (32×32, bande horizontale, fond
transparent, encre `#120b1c` épaisse, vue top-down 3/4, orienté **DROITE** —
le moteur retourne le sprite). Le ton change : **cartoon mais menaçant** —
silhouettes agressives, yeux mauvais, jamais mignon.

## Contrat de style commun — ennemis (à préfixer)

> Sprite de jeu vidéo 2D, style **dark comic / retro-cartoon menaçant** :
> **contours noirs nets et épais** (encre `#120b1c`, 2 px), aplats
> ultra-saturés, ombrage dur 2 tons, silhouette agressive lisible en une
> fraction de seconde. Vue **top-down 3/4**, personnage orienté **vers la
> DROITE**, **fond 100 % transparent**, pixel-art net sans anti-aliasing,
> pas d'ombre portée. Créature inquiétante mais cartoon (exagération,
> élasticité), **jamais mignonne** : yeux hostiles, gueule marquée.

**Négatif** : fond, décor, texte, filigrane, flou, dégradés doux, 3D,
réalisme, ombre portée, contours fins, anti-aliasing, style kawaii.

## Spécifications

| Fichier attendu | Frames | Taille totale | Boucle |
|---|---|---|---|
| `src/assets/foes/foe-charger-idle.png` | 6 | 192 × 32 | oui |
| `src/assets/foes/foe-charger-rush.png` | 6 | 192 × 32 | oui |
| `src/assets/foes/foe-shooter-idle.png` | 6 | 192 × 32 | oui |
| `src/assets/foes/foe-shooter-fire.png` | 6 | 192 × 32 | non (tir ~frame 5) |

---

## 5. Le Traqueur (fonceur) — formes ANGULEUSES, violet électrique

Identité : prédateur de mêlée taillé comme un **éclat de silex vivant** —
corps **violet électrique `#a93aff`** rehauts `#c77dff`, ventre sombre
`#3a1f5c`, **formes anguleuses** : triangles, arêtes vives, pointes dorsales
en dents de scie, pattes courtes griffues. **Deux yeux fendus blancs
incandescents**, sourcils en V soudés, gueule en zigzag pleine de crocs.

### 5a. `foe-charger-idle.png` — Affût (6 frames, boucle, ~8 fps)

> [Contrat ennemis] Spritesheet **AFFÛT en 6 frames** (bande 192×32) : le
> Traqueur à l'arrêt, ramassé sur lui-même comme un ressort armé.
> **Pulsation de tension** en boucle : frames 1→3 le corps se comprime
> légèrement (−1 px) et les **pointes dorsales se hérissent** d'1 px, frames
> 4→6 il se relâche sans jamais s'ouvrir. Les yeux fendus **balayent**
> (gauche frame 2, droite frame 5), micro-tremblement d'impatience sur la
> frame 3 (double contour partiel). Silhouette globale : losange bas et
> large, agressif même immobile. Boucle parfaite.

### 5b. `foe-charger-rush.png` — Charge (6 frames, boucle, ~14 fps)

> [Contrat ennemis] Spritesheet **CHARGE en 6 frames** (bande 192×32) : le
> Traqueur **fonce vers la droite tête en avant**, transformé en projectile
> vivant. Corps basculé à ~25°, **pointe frontale tendue comme une lame**,
> pointes dorsales couchées vers l'arrière par la vitesse, pattes en cycle
> rapide et flou (2 positions alternées). **Étirement horizontal** du corps
> (+2 px) sur les frames de pleine vitesse (2, 5), gueule grande ouverte
> crocs visibles sur les frames 3–4. Derrière lui, **chevrons de vitesse
> encrés** (2–3 traits anguleux) qui pulsent d'une frame à l'autre. Les yeux
> fendus fixent droit devant, brûlants. Boucle 6→1 fluide.

## 6. Le Cracheur (distance) — rond et élastique, jaune solaire

Identité : **crapaud-outre** flottant à mi-hauteur, corps **jaune solaire
`#ffd21e`** rehauts `#fff3a0`, ventre `#c9971a`, taches dorsales sombres
`#7a5c10`. Rond, mou, élastique — la menace vient de sa **bouche-canon**
circulaire sombre et de ses **yeux globuleux à pupille fendue** mi-clos,
méprisants. Trois excroissances molles sur le dos (antennes-verrues).

### 6a. `foe-shooter-idle.png` — Garde (6 frames, boucle, ~8 fps)

> [Contrat ennemis] Spritesheet **GARDE en 6 frames** (bande 192×32) : le
> Cracheur **se dandine sur place** en flottant, méfiant. Oscillation molle
> en boucle : le corps s'affaisse (squash −1 px) frames 1→3 puis rebondit
> (+1 px) frames 4→6, les **excroissances dorsales suivent avec un temps de
> retard** (drag élastique, 1 px de déphasage). Bouche-canon fermée en petit
> « o » sombre, yeux mi-clos qui **glissent vers la droite** (frame 2) puis
> reviennent (frame 5) — il surveille. Boucle invisible.

### 6b. `foe-shooter-fire.png` — Gonfle & crache (6 frames, une fois, ~12 fps)

> [Contrat ennemis] Spritesheet **GONFLE-ET-CRACHE en 6 frames** (bande
> 192×32), jouée une fois par tir : télégraphe lisible PUIS crachat. Frames
> 1→4 : **gonflement progressif et exagéré** — le corps enfle de +2 px par
> frame (jusqu'à ~+7 px, débordant presque du cadre), joues énormes, yeux
> qui s'écarquillent, **reflets de tension** (petits arcs clairs) sur la
> peau tendue, excroissances plaquées, micro-tremblement frame 4 (double
> contour). Frame 5 : **CRACHAT** — dégonflage violent (corps comprimé −4 px
> vers l'arrière), bouche-canon grande ouverte vers la droite avec **flash
> d'étoile à 4 branches** blanc-jaune, traits de projection encrés — le
> projectile lui-même N'EST PAS dessiné (géré par le moteur). Frame 6 :
> **rebond mou** — le corps tremblote en retrouvant sa forme (wobble),
> bouche entrouverte, filet de fumée. Pas de boucle : enchaîne sur la Garde.

---

## Notes d'intégration (déjà câblées dans le code)

- **Détection auto (taille + présence)** : `BootScene` charge tout
  `src/assets/hero/hero-*.png` et `src/assets/foes/foe-*.png` trouvé au build
  via `import.meta.glob` (aucun fichier → aucune requête), puis **découpe
  chaque bande en frames carrées dont le côté = la HAUTEUR de l'image** :
  **32×32, 48×48 ou toute taille carrée** fonctionnent, et les tailles peuvent
  différer d'un personnage à l'autre (héros 48, ennemis 32…). `Player` bascule
  sur les feuilles dès qu'il a `hero-idle` + **une** feuille de course, et
  choisit la **course directionnelle** (est/nord/sud, Ouest = est flippé) selon
  l'axe dominant du déplacement ; chaque ennemi bascule si SA paire
  `idle`/`act` est présente (le Gardien garde son placeholder procédural).
- **Vitesses héros** : idle 8 fps (boucle), run 14 fps (boucle), aim 16 fps
  (une fois), hurt 18 fps (une fois) — `Player.ensureHeroAnims`.
- **Vitesses ennemis** : idles 8 fps (boucle), rush 14 fps (boucle), fire
  12 fps (une fois — le moteur crache le projectile à ~340 ms, calé sur la
  frame 5) — registre `FOE_ANIMS` dans `EnemyBase`.
- Le **squash & stretch** procédural (dash/tir/atterrissage du héros,
  gonflement du Cracheur), le **flash d'impact** et le **recul visuel des
  ennemis** (silhouette projetée, hitbox immobile) s'appliquent PAR-DESSUS
  les frames : les feuilles n'ont pas besoin de les sur-jouer.
- Nombre de frames flexible : le code lit « toutes les frames » de chaque
  bande — livrer 6 ou 8 frames fonctionne sans toucher au code.
