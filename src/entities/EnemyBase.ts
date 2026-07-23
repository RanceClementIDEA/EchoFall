import Phaser from 'phaser'
import type { Player } from './Player'

/** État comportemental commun : patrouille, ou engagé (joueur détecté). */
export type EnemyState = 'patrol' | 'engaged'

/** Configuration partagée par tous les ennemis. */
export interface EnemyBaseConfig {
  x: number
  y: number
  /** Cible à traquer. */
  target: Player
  /** Points de vie de départ (= max). */
  hp: number
  /** Dégâts infligés au joueur par contact. */
  contactDamage: number
  /** Points de patrouille (aller-retour A ↔ B). */
  patrolA: { x: number; y: number }
  patrolB: { x: number; y: number }
  patrolSpeed: number
  /** Distance de détection du joueur (px) → passe en « engaged ». */
  detectRadius: number
  /** Distance de décrochage (px) → retour en patrouille (doit être > detect). */
  loseRadius: number
  texture: string
  /** Couleur dominante (pour teinter les éclats à la mort). */
  color: number
  /** Gardien de strate ? (barre de vie dédiée, victoire à sa mort) */
  isBoss?: boolean
  /**
   * Spritesheets optionnelles { idle, act } (cf. docs/ART_PROMPTS.md) :
   * `idle` = patrouille/déplacement, `act` = action signature (charge du
   * Traqueur, gonfle-et-crache du Cracheur). L'ennemi ne bascule dessus que
   * si les DEUX feuilles sont chargées — sinon texture procédurale.
   */
  sheets?: { idle: string; act: string }
}

const ARRIVE_DIST = 8 // distance à laquelle un point de patrouille est « atteint »
const FLASH_MS = 90 // durée du flash rouge à l'impact
const KB_NUDGE_PX = 5 // amplitude du recul visuel à l'impact (px)
const KB_ANGLE_DEG = 8 // jolt d'inclinaison du recul visuel (degrés)
const KB_MS = 70 // durée aller du recul visuel (yoyo → ~140 ms total)
/** Taille de référence de la hitbox (frame procédurale 24×24) : conservée
 *  à l'identique quand on passe aux feuilles 32×32 (équité gameplay). */
const HITBOX_REF = 24

/**
 * Réglages des animations des feuilles ennemies (clé = feuille chargée par
 * BootScene). Une feuille absente du registre reçoit le fallback 10 fps/boucle.
 */
const FOE_ANIMS: Record<string, { fps: number; loop: boolean }> = {
  'foe-charger-idle': { fps: 8, loop: true },
  'foe-charger-rush': { fps: 14, loop: true },
  'foe-shooter-idle': { fps: 8, loop: true },
  'foe-shooter-fire': { fps: 12, loop: false }, // crachat calé ~frame 5
  'foe-orbiter-idle': { fps: 10, loop: true },
  'foe-orbiter-dash': { fps: 16, loop: true },
  'foe-splitter-idle': { fps: 7, loop: true },
  'foe-splitter-move': { fps: 10, loop: true },
  'foe-bomber-idle': { fps: 8, loop: true },
  'foe-bomber-fuse': { fps: 14, loop: true }, // clignote toute la mèche
  'foe-sentinel-idle': { fps: 6, loop: true },
  'foe-sentinel-burst': { fps: 12, loop: false },
  'foe-boss-gardien-idle': { fps: 8, loop: true },
  'foe-boss-gardien-act': { fps: 14, loop: true },
  'foe-boss-alpha-idle': { fps: 8, loop: true },
  'foe-boss-alpha-act': { fps: 12, loop: true },
  'foe-boss-avatar-idle': { fps: 8, loop: true },
  'foe-boss-avatar-act': { fps: 12, loop: true },
  'echo-idle': { fps: 8, loop: true },
  'echo-act': { fps: 12, loop: true },
}

/**
 * EnemyBase — classe ABSTRAITE de tous les ennemis (vue de dessus, arcade).
 *
 * Elle mutualise ce qui est commun à tous les types :
 *   • le **système de points de vie** (hp/maxHp, `takeDamage`, mort, feedback
 *     visuel : flash à l'impact, **recul visuel** — la silhouette est
 *     projetée à l'opposé du coup puis revient élastiquement, SANS déplacer
 *     le corps physique —, teinte rouge croissante à mesure que les PV
 *     baissent, émission de `enemy-died`) ;
 *   • la **détection du joueur** et la bascule patrouille ↔ engagé ;
 *   • la **patrouille** entre deux points et les aides de déplacement ;
 *   • le **rendu par spritesheets** optionnel (`cfg.sheets`, deux états
 *     `idle`/`act`) avec fallback procédural, plus une couche de pose
 *     (`poseScale`) que les sous-classes peuvent animer (gonflement…).
 *
 * Le comportement une fois le joueur détecté est laissé aux sous-classes via
 * la méthode abstraite {@link engage}. Ajouter un type d'ennemi = étendre
 * cette classe et implémenter `engage()` — sans toucher au reste.
 */
export abstract class EnemyBase extends Phaser.Physics.Arcade.Sprite {
  /**
   * Dégâts de contact COURANTS. Mutable : la plupart des ennemis le fixent une
   * fois, mais un Écho en sommeil est inoffensif (0) tant qu'il n'est pas
   * provoqué. La scène lit cette valeur À CHAUD à chaque contact — un ennemi à
   * 0 ne blesse pas (cf. l'overlap joueur ↔ ennemis).
   */
  public contactDamage: number
  public readonly isBoss: boolean
  /** Couleur dominante (éclats de mort). */
  public readonly color: number
  public hp: number
  public readonly maxHp: number
  public state: EnemyState = 'patrol'

  /** Cible (accessible aux sous-classes pour viser / poursuivre). */
  protected readonly target: Player

  private readonly detectRadius: number
  private readonly loseRadius: number
  private readonly patrolSpeed: number
  private readonly patrolA: { x: number; y: number }
  private readonly patrolB: { x: number; y: number }
  private waypoint: { x: number; y: number }
  /** Déphasage du wobble (stable par position d'apparition). */
  private readonly wobblePhase: number
  /** Le wobble n'écrase pas le tween d'apparition (scale-in du Spawner). */
  private wobbleAfter = 0

  /** Feuilles { idle, act } si fournies ET chargées (sinon procédural). */
  private readonly sheets?: { idle: string; act: string }
  /** Vrai quand le rendu passe par les spritesheets. */
  protected readonly useSheets: boolean
  /** Clé d'anim en cours (machine à états edge-triggered). */
  private animKey = ''
  /** Fenêtre pendant laquelle l'anim `act` prime (ouverte par `playAct`). */
  protected actUntil = 0
  /**
   * Couche de pose multiplicative appliquée par le wobble : les sous-classes
   * la tweenent pour « gonfler » (Cracheur) sans se battre avec le wobble.
   */
  protected poseScale = 1
  /** Tween de recul visuel en cours (tué avant d'en rejouer un). */
  private kbTween?: Phaser.Tweens.Tween

  constructor(scene: Phaser.Scene, cfg: EnemyBaseConfig) {
    super(scene, cfg.x, cfg.y, cfg.texture)
    this.target = cfg.target
    this.hp = cfg.hp
    this.maxHp = cfg.hp
    this.contactDamage = cfg.contactDamage
    this.isBoss = cfg.isBoss ?? false
    this.color = cfg.color
    this.detectRadius = cfg.detectRadius
    this.loseRadius = cfg.loseRadius
    this.patrolSpeed = cfg.patrolSpeed
    this.patrolA = cfg.patrolA
    this.patrolB = cfg.patrolB
    this.waypoint = cfg.patrolA
    this.wobblePhase = (cfg.x * 7 + cfg.y * 13) % 1000
    this.wobbleAfter = scene.time.now + 260

    // Bascule sur les spritesheets si la paire idle/act est chargée —
    // AVANT le corps physique, pour que la hitbox se centre sur la frame.
    this.sheets = cfg.sheets
    this.useSheets =
      !!cfg.sheets &&
      scene.textures.exists(cfg.sheets.idle) &&
      scene.textures.exists(cfg.sheets.act)
    if (this.useSheets) {
      EnemyBase.ensureFoeAnims(scene, [this.sheets!.idle, this.sheets!.act])
      this.setTexture(this.sheets!.idle, 0)
    }

    scene.add.existing(this)
    scene.physics.add.existing(this)
    const body = this.body as Phaser.Physics.Arcade.Body
    // Hitbox un peu plus petite que le sprite — et IDENTIQUE avec ou sans
    // feuilles (référence 24 px pour les frames 32×32 : équité gameplay).
    // Un BOSS habillé de feuilles garde une hitbox à l'échelle de sa stature
    // (sinon la référence 24 px le rendrait presque intouchable).
    const ref = this.useSheets ? (this.isBoss ? 42 : HITBOX_REF) : this.width
    body.setSize(ref * 0.8, ref * 0.8)
    body.setCollideWorldBounds(true)

    if (this.useSheets) this.setFoeAnim('idle')
  }

  /** Appelée chaque frame par le groupe (`runChildUpdate: true`). */
  update(): void {
    if (!this.active) return
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y)

    // Bascule d'état selon la distance au joueur.
    if (this.state === 'patrol' && dist < this.detectRadius) {
      this.state = 'engaged'
    } else if (this.state === 'engaged' && dist > this.loseRadius) {
      this.state = 'patrol'
      this.waypoint = this.nearestWaypoint()
    }

    if (this.state === 'engaged') this.engage(dist)
    else this.patrol()

    // ── MIROIR HORIZONTAL (convention du projet, partagée par TOUS les
    //    ennemis) — appelé À CHAQUE FRAME : une SEULE spritesheet de
    //    déplacement (dessinée vers la DROITE) est rejouée dans toutes les
    //    directions et retournée ici selon le SIGNE de la vitesse horizontale
    //    (vrai = va vers la GAUCHE). Étant dans la classe de base, tout
    //    NOUVEAU type d'ennemi en hérite automatiquement — ne pas surcharger
    //    update() sans conserver cet appel. ──
    this.setFlipX(this.arcadeBody.velocity.x < 0)

    const now = this.scene.time.now

    // Machine à états d'animation : la fenêtre `act` (charge, gonflement)
    // prime ; sinon l'état comportemental décide via `engagedAnimKind`.
    this.setFoeAnim(
      now < this.actUntil ? 'act' : this.state === 'engaged' ? this.engagedAnimKind() : 'idle',
    )

    // Wobble de déplacement (respiration/marche) — après l'anim d'apparition.
    // `poseScale` s'y multiplie : la couche de pose (gonflement du Cracheur)
    // cohabite avec le wobble au lieu d'être écrasée par lui.
    if (now >= this.wobbleAfter) {
      const moving = this.arcadeBody.velocity.lengthSq() > 100
      const amp = moving ? 0.05 : 0.025
      const w = Math.sin((now + this.wobblePhase) / (moving ? 110 : 300)) * amp
      this.setScale((1 - w * 0.6) * this.poseScale, (1 + w) * this.poseScale)
    }
  }

  /** Comportement propre au type quand le joueur est détecté (à implémenter). */
  protected abstract engage(distanceToPlayer: number): void

  /* ────────────────── Animations (spritesheets foe-*) ────────────────── */

  /**
   * Anim à jouer quand l'ennemi est engagé (hors fenêtre `act`) : la charge
   * pour un fonceur (défaut), la marche pour un ennemi qui télégraphie son
   * action via {@link playAct} (le Cracheur la surcharge en 'idle').
   */
  protected engagedAnimKind(): 'idle' | 'act' {
    return 'act'
  }

  /** Ouvre une fenêtre `act` (rejouée depuis la frame 1) de `ms` millisecondes. */
  protected playAct(ms: number): void {
    this.actUntil = this.scene.time.now + ms
    this.setFoeAnim('act', true)
  }

  /** Change d'anim (edge-triggered : ne relance rien si inchangée). */
  private setFoeAnim(kind: 'idle' | 'act', force = false): void {
    if (!this.useSheets) return
    const key = kind === 'act' ? this.sheets!.act : this.sheets!.idle
    if (this.animKey === key && !force) return
    this.animKey = key
    this.play(key)
  }

  /**
   * Déclare les animations ennemies dans le gestionnaire GLOBAL (une fois
   * par feuille — partagées entre salles). Le nombre de frames est lu depuis
   * la feuille : l'artiste peut en livrer plus sans toucher au code.
   */
  private static ensureFoeAnims(scene: Phaser.Scene, sheetKeys: string[]): void {
    for (const key of sheetKeys) {
      if (scene.anims.exists(key)) continue
      const { fps, loop } = FOE_ANIMS[key] ?? { fps: 10, loop: true }
      scene.anims.create({
        key, // clé d'anim = clé de feuille (1 feuille = 1 état)
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: -1 }),
        frameRate: fps,
        repeat: loop ? -1 : 0,
      })
    }
  }

  /* ────────────────── Système de points de vie (commun) ────────────────── */

  /**
   * Encaisse des dégâts (projectile du joueur, onde d'objet actif…).
   * `sourceX/Y` (optionnels) orientent le recul visuel — à défaut, l'impact
   * est supposé venir du joueur. Meurt à 0 PV.
   */
  public takeDamage(amount: number, sourceX?: number, sourceY?: number): void {
    if (!this.active) return
    this.hp -= amount

    // ── Recul visuel (knockback « dessiné ») : la silhouette est projetée
    // à l'opposé de l'impact (origine d'affichage + jolt d'inclinaison) puis
    // revient élastiquement. Le CORPS PHYSIQUE ne bouge pas d'un pixel :
    // effet pur rendu, aucune incidence sur les trajectoires. ──
    const away = new Phaser.Math.Vector2(
      this.x - (sourceX ?? this.target.x),
      this.y - (sourceY ?? this.target.y),
    )
    if (away.lengthSq() === 0) away.set(1, 0)
    away.normalize().scale(KB_NUDGE_PX)
    const ox = this.width / 2
    const oy = this.height / 2
    this.kbTween?.remove() // coups rapprochés : on repart d'une pose nette
    this.setDisplayOrigin(ox, oy)
    this.setAngle(0)
    this.kbTween = this.scene.tweens.add({
      targets: this,
      // L'origine augmente à l'opposé du recul → le sprite glisse AVEC lui.
      displayOriginX: ox - away.x,
      displayOriginY: oy - away.y,
      angle: away.x >= 0 ? -KB_ANGLE_DEG : KB_ANGLE_DEG,
      duration: KB_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!this.active) return
        this.setDisplayOrigin(ox, oy)
        this.setAngle(0)
      },
    })

    this.setTintFill(0xff5555) // flash rouge : dégâts encaissés
    this.scene.time.delayedCall(FLASH_MS, () => {
      if (!this.active) return
      const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1)
      if (ratio < 1) {
        // Rougit progressivement à mesure que les PV baissent (indicateur de PV).
        const c = Math.round(255 * ratio)
        this.setTint(Phaser.Display.Color.GetColor(255, c, c))
      } else {
        this.clearTint()
      }
    })

    if (this.hp <= 0) this.die()
  }

  private die(): void {
    // Désactivé AVANT l'émission : les écouteurs qui comptent les ennemis
    // restants (déverrouillage des portes) ne doivent plus nous compter.
    this.kbTween?.remove() // pas de tween orphelin sur un sprite détruit
    this.setActive(false)
    this.emit('enemy-died', this) // la scène gère loot + déverrouillage
    this.destroy()
  }

  /* ────────────────── Aides de déplacement (pour les sous-classes) ──────── */

  protected get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body
  }

  /** Dirige la vélocité vers (x, y) à la vitesse donnée. */
  protected moveToward(x: number, y: number, speed: number): void {
    const dir = new Phaser.Math.Vector2(x - this.x, y - this.y)
    if (dir.lengthSq() < 1) {
      this.stopMoving()
      return
    }
    dir.normalize().scale(speed)
    this.arcadeBody.setVelocity(dir.x, dir.y)
  }

  /** Fuit le point (x, y) (direction opposée). */
  protected moveAwayFrom(x: number, y: number, speed: number): void {
    this.moveToward(2 * this.x - x, 2 * this.y - y, speed)
  }

  protected stopMoving(): void {
    this.arcadeBody.setVelocity(0, 0)
  }

  private patrol(): void {
    if (
      Phaser.Math.Distance.Between(this.x, this.y, this.waypoint.x, this.waypoint.y) < ARRIVE_DIST
    ) {
      this.waypoint = this.waypoint === this.patrolA ? this.patrolB : this.patrolA
    }
    this.moveToward(this.waypoint.x, this.waypoint.y, this.patrolSpeed)
  }

  private nearestWaypoint(): { x: number; y: number } {
    const dA = Phaser.Math.Distance.Between(this.x, this.y, this.patrolA.x, this.patrolA.y)
    const dB = Phaser.Math.Distance.Between(this.x, this.y, this.patrolB.x, this.patrolB.y)
    return dA <= dB ? this.patrolA : this.patrolB
  }
}
