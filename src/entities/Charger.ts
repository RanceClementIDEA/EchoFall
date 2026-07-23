import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'

export type ChargerConfig = EnemyBaseConfig & {
  /** Vitesse à laquelle il fonce sur le joueur (px/s). */
  chargeSpeed: number
}

/**
 * Charger — ennemi de mêlée. Patrouille jusqu'à repérer le joueur, puis
 * **fonce droit sur lui** ; le contact inflige `contactDamage`.
 * PV et détection sont hérités d'EnemyBase.
 */
export class Charger extends EnemyBase {
  private readonly chargeSpeed: number

  constructor(scene: Phaser.Scene, cfg: ChargerConfig) {
    super(scene, cfg)
    this.chargeSpeed = cfg.chargeSpeed
  }

  protected engage(): void {
    // Ligne droite vers le joueur, en continu.
    this.moveToward(this.target.x, this.target.y, this.chargeSpeed)
  }
}
