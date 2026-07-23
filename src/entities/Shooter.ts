import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'

export type ShooterConfig = EnemyBaseConfig & {
  /** Vitesse de repositionnement (px/s). */
  moveSpeed: number
  /** En deçà de cette distance, il recule (px). */
  minRange: number
  /** Au-delà de cette distance, il se rapproche (px). */
  maxRange: number
  /** Délai entre deux tirs (ms). */
  fireCooldownMs: number
  /** Vitesse des projectiles tirés (px/s). */
  projectileSpeed: number
  /** Dégâts par projectile. */
  projectileDamage: number
}

/** Payload de l'événement `enemy-fire` (la scène crée le projectile). */
export interface EnemyShot {
  x: number
  y: number
  angle: number
  speed: number
  damage: number
}

/** Durée du gonflement télégraphié avant chaque crachat (ms) — calée sur
 *  les 4 premières frames de `foe-shooter-fire` à 12 fps (~333 ms). */
const WINDUP_MS = 340
/** Sur-gonflement procédural de la pose pendant le télégraphe. */
const INFLATE_SCALE = 1.22

/**
 * Shooter (« le Cracheur ») — ennemi à distance. Une fois le joueur détecté,
 * il **maintient ses distances** (kiting : recule s'il est trop près, se
 * rapproche s'il est trop loin, tient sa position dans la bonne fourchette)
 * et **tire des projectiles** vers le joueur à cadence régulière.
 *
 * Chaque tir est **télégraphié** : il s'immobilise et **GONFLE** pendant
 * `WINDUP_MS` (anim `act` + tween de `poseScale`), puis crache le projectile
 * en dégonflant d'un coup — lisible et esquivable.
 *
 * Il n'accède pas au pool de projectiles de la scène : il émet `enemy-fire`
 * et la scène crée le tir. Même découplage que `enemy-died`.
 */
export class Shooter extends EnemyBase {
  private readonly moveSpeed: number
  private readonly minRange: number
  private readonly maxRange: number
  private readonly fireCooldownMs: number
  private readonly projectileSpeed: number
  private readonly projectileDamage: number
  private nextFireAt: number
  /** Gonflement en cours : fin de fenêtre (0 = aucun tir en préparation). */
  private windupUntil = 0

  constructor(scene: Phaser.Scene, cfg: ShooterConfig) {
    super(scene, cfg)
    this.moveSpeed = cfg.moveSpeed
    this.minRange = cfg.minRange
    this.maxRange = cfg.maxRange
    this.fireCooldownMs = cfg.fireCooldownMs
    this.projectileSpeed = cfg.projectileSpeed
    this.projectileDamage = cfg.projectileDamage
    // Premier tir différé : pas de salve à l'apparition / à l'entrée en salle.
    this.nextFireAt = scene.time.now + cfg.fireCooldownMs
  }

  /** Engagé mais pas en train de cracher : il marche (l'anim `act` est
   *  réservée au gonflement, ouverte par `playAct`). */
  protected override engagedAnimKind(): 'idle' | 'act' {
    return 'idle'
  }

  protected engage(dist: number): void {
    const now = this.scene.time.now

    // ── Gonflement en cours : cloué sur place, il crache à la fin. ──
    if (this.windupUntil > 0) {
      this.stopMoving()
      if (now >= this.windupUntil) {
        this.windupUntil = 0
        this.spit()
      }
      return
    }

    // Kiting : rester dans la fourchette [minRange, maxRange].
    if (dist < this.minRange) {
      this.moveAwayFrom(this.target.x, this.target.y, this.moveSpeed)
    } else if (dist > this.maxRange) {
      this.moveToward(this.target.x, this.target.y, this.moveSpeed)
    } else {
      this.stopMoving()
    }

    // Cadence régulière : le cooldown écoulé déclenche le TÉLÉGRAPHE (pas le
    // tir) — le projectile ne part qu'au bout du gonflement.
    if (now >= this.nextFireAt) {
      this.nextFireAt = now + this.fireCooldownMs
      this.windupUntil = now + WINDUP_MS
      this.playAct(WINDUP_MS + 160) // l'anim couvre gonflement + crachat
      this.inflate()
    }
  }

  /** Crache le projectile, visé sur la position ACTUELLE du joueur. */
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

  /**
   * Pose de gonflement : `poseScale` enfle pendant le télégraphe puis
   * dégonfle d'un coup (compression sous 1) et rebondit à la normale.
   * S'ajoute PAR-DESSUS les frames (le wobble multiplie la pose) — et reste
   * le seul télégraphe visible en rendu procédural, sans spritesheets.
   */
  private inflate(): void {
    this.scene.tweens.add({
      targets: this,
      poseScale: INFLATE_SCALE,
      duration: WINDUP_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!this.active) return
        this.scene.tweens.add({
          targets: this,
          poseScale: 0.88, // dégonflage sec au crachat…
          duration: 70,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (!this.active) return
            this.scene.tweens.add({
              targets: this,
              poseScale: 1, // …puis rebond mou vers la normale
              duration: 140,
              ease: 'Back.easeOut',
            })
          },
        })
      },
    })
  }
}
