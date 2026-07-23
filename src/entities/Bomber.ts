import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'

export type BomberConfig = EnemyBaseConfig & {
  /** Vitesse d'approche (px/s). */
  chaseSpeed: number
  /** Distance au joueur qui AMORCE la charge (px). */
  triggerRadius: number
  /** Durée de la mèche entre l'amorçage et l'explosion (ms). */
  fuseMs: number
  /** Rayon de l'explosion (px). */
  blastRadius: number
  /** Dégâts infligés au joueur s'il est dans le rayon. */
  blastDamage: number
}

/** Payload de l'événement `bomber-explode` (la scène applique dégâts + FX). */
export interface BomberBlast {
  x: number
  y: number
  radius: number
  damage: number
}

/**
 * Bomber (« le Sapeur ») — kamikaze télégraphié. Il avance vers le joueur ;
 * arrivé à portée, il **s'amorce** : cloué sur place, il enfle et clignote
 * pendant toute la mèche… puis **explose** (zone de dégâts). L'esquive est
 * toujours possible — la mèche est longue et le Sapeur immobile.
 *
 * L'abattre AVANT la fin de la mèche le neutralise proprement (mort normale,
 * pas d'explosion). L'explosion émet `bomber-explode` : la scène applique les
 * dégâts de zone et les effets — l'entité ne touche jamais le joueur elle-même.
 */
export class Bomber extends EnemyBase {
  private readonly chaseSpeed: number
  private readonly triggerRadius: number
  private readonly fuseMs: number
  private readonly blastRadius: number
  private readonly blastDamage: number

  /** Instant de l'explosion (0 = pas encore amorcé). */
  private detonateAt = 0
  /** Tween de clignotement de la mèche (tué à la mort). */
  private fuseTween?: Phaser.Tweens.Tween

  constructor(scene: Phaser.Scene, cfg: BomberConfig) {
    super(scene, cfg)
    this.chaseSpeed = cfg.chaseSpeed
    this.triggerRadius = cfg.triggerRadius
    this.fuseMs = cfg.fuseMs
    this.blastRadius = cfg.blastRadius
    this.blastDamage = cfg.blastDamage
    // Un tween de mèche encore vivant serait orphelin après destruction.
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.fuseTween?.remove())
  }

  protected engage(dist: number): void {
    const now = this.scene.time.now

    // ── Mèche allumée : cloué, ça clignote… puis BOUM. ──
    if (this.detonateAt > 0) {
      this.stopMoving()
      if (now >= this.detonateAt) this.explode()
      return
    }

    // ── Approche directe ; à portée, on s'amorce (télégraphe long). ──
    if (dist > this.triggerRadius) {
      this.moveToward(this.target.x, this.target.y, this.chaseSpeed)
      return
    }
    this.detonateAt = now + this.fuseMs
    this.stopMoving()
    this.playAct(this.fuseMs)
    // Clignotement d'alerte (alpha) + gonflement (poseScale, compatible wobble).
    this.fuseTween = this.scene.tweens.add({
      targets: this,
      alpha: { from: 1, to: 0.35 },
      poseScale: 1.3,
      duration: 130,
      yoyo: true,
      repeat: Math.max(0, Math.floor(this.fuseMs / 260) - 1),
    })
  }

  /** Fin de mèche : émet la déflagration puis meurt (mort SANS re-explosion). */
  private explode(): void {
    if (!this.active) return
    const blast: BomberBlast = {
      x: this.x,
      y: this.y,
      radius: this.blastRadius,
      damage: this.blastDamage,
    }
    // Émis AVANT la mort (destroy retire les écouteurs) ; `this` en second
    // argument pour que la scène exclue le Sapeur de sa propre déflagration.
    this.emit('bomber-explode', blast, this)
    this.takeDamage(this.hp + 999) // se détruit par le circuit de mort commun
  }
}
