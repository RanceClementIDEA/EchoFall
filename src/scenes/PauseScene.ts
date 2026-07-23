import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../theme'
import { GameState } from '../state/GameState'
import { gameFlow } from '../state/GameFlow'
import { runState } from '../state/RunState'
import { formatDuration } from '../core/format'
import { createButton } from '../ui/Button'

/**
 * PauseScene — menu de pause interactif (overlay).
 *
 * Lancé EN PLUS de GameplayScene (gelée et visible dessous via scene.pause) :
 * on ne repeint pas le fond, un voile sombre suffit. Affiche un aperçu des
 * stats de la run en cours et deux actions : reprendre, ou abandonner vers la
 * Citadelle (la run est alors perdue, sans Fragments — GDD §4).
 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super(GameState.Pause)
  }

  create(): void {
    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2

    // Voile assombrissant animé (laisse voir le gameplay gelé en dessous).
    const veil = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0).setOrigin(0)
    this.tweens.add({ targets: veil, fillAlpha: 0.68, duration: 140 })

    const title = this.add
      .text(cx, cy - 118, 'PAUSE', {
        fontFamily: 'Georgia, serif',
        fontSize: '52px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setShadow(0, 3, '#05070d', 6)
      .setAlpha(0)
    this.tweens.add({ targets: title, alpha: 1, y: cy - 112, duration: 180, ease: 'Quad.easeOut' })

    // Aperçu des stats de la run en cours.
    this.add
      .text(
        cx,
        cy - 66,
        `Ennemis vaincus : ${runState.enemiesKilled}     ·     Temps : ${formatDuration(
          runState.elapsedMs(),
        )}     ·     Étage : ${runState.depthReached + 1}`,
        { fontFamily: 'monospace', fontSize: '13px', color: COLORS.textDim },
      )
      .setOrigin(0.5)

    createButton(this, cx, cy - 14, 'Reprendre', () => gameFlow.resumeGame(this))
    createButton(this, cx, cy + 54, 'Quitter vers la Citadelle', () => gameFlow.quitToMenu(this))

    this.add
      .text(cx, GAME_HEIGHT - 28, 'ÉCHAP pour reprendre', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5)

    this.input.keyboard?.on('keydown-ESC', () => gameFlow.resumeGame(this))
  }
}
