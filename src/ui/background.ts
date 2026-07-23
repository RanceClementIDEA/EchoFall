import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../theme'

/**
 * Peint le fond de l'Abîme (dégradé vertical froid) + une poussière de Lumen.
 * Réutilisé par plusieurs scènes pour un rendu cohérent.
 */
export function paintAbyss(scene: Phaser.Scene, opts: { dust?: boolean } = {}): void {
  const g = scene.add.graphics()
  g.fillGradientStyle(
    COLORS.abyssTop,
    COLORS.abyssTop,
    COLORS.abyssBottom,
    COLORS.abyssBottom,
    1,
  )
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

  if (opts.dust !== false) {
    // Points de lumière déterministes (pas de hasard = rendu stable).
    for (let i = 0; i < 48; i++) {
      const x = (i * 137.5) % GAME_WIDTH
      const y = (i * 89.3) % GAME_HEIGHT
      const r = (i % 3) * 0.6 + 0.4
      scene.add.circle(x, y, r, COLORS.lumenGlow, 0.18)
    }
  }
}
