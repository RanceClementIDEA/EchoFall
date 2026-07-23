import Phaser from 'phaser'
import { gameConfig } from './config'
import { runState } from './state/RunState'
import { ALL_ITEMS } from './items/registry'
import { sound } from './systems/Sound'
import { loadPrefs } from './core/meta'

/**
 * Point d'entrée de l'application.
 *
 * `new Phaser.Game(...)` crée la fenêtre de jeu (un <canvas>) et démarre la
 * game loop (requestAnimationFrame, cible 60 FPS). Le flux entre écrans —
 * menu, jeu, pause, résultat — est piloté par la machine à états `GameFlow`
 * (src/state/), l'état d'une run par `RunState`, la méta persistante par
 * `core/meta.ts`.
 */
const game = new Phaser.Game(gameConfig)

// Applique la préférence audio sauvegardée dès le démarrage.
sound.setMuted(loadPrefs().muted)

// En développement uniquement : expose jeu et run pour inspection/tests.
// `import.meta.env.DEV` vaut `false` au build → code éliminé en production.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  const w = window as unknown as {
    __game: Phaser.Game
    __run: typeof runState
    __items: typeof ALL_ITEMS
    __sound: typeof sound
  }
  w.__game = game
  w.__run = runState
  w.__items = ALL_ITEMS
  w.__sound = sound
}

export default game
