import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from './theme'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
import { GameplayScene } from './scenes/GameplayScene'
import { PauseScene } from './scenes/PauseScene'
import { ResultScene } from './scenes/ResultScene'

/**
 * Configuration passée à `new Phaser.Game(...)`.
 *
 * • Boucle : Phaser tourne sur requestAnimationFrame avec `fps.target = 60` ;
 *   tous les mouvements étant exprimés en px/s (intégrés avec le delta),
 *   le jeu reste correct quel que soit le rafraîchissement réel.
 * • Vue de dessus : gravité mondiale nulle — les entités pilotent
 *   entièrement leur vélocité.
 * • L'ordre du tableau `scene` compte : Phaser démarre la PREMIÈRE
 *   (BootScene) ; les autres attendent que GameFlow les lance.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#15111f',
  pixelArt: false,
  fps: {
    target: 60,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, GameplayScene, PauseScene, ResultScene],
}
