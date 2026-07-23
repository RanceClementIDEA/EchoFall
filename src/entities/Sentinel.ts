import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'
import type { EnemyShot } from './Shooter'

export type SentinelConfig = EnemyBaseConfig & {
  /** Nombre de projectiles par salve radiale. */
  burstCount: number
  /** Délai entre deux salves (ms). */
  burstCooldownMs: number
  projectileSpeed: number
  projectileDamage: number
}

/** Télégraphe (gonflement) avant chaque salve radiale. */
const WINDUP_MS = 420

/**
 * Sentinel (« la Sentinelle ») — tourelle vivante IMMOBILE. Elle n'approche
 * jamais : à intervalle régulier, elle enfle (télégraphe) puis crache une
 * **salve RADIALE** de projectiles tout autour d'elle — l'éventail pivote d'une
 * demi-dent à chaque salve pour balayer les couloirs sûrs. Elle transforme la
 * salle en champ de balles : une cible prioritaire qu'il faut aller chercher.
 *
 * Comme le Cracheur, elle émet `enemy-fire` (un événement PAR projectile) et
 * laisse la scène fabriquer les tirs.
 */
export class Sentinel extends EnemyBase {
  private readonly burstCount: number
  private readonly burstCooldownMs: number
  private readonly projectileSpeed: number
  private readonly projectileDamage: number

  private nextBurstAt: number
  private windupUntil = 0
  /** Pivot de l'éventail (alterne d'une demi-dent à chaque salve). */
  private burstPhase = 0

  constructor(scene: Phaser.Scene, cfg: SentinelConfig) {
    super(scene, cfg)
    this.burstCount = cfg.burstCount
    this.burstCooldownMs = cfg.burstCooldownMs
    this.projectileSpeed = cfg.projectileSpeed
    this.projectileDamage = cfg.projectileDamage
    // Première salve différée (pas de rafale à l'apparition).
    this.nextBurstAt = scene.time.now + cfg.burstCooldownMs
  }

  /** Engagée mais entre deux salves : posture de veille (pas d'anim `act`). */
  protected override engagedAnimKind(): 'idle' | 'act' {
    return 'idle'
  }

  protected engage(): void {
    this.stopMoving() // une tourelle ne bouge JAMAIS
    const now = this.scene.time.now

    if (this.windupUntil > 0) {
      if (now >= this.windupUntil) {
        this.windupUntil = 0
        this.burst()
      }
      return
    }

    if (now >= this.nextBurstAt) {
      this.nextBurstAt = now + this.burstCooldownMs
      this.windupUntil = now + WINDUP_MS
      this.playAct(WINDUP_MS + 140)
      this.inflate()
    }
  }

  /** Salve radiale : `burstCount` tirs équi-répartis, éventail pivotant. */
  private burst(): void {
    const step = (Math.PI * 2) / this.burstCount
    const base = this.burstPhase * step * 0.5 // pivote d'une DEMI-dent
    this.burstPhase = (this.burstPhase + 1) % 2
    for (let i = 0; i < this.burstCount; i++) {
      const shot: EnemyShot = {
        x: this.x,
        y: this.y,
        angle: base + i * step,
        speed: this.projectileSpeed,
        damage: this.projectileDamage,
      }
      this.emit('enemy-fire', shot)
    }
  }

  /** Gonflement télégraphié (poseScale — cohabite avec le wobble). */
  private inflate(): void {
    this.scene.tweens.add({
      targets: this,
      poseScale: 1.24,
      duration: WINDUP_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!this.active) return
        this.scene.tweens.add({ targets: this, poseScale: 1, duration: 160, ease: 'Back.easeOut' })
      },
    })
  }
}
