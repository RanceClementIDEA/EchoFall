import Phaser from 'phaser'
import { runState } from '../state/RunState'
import { sound } from '../systems/Sound'
import { turnFrameForAngle } from '../core/facing'

/* ─────────────────────────────────────────────────────────────────────────
 * Réglages de ressenti (le reste vient de runState.stats — GDD §3).
 * ────────────────────────────────────────────────────────────────────────*/
const ACCEL = 2600 // accélération (px/s²) → réactivité
const FRICTION = 1800 // frottements quand aucune touche n'est pressée
const DASH_SPEED = 620 // vitesse pendant le dash (px/s)
const DASH_MS = 160 // durée du dash
const HIT_INVULN_MS = 900 // invulnérabilité après un coup (anti stun-lock)
const KNOCKBACK = 260 // recul subi à l'impact (px/s)
const HIT_FLASH = 0xffffff // flash BLANC d'impact (silhouette pleine, comic)
const HIT_FLASH_MS = 120 // durée du flash d'impact
const AIM_ANIM_MS = 240 // fenêtre de l'anim de visée/tir après un tir
const HURT_ANIM_MS = 320 // fenêtre de l'anim de dégâts
const DASH_END_SQUASH_MS = 110 // « atterrissage » : compression en fin de dash

/**
 * Spritesheets du héros (cf. docs/ART_PROMPTS.md) : clé de texture chargée
 * par BootScene → { clé d'animation, fps, boucle }. Le Player ne bascule sur
 * les feuilles que si LES QUATRE sont chargées ; sinon il garde la texture
 * procédurale (aucun asset requis pour jouer).
 */
const HERO_ANIMS = [
  { sheet: 'hero-idle', fps: 8, loop: true },
  // Course : jusqu'à 8 feuilles DIRECTIONNELLES dédiées (une par direction,
  // dessinée VERS cette direction — aucun miroir appliqué). Toutes
  // optionnelles ; repli en cascade (cf. runAnim) : direction dédiée → miroir
  // Ouest←Est / SO←SE / NO←NE → cardinale dominante (est/nord/sud, l'Ouest =
  // Est miroir) → course générique `hero-run` → idle → rendu procédural.
  { sheet: 'hero-run', fps: 14, loop: true },
  { sheet: 'hero-run-est', fps: 14, loop: true },
  { sheet: 'hero-run-nord-est', fps: 14, loop: true },
  { sheet: 'hero-run-nord', fps: 14, loop: true },
  { sheet: 'hero-run-nord-ouest', fps: 14, loop: true },
  { sheet: 'hero-run-ouest', fps: 14, loop: true },
  { sheet: 'hero-run-sud-ouest', fps: 14, loop: true },
  { sheet: 'hero-run-sud', fps: 14, loop: true },
  { sheet: 'hero-run-sud-est', fps: 14, loop: true },
  { sheet: 'hero-aim', fps: 16, loop: false },
  { sheet: 'hero-hurt', fps: 18, loop: false },
] as const

/** Octant de vitesse (0=E,1=SE,2=S,3=SO,4=O,5=NO,6=N,7=NE) → suffixe de feuille. */
const DIR8 = ['est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est']
/** Ouest/SO/NO se rabattent sur Est/SE/NE en MIROIR si la feuille dédiée manque. */
const MIRROR: Record<string, string> = {
  ouest: 'est',
  'sud-ouest': 'sud-est',
  'nord-ouest': 'nord-est',
}

/* ── Mode « feuille de rotation » (facultatif) ─────────────────────────────
 * Si une texture `hero-turn` est présente (une SEULE feuille GIF/PNG dont
 * CHAQUE frame = une direction), le héros affiche UNE frame FIGÉE selon sa
 * direction de MARCHE (au lieu d'animer la feuille), agrandie. Parfait pour un
 * sprite « tourne-toi ». Prioritaire sur les feuilles hero-* animées.
 * Règle l'ordre des frames selon TON asset via les deux constantes ci-dessous. */
const HERO_TURN_SHEET = 'hero-turn'
const HERO_TURN_SCALE = 2 // héros 2× plus grand
/** Direction de la frame 0, en HUITIÈMES de tour : 0=Est, 2=Sud, 4=Ouest, 6=Nord. */
const TURN_OFFSET = 0
/** Les frames suivantes tournent-elles dans le sens horaire ? */
const TURN_CLOCKWISE = true

/**
 * Player — personnage jouable en vue de dessus (physique arcade).
 *
 * • Déplacement **8 directions** (ZQSD/WASD/flèches — AZERTY et QWERTY),
 *   par accélération + frottements : fluide ET réactif. Les diagonales sont
 *   normalisées (pas plus rapides que les axes).
 * • **Dash** directionnel avec i-frames, cooldown venant des stats.
 * • **Hurtbox** volontairement plus petite que le sprite (équitable pour le
 *   joueur) ; `takeDamage` gère i-frames, recul et clignotement.
 * • **Rendu** : si les spritesheets `hero-*` sont chargées (BootScene), une
 *   petite machine à états d'animation les pilote (idle / course / visée-tir
 *   / hurt) ; sinon, texture procédurale. Dans les deux cas s'ajoutent le
 *   **squash & stretch** (couche de scale multiplicative — les frames restent
 *   intactes) et le **flash blanc d'impact**.
 *
 * Les PV et statistiques vivent dans `runState` (survivent aux changements
 * de salle, effacés par le permadeath) — le Player n'est que l'incarnation
 * physique dans la salle courante.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** Dernière direction de déplacement non nulle (sert au dash sans input). */
  private lastMoveDir = new Phaser.Math.Vector2(1, 0)
  /**
   * Dernière orientation horizontale connue (façon Zelda) : mise à jour
   * UNIQUEMENT quand le déplacement a une composante horizontale ; conservée
   * en déplacement vertical pur et à l'arrêt. Pilote `setFlipX`.
   */
  private facingLeft = false

  private keys: {
    up: Phaser.Input.Keyboard.Key[]
    down: Phaser.Input.Keyboard.Key[]
    left: Phaser.Input.Keyboard.Key[]
    right: Phaser.Input.Keyboard.Key[]
    dash: Phaser.Input.Keyboard.Key[]
  }

  private dashEndsAt = 0
  private dashReadyAt = 0
  private hitInvulnUntil = 0
  /** Fin du squash de tir (pose « recul »). */
  private recoilUntil = 0
  /** Fenêtre d'affichage de l'anim de visée/tir (ouverte par `recoil`). */
  private aimUntil = 0
  /** Fenêtre d'affichage de l'anim de dégâts (ouverte par `takeDamage`). */
  private hurtAnimUntil = 0
  /** Fin de la compression d'« atterrissage » après un dash. */
  private dashEndSquashUntil = 0

  /**
   * Vrai dès que `hero-idle` est chargé — c'est le SEUL fichier requis. Une
   * image STATIQUE unique suffit : elle sert alors à tout (idle + course, dans
   * toutes les directions, juste retournée gauche/droite). Toutes les autres
   * feuilles (course directionnelle, visée, hurt) sont facultatives et se
   * greffent par-dessus en repli en cascade. Sans `hero-idle` : procédural.
   */
  private readonly useSheets: boolean
  /** Mode « feuille de rotation » : une feuille dont chaque frame = une direction. */
  private readonly useTurnSheet: boolean
  /** Nombre de frames (= directions) de la feuille de rotation. */
  private turnFrameCount = 0
  /** Angle de regard (rad, 0=Est) — suit le DÉPLACEMENT, conservé à l'arrêt. */
  private facingAngle = Math.PI / 2 // vers le bas au départ
  /** Dernier état d'animation joué (machine à états edge-triggered). */
  private animState = ''

  /** Vrai pendant les i-frames du dash. */
  public dashing = false

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture)
    scene.add.existing(this)

    // Bascule sur les spritesheets dès que `hero-idle` existe (une image
    // statique unique suffit). AVANT le corps physique : la hurtbox se centre
    // sur la frame courante.
    // Priorité au mode « feuille de rotation » (hero-turn) ; sinon feuilles
    // hero-* animées ; sinon rendu procédural.
    this.useTurnSheet = scene.textures.exists(HERO_TURN_SHEET)
    this.useSheets = !this.useTurnSheet && scene.textures.exists('hero-idle')
    if (this.useTurnSheet) {
      this.setTexture(HERO_TURN_SHEET, 0)
      // frameTotal inclut la frame « __BASE » → on la retire.
      this.turnFrameCount = Math.max(1, scene.textures.get(HERO_TURN_SHEET).frameTotal - 1)
    } else if (this.useSheets) {
      Player.ensureHeroAnims(scene)
      this.setTexture('hero-idle', 0)
    }

    scene.physics.add.existing(this)

    const body = this.arcadeBody
    body.setCollideWorldBounds(true) // filet : jamais hors de l'écran
    // HURTBOX : plus petite que le sprite, centrée (équitable pour le joueur).
    // En mode rotation le héros est agrandi → hurtbox un peu plus grande.
    if (this.useTurnSheet) body.setSize(26, 30, true)
    else body.setSize(18, 22)
    body.setDrag(FRICTION, FRICTION)

    if (this.useTurnSheet) this.setScale(HERO_TURN_SCALE)
    else if (this.useSheets) this.setAnim('hero-idle')

    // ZQSD (AZERTY) + WASD (QWERTY) + flèches, cumulables.
    const kb = scene.input.keyboard!
    const key = (code: string) => kb.addKey(code, true, false)
    this.keys = {
      up: [key('Z'), key('W'), key('UP')],
      down: [key('S'), key('DOWN')],
      left: [key('Q'), key('A'), key('LEFT')],
      right: [key('D'), key('RIGHT')],
      dash: [key('SHIFT'), key('SPACE')],
    }
  }

  private get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body
  }

  /* ────────────────── Animations (spritesheets hero-*) ────────────────── */

  /**
   * Déclare les animations du héros dans le gestionnaire GLOBAL (une seule
   * fois — partagées entre toutes les salles/scènes). Le nombre de frames
   * est lu depuis chaque feuille : l'artiste peut en livrer plus ou moins
   * sans toucher au code (cf. docs/ART_PROMPTS.md).
   */
  private static ensureHeroAnims(scene: Phaser.Scene): void {
    for (const { sheet, fps, loop } of HERO_ANIMS) {
      // Une feuille peut être absente (jeu d'assets partiel) : on ne crée que
      // les anims dont la texture existe.
      if (!scene.textures.exists(sheet) || scene.anims.exists(sheet)) continue
      scene.anims.create({
        key: sheet, // clé d'anim = clé de feuille (1 feuille = 1 état)
        frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: -1 }),
        frameRate: fps,
        repeat: loop ? -1 : 0,
      })
    }
  }

  /**
   * Change d'état d'animation (ne relance rien si l'état est inchangé). Une
   * anim absente est ignorée en silence → l'appelant retombe naturellement sur
   * l'état précédent (repli gracieux si une feuille manque).
   */
  private setAnim(state: string, force = false): void {
    if (!this.useSheets || !this.scene.anims.exists(state)) return
    if (this.animState === state && !force) return
    this.animState = state
    this.play(state)
  }

  /**
   * Machine à états d'animation ET application du MIROIR (`setFlipX`) — pilotée
   * chaque frame. Priorité : hurt > visée/tir > course DIRECTIONNELLE (8 dir.)
   * > idle. Le flip est décidé PAR ANIMATION : une feuille dédiée à une
   * direction (y compris Ouest/SO/NO) est jouée telle quelle (pas de miroir) ;
   * seules les feuilles de repli Est/générique/procédurale sont retournées
   * pour aller vers la gauche.
   */
  private updateAnim(now: number): void {
    if (!this.useSheets) {
      this.setFlipX(this.facingLeft) // rendu procédural : miroir cardinal
      return
    }
    if (now < this.hurtAnimUntil && this.scene.anims.exists('hero-hurt')) {
      this.setAnim('hero-hurt')
      this.setFlipX(this.facingLeft)
      return
    }
    if (now < this.aimUntil && this.scene.anims.exists('hero-aim')) {
      this.setAnim('hero-aim')
      this.setFlipX(this.facingLeft)
      return
    }
    if (this.arcadeBody.velocity.lengthSq() > 400) {
      const { key, flip } = this.runAnim()
      this.setAnim(key)
      this.setFlipX(flip)
    } else {
      this.setAnim('hero-idle')
      this.setFlipX(this.facingLeft) // à l'arrêt : garde la dernière orientation
    }
  }

  /**
   * Choisit la feuille de course (et le miroir) selon la direction 8 voies de
   * la VITESSE réelle, en cascade :
   *   1. feuille DÉDIÉE `hero-run-<dir>` (sans miroir) ;
   *   2. sinon Ouest/SO/NO ← Est/SE/NE en MIROIR ;
   *   3. sinon cardinale dominante (est/nord/sud ; Ouest = est miroir) ;
   *   4. sinon course générique `hero-run` ; enfin `hero-idle`.
   */
  private runAnim(): { key: string; flip: boolean } {
    const v = this.arcadeBody.velocity
    const oct = ((Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) % 8) + 8) % 8
    const dir = DIR8[oct]
    if (this.scene.anims.exists(`hero-run-${dir}`)) return { key: `hero-run-${dir}`, flip: false }
    const mir = MIRROR[dir]
    if (mir && this.scene.anims.exists(`hero-run-${mir}`)) {
      return { key: `hero-run-${mir}`, flip: true }
    }
    // Repli (est/générique/idle) : on suit l'orientation horizontale mémorisée
    // (`facingLeft`) — un héros STATIQUE ou une course générique gardent ainsi
    // leur sens même en déplacement vertical pur.
    if (Math.abs(v.x) >= Math.abs(v.y)) {
      return { key: this.firstAnim(['hero-run-est', 'hero-run']), flip: this.facingLeft }
    }
    const k = this.firstAnim([v.y < 0 ? 'hero-run-nord' : 'hero-run-sud', 'hero-run-est', 'hero-run'])
    // Feuilles Nord/Sud dédiées = pas de miroir ; tout autre repli = facingLeft.
    return { key: k, flip: k === 'hero-run-nord' || k === 'hero-run-sud' ? false : this.facingLeft }
  }

  /** Première anim EXISTANTE de la liste (repli sur l'idle si aucune). */
  private firstAnim(keys: string[]): string {
    return keys.find((k) => this.scene.anims.exists(k)) ?? 'hero-idle'
  }

  /** Aiguille le rendu selon le mode (rotation figée vs feuilles animées). */
  private renderSprite(now: number): void {
    if (this.useTurnSheet) {
      this.renderTurn()
    } else {
      this.animatePose(now)
      this.updateAnim(now)
    }
  }

  /**
   * Mode « feuille de rotation » : affiche UNE frame FIGÉE = la direction de
   * marche (aucune animation), à l'échelle agrandie. L'ordre des frames se
   * règle via {@link TURN_OFFSET} / {@link TURN_CLOCKWISE}.
   */
  private renderTurn(): void {
    this.setFrame(turnFrameForAngle(this.facingAngle, this.turnFrameCount, TURN_OFFSET, TURN_CLOCKWISE))
    this.setScale(HERO_TURN_SCALE)
    this.setFlipX(false) // chaque direction est déjà dessinée telle quelle
  }

  /** Progression du cooldown de dash, 0 (indispo) → 1 (prêt). Pour le HUD. */
  public dashCharge(): number {
    const now = this.scene.time.now
    if (now >= this.dashReadyAt) return 1
    const cd = runState.stats.dashCooldownMs
    return Phaser.Math.Clamp(1 - (this.dashReadyAt - now) / cd, 0, 1)
  }

  /** Invulnérable ? (dash OU i-frames post-coup). */
  public isInvulnerable(): boolean {
    return this.dashing || this.scene.time.now < this.hitInvulnUntil
  }

  /**
   * À appeler depuis Scene.update(). Lit les entrées et pilote le corps.
   * `ext` (optionnel) injecte les commandes TACTILES : `move` = direction du
   * joystick de déplacement (prioritaire sur le clavier), `faceX` = abscisse
   * vers laquelle orienter le sprite (visée tactile). Sans `ext`, comportement
   * clavier/souris inchangé (desktop).
   */
  public controlUpdate(ext?: { move?: { x: number; y: number } | null }): void {
    const now = this.scene.time.now
    const body = this.arcadeBody

    // ── Dash en cours : trajectoire figée, entrées ignorées — mais la pose
    //    (stretch directionnel), l'animation ET le miroir restent vivants
    //    (gérés dans updateAnim, appelé ci-dessous — chaque frame). ──
    if (now < this.dashEndsAt) {
      this.renderSprite(now)
      return
    }
    if (this.dashing) {
      this.dashing = false
      this.setAlpha(1)
      // « Atterrissage » du dash : brève compression (squash) au freinage.
      this.dashEndSquashUntil = now + DASH_END_SQUASH_MS
    }

    // ── Direction d'entrée (8 directions), normalisée. Le joystick tactile,
    //    s'il est poussé, prime sur le clavier. ──
    const dir = new Phaser.Math.Vector2(
      (this.anyDown(this.keys.right) ? 1 : 0) - (this.anyDown(this.keys.left) ? 1 : 0),
      (this.anyDown(this.keys.down) ? 1 : 0) - (this.anyDown(this.keys.up) ? 1 : 0),
    )
    if (ext?.move && (ext.move.x !== 0 || ext.move.y !== 0)) {
      dir.set(ext.move.x, ext.move.y)
    }
    if (dir.lengthSq() > 0) {
      dir.normalize()
      body.setAcceleration(dir.x * ACCEL, dir.y * ACCEL)
      this.lastMoveDir.copy(dir)
      this.facingAngle = Math.atan2(dir.y, dir.x) // regard = direction de marche
    } else {
      body.setAcceleration(0, 0) // les frottements (drag) freinent seuls
    }

    // Orientation cardinale : on n'actualise la dernière direction horizontale
    // QUE si le déplacement a une composante horizontale (gauche/droite ou
    // diagonale). Vertical pur (dir.x === 0) ou immobilité → inchangé.
    if (dir.x !== 0) this.facingLeft = dir.x < 0

    // Plafond de vitesse sur la NORME du vecteur (diagonales comprises).
    const cap = runState.stats.speed
    if (body.velocity.length() > cap) body.velocity.setLength(cap)

    // Rendu selon le mode : frame figée par direction (feuille de rotation)
    // OU squash/stretch + feuille directionnelle animée + miroir.
    this.renderSprite(now)

    // ── Dash (clavier) ──
    if (this.anyJustDown(this.keys.dash) && now >= this.dashReadyAt) {
      this.startDash(now)
    }
  }

  /**
   * Déclenche un dash à la demande (bouton tactile) : même cooldown/i-frames
   * que le dash clavier ; direction = entrées courantes, sinon dernière
   * direction (le joystick tactile maintient `lastMoveDir` à jour).
   */
  public requestDash(): void {
    const now = this.scene.time.now
    if (now < this.dashEndsAt || this.dashing) return
    if (now >= this.dashReadyAt) this.startDash(now)
  }

  /**
   * Recul visuel au tir — appelé par la scène à chaque volée : squash bref
   * (pose) + fenêtre d'anim de visée/tir, rejouée depuis sa 1re frame.
   */
  public recoil(): void {
    const now = this.scene.time.now
    this.recoilUntil = now + 90
    this.aimUntil = now + AIM_ANIM_MS
    // Chaque tir relance l'anim (frame de flash) — sauf si le hurt prime.
    if (now >= this.hurtAnimUntil) this.setAnim('hero-aim', true)
  }

  /**
   * Pose du sprite — couche de **squash & stretch** multiplicative (scale),
   * appliquée PAR-DESSUS la frame courante (procédurale ou spritesheet) :
   * respiration à l'arrêt, léger étirement en course, squash au tir,
   * **stretch directionnel pendant le dash** puis **compression
   * d'atterrissage** à sa fin, inclinaison dans les virages. Interpolé en
   * douceur — jamais de saut.
   */
  private animatePose(now: number): void {
    const body = this.arcadeBody
    const speed01 = Math.min(1, body.velocity.length() / runState.stats.speed)

    let tx = 1
    let ty = 1
    if (this.dashing) {
      // Stretch dans l'axe dominant du dash.
      const horizontal = Math.abs(body.velocity.x) >= Math.abs(body.velocity.y)
      tx = horizontal ? 1.22 : 0.85
      ty = horizontal ? 0.85 : 1.22
    } else if (now < this.dashEndSquashUntil) {
      tx = 1.16 // atterrissage : silhouette tassée au freinage
      ty = 0.86
    } else if (now < this.recoilUntil) {
      tx = 0.88 // squash de tir
      ty = 1.1
    } else if (speed01 < 0.05) {
      const breath = Math.sin(now / 420) * 0.03 // respiration au repos
      tx = 1 - breath * 0.35
      ty = 1 + breath
    } else {
      tx = 1 + speed01 * 0.06 // course : léger étirement
      ty = 1 - speed01 * 0.05
    }
    this.setScale(
      Phaser.Math.Linear(this.scaleX, tx, 0.25),
      Phaser.Math.Linear(this.scaleY, ty, 0.25),
    )
    // Inclinaison subtile dans le sens du déplacement horizontal.
    this.setRotation(Phaser.Math.Linear(this.rotation, body.velocity.x * 0.00035, 0.2))
  }

  /**
   * Reçoit des dégâts depuis (sourceX, sourceY).
   * Ignoré pendant les i-frames. Renvoie vrai si le joueur meurt (hp = 0).
   */
  public takeDamage(amount: number, sourceX: number, sourceY: number): boolean {
    if (this.isInvulnerable()) return false

    const now = this.scene.time.now
    const died = runState.damage(amount)
    this.hitInvulnUntil = now + HIT_INVULN_MS
    sound.playerHurt() // bruitage de dégâts subis
    this.emit('player-hurt') // la scène branche secousse + voile rouge dessus

    // Recul : repoussé à l'opposé de la source.
    const away = new Phaser.Math.Vector2(this.x - sourceX, this.y - sourceY)
    if (away.lengthSq() === 0) away.set(1, 0)
    away.normalize().scale(KNOCKBACK)
    this.arcadeBody.setVelocity(away.x, away.y)

    // Anim de dégâts (rejouée à chaque coup), puis flash BLANC d'impact :
    // la silhouette entière passe blanc pur un instant — lisibilité comic.
    this.hurtAnimUntil = now + HURT_ANIM_MS
    this.setAnim('hero-hurt', true)
    this.setTintFill(HIT_FLASH)
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.active) this.clearTint()
    })

    // Clignotement (alpha) pendant les i-frames.
    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(HIT_INVULN_MS / 180) - 1,
      onComplete: () => this.setAlpha(1),
    })

    return died
  }

  /** Dash dans la direction des entrées (sinon la dernière direction). */
  private startDash(now: number): void {
    const body = this.arcadeBody
    const dir = new Phaser.Math.Vector2(
      (this.anyDown(this.keys.right) ? 1 : 0) - (this.anyDown(this.keys.left) ? 1 : 0),
      (this.anyDown(this.keys.down) ? 1 : 0) - (this.anyDown(this.keys.up) ? 1 : 0),
    )
    if (dir.lengthSq() === 0) dir.copy(this.lastMoveDir)
    dir.normalize()

    body.setAcceleration(0, 0)
    body.setVelocity(dir.x * DASH_SPEED, dir.y * DASH_SPEED)
    this.dashEndsAt = now + DASH_MS
    this.dashReadyAt = now + runState.stats.dashCooldownMs
    this.dashing = true
    this.setAlpha(0.6) // repère visuel des i-frames
  }

  // ── Lecture d'entrées (plusieurs touches possibles par action) ──
  private anyDown(list: Phaser.Input.Keyboard.Key[]): boolean {
    return list.some((k) => k.isDown)
  }
  private anyJustDown(list: Phaser.Input.Keyboard.Key[]): boolean {
    return list.some((k) => Phaser.Input.Keyboard.JustDown(k))
  }
}
