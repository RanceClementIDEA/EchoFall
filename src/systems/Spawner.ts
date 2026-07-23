import Phaser from 'phaser'
import { COLORS } from '../theme'
import type { SpawnSpec } from '../core/waves'
import type { EnemyBase } from '../entities/EnemyBase'

export type { SpawnSpec } from '../core/waves'

export interface SpawnerConfig {
  scene: Phaser.Scene
  /**
   * Plan de vagues PRÉ-CALCULÉ (core/waves.planWaves — pur, seedé par la
   * salle, paramétré par la strate). Le Spawner ne fait que le dérouler.
   */
  waves: SpawnSpec[][]
  /** Fabrique un ennemi ; la scène sait le construire et câbler ses events. */
  createEnemy: (spec: SpawnSpec) => EnemyBase
  /** Nombre d'ennemis encore vivants (fourni par la scène). */
  aliveCount: () => number
  /** Début d'une vague (pour le HUD : « Vague 2 / 3 »). */
  onWaveStart?: (waveNumber: number, totalWaves: number) => void
  /** Toutes les vagues nettoyées → la scène rouvre les portes. */
  onCleared: () => void
}

const TELEGRAPH_MS = 560 // marqueur d'apparition avant que l'ennemi surgisse
const NEXT_WAVE_DELAY_MS = 700 // respiration entre deux vagues

/**
 * Spawner — DÉROULEUR de vagues d'une salle de combat.
 *
 * Les portes sont déjà verrouillées par la scène à l'entrée. Le plan des
 * vagues (combien, qui, où) vient de `core/waves.ts` (pur, testé) ; le Spawner
 * n'orchestre que le RYTHME : apparition télégraphiée (un marqueur pulse à
 * l'emplacement, puis l'ennemi surgit), enchaînement des vagues quand la
 * précédente est vidée, et `onCleared` à la dernière — la scène rouvre alors
 * les portes.
 *
 * Découplé de la construction concrète des ennemis (fournie par la scène via
 * `createEnemy`) : le Spawner ne connaît ni les classes ni les stats.
 */
export class Spawner {
  private readonly cfg: SpawnerConfig
  private currentWave = -1
  private done = false

  constructor(cfg: SpawnerConfig) {
    this.cfg = cfg
  }

  get totalWaves(): number {
    return this.cfg.waves.length
  }

  /** Numéro de la vague en cours (1-indexé ; 0 si pas encore démarrée). */
  get currentWaveNumber(): number {
    return this.currentWave + 1
  }

  /** Démarre la première vague. */
  start(): void {
    this.spawnNextWave()
  }

  /**
   * À appeler à chaque mort d'ennemi (via la scène). L'ennemi mort est déjà
   * désactivé au moment de l'appel, donc `aliveCount()` ne le compte plus.
   */
  onEnemyDied(): void {
    if (this.done) return
    if (this.cfg.aliveCount() > 0) return // la vague courante n'est pas finie

    if (this.currentWave < this.cfg.waves.length - 1) {
      // Vague suivante après une courte pause.
      this.cfg.scene.time.delayedCall(NEXT_WAVE_DELAY_MS, () => {
        if (!this.done) this.spawnNextWave()
      })
    } else {
      this.done = true
      this.cfg.onCleared() // dernière vague vaincue → portes rouvertes
    }
  }

  private spawnNextWave(): void {
    this.currentWave++
    const wave = this.cfg.waves[this.currentWave]
    this.cfg.onWaveStart?.(this.currentWave + 1, this.cfg.waves.length)
    for (const spec of wave) this.telegraphThenSpawn(spec)
  }

  /** Marqueur qui pulse à l'emplacement, puis l'ennemi apparaît (dynamique). */
  private telegraphThenSpawn(spec: SpawnSpec): void {
    const scene = this.cfg.scene
    const marker = scene.add.circle(spec.x, spec.y, 14, COLORS.enemy, 0.5).setDepth(5)
    scene.tweens.add({
      targets: marker,
      scale: { from: 0.3, to: 1.4 },
      alpha: { from: 0.55, to: 0.1 },
      duration: TELEGRAPH_MS,
      onComplete: () => {
        marker.destroy()
        const enemy = this.cfg.createEnemy(spec)
        // Petite apparition (scale-in) pour un surgissement net.
        enemy.setScale(0.2)
        scene.tweens.add({ targets: enemy, scale: 1, duration: 160, ease: 'Back.easeOut' })
      },
    })
  }
}
