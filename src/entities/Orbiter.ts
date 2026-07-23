import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'

export type OrbiterConfig = EnemyBaseConfig & {
  /** Rayon d'orbite autour du joueur (px). */
  orbitRadius: number
  /** Vitesse tangentielle sur l'orbite (px/s). */
  orbitSpeed: number
  /** Vitesse de la ruée à travers le joueur (px/s). */
  dashSpeed: number
  /** Délai entre deux ruées (ms). */
  dashCooldownMs: number
}

/** Télégraphe avant la ruée : cloué + anim `act` (lisible, esquivable). */
const DASH_WINDUP_MS = 320
/** Durée de la ruée (trajectoire figée). */
const DASH_MS = 260

/**
 * Orbiter (« le Rôdeur ») — harceleur mobile. Une fois le joueur détecté, il
 * TOURNE autour de lui à distance constante (orbite tangentielle + rappel
 * élastique vers l'anneau), puis, à intervalle régulier, se fige un instant
 * (télégraphe) et **fond droit à travers le joueur**. Il force à rester en
 * mouvement sans jamais foncer bêtement — le contrepoint du Charger.
 *
 * Le sens d'orbite est stable par individu (dérivé de sa position d'apparition)
 * → deux Rôdeurs peuvent tourner en sens inverse, encerclement naturel.
 */
export class Orbiter extends EnemyBase {
  private readonly orbitRadius: number
  private readonly orbitSpeed: number
  private readonly dashSpeed: number
  private readonly dashCooldownMs: number
  /** +1 = horaire, −1 = anti-horaire (stable par position d'apparition). */
  private readonly orbitDir: 1 | -1

  private nextDashAt: number
  private windupUntil = 0
  private dashUntil = 0

  constructor(scene: Phaser.Scene, cfg: OrbiterConfig) {
    super(scene, cfg)
    this.orbitRadius = cfg.orbitRadius
    this.orbitSpeed = cfg.orbitSpeed
    this.dashSpeed = cfg.dashSpeed
    this.dashCooldownMs = cfg.dashCooldownMs
    this.orbitDir = (Math.round(cfg.x + cfg.y) & 1) === 0 ? 1 : -1
    // Première ruée différée : le joueur voit d'abord l'orbite.
    this.nextDashAt = scene.time.now + cfg.dashCooldownMs
  }

  protected engage(dist: number): void {
    const now = this.scene.time.now

    // ── Ruée en cours : trajectoire figée. ──
    if (now < this.dashUntil) return

    // ── Télégraphe : cloué, puis il fond sur la position ACTUELLE du joueur. ──
    if (this.windupUntil > 0) {
      this.stopMoving()
      if (now >= this.windupUntil) {
        this.windupUntil = 0
        const dir = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y)
        if (dir.lengthSq() === 0) dir.set(1, 0)
        dir.normalize().scale(this.dashSpeed)
        this.arcadeBody.setVelocity(dir.x, dir.y)
        this.dashUntil = now + DASH_MS
      }
      return
    }

    // ── Déclenche une ruée quand le cooldown est écoulé (à portée d'orbite). ──
    if (now >= this.nextDashAt && dist < this.orbitRadius * 1.8) {
      this.nextDashAt = now + this.dashCooldownMs
      this.windupUntil = now + DASH_WINDUP_MS
      this.playAct(DASH_WINDUP_MS + DASH_MS)
      return
    }

    // ── Orbite : composante tangentielle + rappel élastique vers l'anneau. ──
    const toSelf = new Phaser.Math.Vector2(this.x - this.target.x, this.y - this.target.y)
    if (toSelf.lengthSq() === 0) toSelf.set(1, 0)
    const tangent = new Phaser.Math.Vector2(-toSelf.y, toSelf.x).normalize().scale(this.orbitDir)
    // Rappel vers le rayon cible : positif = trop loin (rentre), négatif = sort.
    const pull = Phaser.Math.Clamp((dist - this.orbitRadius) / this.orbitRadius, -1, 1)
    const radial = toSelf.clone().normalize().scale(-pull)
    const dir = tangent.add(radial).normalize().scale(this.orbitSpeed)
    this.arcadeBody.setVelocity(dir.x, dir.y)
  }
}
