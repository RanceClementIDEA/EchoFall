import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'
import type { EnemyShot } from './Shooter'

export type EchoConfig = EnemyBaseConfig & {
  /** Dégâts de contact UNE FOIS éveillé (l'Écho dort à 0). */
  awakeContactDamage: number
  /** Vitesse de repositionnement/kiting (px/s). */
  moveSpeed: number
  /** En deçà, il recule ; au-delà de `maxRange`, il se rapproche (px). */
  minRange: number
  maxRange: number
  /** Délai entre deux volées (ms). */
  fireCooldownMs: number
  projectileSpeed: number
  projectileDamage: number
  /** Vitesse de la ruée (écho du dash du joueur). */
  lungeSpeed: number
  lungeCooldownMs: number
}

/** Télégraphe du tir (immobile, gonfle) avant chaque volée. */
const FIRE_WINDUP_MS = 320
/** Télégraphe de la ruée : cloué + tremblement avant de foncer. */
const LUNGE_WINDUP_MS = 340
/** Durée de la ruée elle-même (trajectoire figée). */
const LUNGE_MS = 220

/**
 * Echo — le **revenant** (GDD §5.3) : le fantôme d'une de vos morts, tombé à
 * cet endroit exact, qui « porte votre équipement ». Il combat comme VOUS —
 * tir visé télégraphié (kiting à distance) ET **ruée** brutale, écho de votre
 * dash — calibré sur la force du plongeur tombé (cf. `core/echoes`).
 *
 * Deux vies :
 *  • **En sommeil** (`dormant`) à l'apparition : inoffensif (contact 0), figé
 *    sur son sigil. Le joueur choisit — s'en approcher pour **se recueillir**
 *    (géré par la scène) ou le **provoquer** en tirant.
 *  • **Éveillé** ({@link awaken}) : hostile, il vous traque. On l'éveille en le
 *    touchant (premier tir) ou via la scène (tirer près de lui). L'événement
 *    `echo-awakened` permet à la scène d'ouvrir la barre de vie et d'annoncer.
 *
 * Comme le Cracheur, il n'accède pas au pool de projectiles : il émet
 * `enemy-fire` (même payload {@link EnemyShot}) et la scène crée le tir.
 */
export class Echo extends EnemyBase {
  /** En sommeil : ni mouvement, ni tir, ni dégât de contact tant que non provoqué. */
  public dormant = true

  private readonly awakeContactDamage: number
  private readonly moveSpeed: number
  private readonly minRange: number
  private readonly maxRange: number
  private readonly fireCooldownMs: number
  private readonly projectileSpeed: number
  private readonly projectileDamage: number
  private readonly lungeSpeed: number
  private readonly lungeCooldownMs: number

  private nextFireAt = 0
  private fireWindupUntil = 0
  private nextLungeAt = 0
  private lungeWindupUntil = 0
  private lungeUntil = 0

  constructor(scene: Phaser.Scene, cfg: EchoConfig) {
    super(scene, cfg) // contactDamage part à 0 (cfg.contactDamage) : en sommeil
    this.awakeContactDamage = cfg.awakeContactDamage
    this.moveSpeed = cfg.moveSpeed
    this.minRange = cfg.minRange
    this.maxRange = cfg.maxRange
    this.fireCooldownMs = cfg.fireCooldownMs
    this.projectileSpeed = cfg.projectileSpeed
    this.projectileDamage = cfg.projectileDamage
    this.lungeSpeed = cfg.lungeSpeed
    this.lungeCooldownMs = cfg.lungeCooldownMs

    // Aspect spectral : translucide, il flotte (le wobble d'EnemyBase donne la
    // respiration). Le voile blafard le distingue nettement des ennemis vifs.
    this.setAlpha(0.82)
  }

  /** Éveille le revenant (idempotent). Émet `echo-awakened` pour la scène. */
  awaken(): void {
    if (!this.dormant || !this.active) return
    this.dormant = false
    this.contactDamage = this.awakeContactDamage // devient menaçant au contact
    this.setAlpha(0.95)
    const now = this.scene.time.now
    this.nextFireAt = now + 420 // court répit avant la première volée
    this.nextLungeAt = now + this.lungeCooldownMs
    this.emit('echo-awakened', this)
  }

  /**
   * Le premier coup PROVOQUE l'Écho (le tirer dessus, c'est le réveiller) —
   * puis les dégâts s'appliquent normalement (feedback + PV via EnemyBase).
   */
  public override takeDamage(amount: number, sourceX?: number, sourceY?: number): void {
    if (this.dormant) this.awaken()
    super.takeDamage(amount, sourceX, sourceY)
  }

  protected engage(dist: number): void {
    if (this.dormant) {
      this.stopMoving() // en sommeil : figé sur son sigil
      return
    }
    const now = this.scene.time.now

    // ── Ruée en cours : trajectoire figée (vélocité déjà posée). ──
    if (now < this.lungeUntil) return

    // ── Télégraphe de ruée : cloué un instant, puis il fonce. ──
    if (this.lungeWindupUntil > 0) {
      this.stopMoving()
      if (now >= this.lungeWindupUntil) {
        this.lungeWindupUntil = 0
        this.launchLunge(now)
      }
      return
    }

    // ── Gonflement de tir : cloué, crache la volée à la fin. ──
    if (this.fireWindupUntil > 0) {
      this.stopMoving()
      if (now >= this.fireWindupUntil) {
        this.fireWindupUntil = 0
        this.spit()
      }
      return
    }

    // ── Déclenche une ruée de temps en temps (écho du dash), télégraphiée. ──
    if (now >= this.nextLungeAt && dist < this.maxRange * 1.4) {
      this.nextLungeAt = now + this.lungeCooldownMs
      this.lungeWindupUntil = now + LUNGE_WINDUP_MS
      this.playAct(LUNGE_WINDUP_MS + LUNGE_MS)
      return
    }

    // ── Kiting : tenir la fourchette [minRange, maxRange] (comme le Cracheur). ──
    if (dist < this.minRange) this.moveAwayFrom(this.target.x, this.target.y, this.moveSpeed)
    else if (dist > this.maxRange) this.moveToward(this.target.x, this.target.y, this.moveSpeed)
    else this.stopMoving()

    // ── Cadence : le cooldown écoulé ouvre le télégraphe de tir. ──
    if (now >= this.nextFireAt) {
      this.nextFireAt = now + this.fireCooldownMs
      this.fireWindupUntil = now + FIRE_WINDUP_MS
      this.playAct(FIRE_WINDUP_MS + 140)
    }
  }

  /** Fonce vers la position ACTUELLE du joueur (vélocité figée le temps de LUNGE_MS). */
  private launchLunge(now: number): void {
    const dir = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y)
    if (dir.lengthSq() === 0) dir.set(1, 0)
    dir.normalize().scale(this.lungeSpeed)
    this.arcadeBody.setVelocity(dir.x, dir.y)
    this.lungeUntil = now + LUNGE_MS
  }

  /** Crache une volée visée sur la position actuelle du joueur (émet `enemy-fire`). */
  private spit(): void {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y)
    const shot: EnemyShot = {
      x: this.x,
      y: this.y,
      angle,
      speed: this.projectileSpeed,
      damage: this.projectileDamage,
    }
    this.emit('enemy-fire', shot)
  }
}
