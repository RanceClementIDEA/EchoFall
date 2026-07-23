import Phaser from 'phaser'
import { EnemyBase, type EnemyBaseConfig } from './EnemyBase'
import type { EnemyShot } from './Shooter'

/** Salve radiale périodique (anneau complet, éventail pivotant). */
export interface RadialPattern {
  count: number
  cooldownMs: number
  speed: number
  damage: number
}

/** Tir visé périodique (1..n projectiles en éventail vers le joueur). */
export interface AimedPattern {
  count: number
  spreadDeg: number
  cooldownMs: number
  speed: number
  damage: number
}

/** Ruée télégraphiée périodique (écho du dash du joueur). */
export interface LungePattern {
  speed: number
  cooldownMs: number
}

export type AbyssBossConfig = EnemyBaseConfig & {
  /** Vitesse de repositionnement/kiting (px/s). */
  moveSpeed: number
  /** Fourchette de distance tenue face au joueur (px). */
  minRange: number
  maxRange: number
  radial?: RadialPattern
  aimed?: AimedPattern
  lunge?: LungePattern
}

const RADIAL_WINDUP_MS = 460
const AIMED_WINDUP_MS = 300
const LUNGE_WINDUP_MS = 380
const LUNGE_MS = 240

/**
 * AbyssBoss — Gardien à PATTERNS, configurable par strate (GDD §2.3) : il
 * compose librement **salves radiales** (anneaux pivotants), **tirs visés**
 * (éventail vers le joueur) et **ruées** télégraphiées, sur une base de kiting.
 *
 *   • « Cracheur Alpha » (strate 2) : radial + visé — un duel de zones.
 *   • « Avatar de l'Abîme » (strate 3) : radial + visé + ruée — l'examen final.
 *
 * Chaque pattern est TÉLÉGRAPHIÉ (immobilisation + anim `act` + gonflement) et
 * les cooldowns sont indépendants — mais un seul pattern s'exécute à la fois
 * (pas de superposition illisible). Tirs émis via `enemy-fire` (scène).
 */
export class AbyssBoss extends EnemyBase {
  private readonly moveSpeed: number
  private readonly minRange: number
  private readonly maxRange: number
  private readonly radial?: RadialPattern
  private readonly aimed?: AimedPattern
  private readonly lunge?: LungePattern

  private nextRadialAt = 0
  private nextAimedAt = 0
  private nextLungeAt = 0
  /** Pattern en préparation (télégraphe en cours), et son échéance. */
  private pending: 'radial' | 'aimed' | 'lunge' | null = null
  private pendingUntil = 0
  private lungeUntil = 0
  /** Pivot de l'anneau radial (balaye les couloirs sûrs). */
  private radialPhase = 0

  constructor(scene: Phaser.Scene, cfg: AbyssBossConfig) {
    super(scene, cfg)
    this.moveSpeed = cfg.moveSpeed
    this.minRange = cfg.minRange
    this.maxRange = cfg.maxRange
    this.radial = cfg.radial
    this.aimed = cfg.aimed
    this.lunge = cfg.lunge
    // Ouverture en douceur : les patterns démarrent décalés (lisibilité).
    const now = scene.time.now
    this.nextRadialAt = now + (cfg.radial?.cooldownMs ?? 0) * 0.7
    this.nextAimedAt = now + (cfg.aimed?.cooldownMs ?? 0) * 0.45
    this.nextLungeAt = now + (cfg.lunge?.cooldownMs ?? 0)
  }

  protected engage(dist: number): void {
    const now = this.scene.time.now

    // ── Ruée en cours : trajectoire figée. ──
    if (now < this.lungeUntil) return

    // ── Télégraphe en cours : cloué, exécution à l'échéance. ──
    if (this.pending) {
      this.stopMoving()
      if (now >= this.pendingUntil) {
        const pattern = this.pending
        this.pending = null
        if (pattern === 'radial') this.fireRadial()
        else if (pattern === 'aimed') this.fireAimed()
        else this.launchLunge(now)
      }
      return
    }

    // ── Choix du prochain pattern (un seul à la fois, cooldowns indépendants). ──
    if (this.lunge && now >= this.nextLungeAt && dist < this.maxRange * 1.3) {
      this.nextLungeAt = now + this.lunge.cooldownMs
      this.telegraph('lunge', LUNGE_WINDUP_MS, LUNGE_MS)
      return
    }
    if (this.radial && now >= this.nextRadialAt) {
      this.nextRadialAt = now + this.radial.cooldownMs
      this.telegraph('radial', RADIAL_WINDUP_MS)
      return
    }
    if (this.aimed && now >= this.nextAimedAt) {
      this.nextAimedAt = now + this.aimed.cooldownMs
      this.telegraph('aimed', AIMED_WINDUP_MS)
      return
    }

    // ── Kiting : tenir la fourchette de distance. ──
    if (dist < this.minRange) this.moveAwayFrom(this.target.x, this.target.y, this.moveSpeed)
    else if (dist > this.maxRange) this.moveToward(this.target.x, this.target.y, this.moveSpeed)
    else this.stopMoving()
  }

  /** Ouvre un télégraphe : immobilisé + anim `act` + gonflement de pose. */
  private telegraph(pattern: 'radial' | 'aimed' | 'lunge', windupMs: number, extraMs = 160): void {
    this.pending = pattern
    this.pendingUntil = this.scene.time.now + windupMs
    this.playAct(windupMs + extraMs)
    this.scene.tweens.add({
      targets: this,
      poseScale: 1.18,
      duration: windupMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!this.active) return
        this.scene.tweens.add({ targets: this, poseScale: 1, duration: 150, ease: 'Back.easeOut' })
      },
    })
  }

  /** Anneau complet de projectiles, pivotant d'une demi-dent à chaque salve. */
  private fireRadial(): void {
    const p = this.radial!
    const step = (Math.PI * 2) / p.count
    const base = this.radialPhase * step * 0.5
    this.radialPhase = (this.radialPhase + 1) % 2
    for (let i = 0; i < p.count; i++) {
      this.emitShot(base + i * step, p.speed, p.damage)
    }
  }

  /** Éventail resserré, visé sur la position ACTUELLE du joueur. */
  private fireAimed(): void {
    const p = this.aimed!
    const at = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y)
    const step = Phaser.Math.DegToRad(p.spreadDeg)
    for (let i = 0; i < p.count; i++) {
      this.emitShot(at + (i - (p.count - 1) / 2) * step, p.speed, p.damage)
    }
  }

  private launchLunge(now: number): void {
    const p = this.lunge!
    const dir = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y)
    if (dir.lengthSq() === 0) dir.set(1, 0)
    dir.normalize().scale(p.speed)
    this.arcadeBody.setVelocity(dir.x, dir.y)
    this.lungeUntil = now + LUNGE_MS
  }

  private emitShot(angle: number, speed: number, damage: number): void {
    const shot: EnemyShot = { x: this.x, y: this.y, angle, speed, damage }
    this.emit('enemy-fire', shot)
  }
}
