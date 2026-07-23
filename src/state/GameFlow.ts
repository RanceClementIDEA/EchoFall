import Phaser from 'phaser'
import { GameState, TRANSITIONS, type Outcome, type ResultData } from './GameState'
import { runState } from './RunState'
import { sound } from '../systems/Sound'

/**
 * GameFlow — machine à états du flux de jeu.
 *
 * • **Source unique de vérité** de l'état courant (`state`).
 * • **Centralise toutes les transitions** : chaque méthode publique exprime une
 *   intention (jouer, mettre en pause, terminer…), valide la transition contre
 *   {@link TRANSITIONS}, puis exécute la séquence d'opérations de scènes Phaser.
 *   Les scènes ne codent donc jamais « en dur » les changements d'état.
 * • **Émet** `transition (from, to)` : permet de brancher audio, analytics ou
 *   HUD sans coupler ces systèmes au flux lui-même.
 *
 * C'est aussi ici que le cycle de vie d'une run est ancré : entrer en
 * Gameplay depuis Menu/Result = run neuve (permadeath) ; entrer en Result =
 * clôture de la run (bilan + fragments crédités une seule fois).
 */
class GameFlow extends Phaser.Events.EventEmitter {
  private _state: GameState = GameState.Boot

  /** État courant du flux. */
  get state(): GameState {
    return this._state
  }

  /** Boot | Result → Menu. */
  toMenu(from: Phaser.Scene): void {
    if (!this.change(GameState.Menu)) return
    sound.stopMusic()
    from.scene.start(GameState.Menu)
  }

  /** Menu | Result → Gameplay : démarre une RUN NEUVE. */
  startGame(from: Phaser.Scene): void {
    if (!this.change(GameState.Gameplay)) return
    runState.newRun()
    sound.startMusic() // musique de donjon en boucle
    from.scene.start(GameState.Gameplay)
  }

  /** Gameplay → Pause : gèle le gameplay et superpose l'overlay de pause. */
  pauseGame(from: Phaser.Scene): void {
    if (!this.change(GameState.Pause)) return
    sound.pauseMusic()
    from.scene.pause() // gèle la scène appelante (Gameplay), sans la détruire
    from.scene.launch(GameState.Pause) // overlay additif par-dessus
    from.scene.bringToTop(GameState.Pause)
  }

  /** Pause → Gameplay (reprise). */
  resumeGame(from: Phaser.Scene): void {
    if (!this.change(GameState.Gameplay)) return
    sound.resumeMusic()
    from.scene.resume(GameState.Gameplay)
    from.scene.stop() // ferme l'overlay de pause (scène appelante)
  }

  /** Pause → Menu : abandon — la run est perdue SANS fragments (GDD §4). */
  quitToMenu(from: Phaser.Scene): void {
    if (!this.change(GameState.Menu)) return
    sound.stopMusic()
    from.scene.stop(GameState.Gameplay)
    from.scene.start(GameState.Menu) // start() ferme aussi l'overlay appelant
  }

  /** Gameplay → Result : fin de run (bilan calculé et crédité ici, une fois). */
  endGame(from: Phaser.Scene, outcome: Outcome): void {
    if (!this.change(GameState.Result)) return
    sound.stopMusic()
    const data: ResultData = { outcome, summary: runState.finishRun(outcome) }
    from.scene.start(GameState.Result, data)
  }

  /** Result → Gameplay : rejouer = run neuve. */
  restart(from: Phaser.Scene): void {
    if (!this.change(GameState.Gameplay)) return
    runState.newRun()
    sound.stopMusic()
    sound.startMusic()
    from.scene.start(GameState.Gameplay)
  }

  /** Valide la transition puis applique le changement d'état logique. */
  private change(to: GameState): boolean {
    if (!TRANSITIONS[this._state].includes(to)) {
      console.warn(`[GameFlow] transition illégale ignorée : ${this._state} → ${to}`)
      return false
    }
    const from = this._state
    this._state = to
    this.emit('transition', from, to)
    return true
  }
}

/** Singleton partagé par toutes les scènes. */
export const gameFlow = new GameFlow()
