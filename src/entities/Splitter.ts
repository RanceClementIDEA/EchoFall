import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'

export type SplitterConfig = EnemyBaseConfig & {
  /** Vitesse de poursuite (px/s). */
  chaseSpeed: number
  /** Rejeton issu d'une scission ? (plus petit, plus vif, ne se scinde plus.) */
  mini?: boolean
}

/**
 * Splitter (« le Gélif ») — masse gélatineuse lente qui poursuit le joueur…
 * et se **SCINDE en deux rejetons** à sa mort (plus petits, plus rapides,
 * 1 PV, qui eux ne se scindent plus). Tuer un Gélif au contact d'autres
 * ennemis crée donc un sursaut de pression : mieux vaut l'isoler.
 *
 * La scission elle-même est orchestrée par la scène (écoute `enemy-died` et
 * vérifie {@link canSplit}) : l'entité ne sait pas fabriquer ses rejetons —
 * même découplage que le loot.
 */
export class Splitter extends EnemyBase {
  private readonly chaseSpeed: number
  /** Vrai pour un rejeton (issu d'une scission). */
  public readonly mini: boolean

  constructor(scene: Phaser.Scene, cfg: SplitterConfig) {
    super(scene, cfg)
    this.chaseSpeed = cfg.chaseSpeed
    this.mini = cfg.mini ?? false
    if (this.mini) {
      // Rejeton : plus petit. Le wobble d'EnemyBase réécrit l'échelle chaque
      // frame en MULTIPLIANT `poseScale` — c'est donc lui qu'on réduit (et on
      // pose l'échelle de départ pour la première seconde d'apparition).
      this.poseScale = 0.62
      this.setScale(0.62)
    }
  }

  /** Ce Gélif produira-t-il des rejetons à sa mort ? */
  get canSplit(): boolean {
    return !this.mini
  }

  protected engage(): void {
    // Poursuite directe, pesante — la menace vient du NOMBRE après scission.
    this.moveToward(this.target.x, this.target.y, this.chaseSpeed)
  }
}
