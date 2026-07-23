/**
 * États du flux de jeu.
 *
 * La valeur de chaque état sert aussi de **clé de scène Phaser** (une scène =
 * un état) : source unique de vérité, pas de mapping à maintenir en double.
 */
export enum GameState {
  Boot = 'Boot',
  Menu = 'Menu',
  Gameplay = 'Gameplay',
  Pause = 'Pause',
  Result = 'Result',
}

/** Issue d'une partie, transmise à l'écran de résultat. */
export type Outcome = 'victory' | 'defeat'

/** Bilan de fin de run (calculé une seule fois par RunState.finishRun). */
export interface RunSummary {
  outcome: Outcome
  /** Ennemis vaincus durant la run. */
  enemiesKilled: number
  /** Durée de la run (ms). */
  durationMs: number
  /** Strate atteinte (1-indexée) — la profondeur de la descente. */
  floorReached: number
  /** Nombre total de strates de l'Abîme. */
  totalStrata: number
  /** Nom de la strate atteinte (« Jardins Fongiques »…). */
  stratumName: string
  /** Salles explorées / totales — CUMULÉES sur toutes les strates traversées. */
  roomsExplored: number
  totalRooms: number
  shards: number
  /** Échos (revenants) apaisés durant la run — vaincus ou recueillis. */
  echoesBanished: number
  /** Gardiens vaincus (un par strate purgée). */
  bossesDefeated: number
  fragmentsEarned: number
  fragmentsTotal: number
}

/** Données passées à ResultScene lors de la transition Gameplay → Result. */
export interface ResultData {
  outcome: Outcome
  summary: RunSummary
}

/**
 * Table des transitions autorisées : pour chaque état, les états atteignables.
 * Toute transition absente de cette table est refusée (et loguée) par GameFlow.
 *
 *   Boot ─► Menu ─► Gameplay ─► Pause ─► Gameplay (reprise)
 *                        │         └────► Menu     (abandon, sans fragments)
 *                        └─► Result ─► Gameplay (nouvelle run)
 *                                   └─► Menu
 */
export const TRANSITIONS: Record<GameState, GameState[]> = {
  [GameState.Boot]: [GameState.Menu],
  [GameState.Menu]: [GameState.Gameplay],
  [GameState.Gameplay]: [GameState.Pause, GameState.Result],
  [GameState.Pause]: [GameState.Gameplay, GameState.Menu],
  [GameState.Result]: [GameState.Gameplay, GameState.Menu],
}
