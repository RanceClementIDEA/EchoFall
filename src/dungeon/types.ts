/** Types du donjon — module pur (aucune dépendance Phaser), testable. */

/** Côté d'une salle (et direction de porte). */
export type Side = 'north' | 'south' | 'east' | 'west'

export const SIDES: readonly Side[] = ['north', 'south', 'east', 'west']

/** Côté opposé (entrer par le nord = sortir du sud de la salle voisine). */
export const OPPOSITE: Record<Side, Side> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
}

/** Décalage grille de chaque côté (y vers le bas, comme à l'écran). */
export const DELTA: Record<Side, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
}

export type RoomType = 'start' | 'combat' | 'treasure' | 'boss'

/** Une salle du donjon. */
export interface RoomNode {
  /** Identifiant = coordonnées grille "gx,gy". */
  id: string
  gx: number
  gy: number
  type: RoomType
  /** Distance en salles depuis le départ (BFS). */
  depth: number
  /** Voisins par côté : id de la salle derrière chaque porte. */
  neighbors: Partial<Record<Side, string>>
  /** Seed propre à la salle (agencement des obstacles, ennemis, relique). */
  seed: number
  /** Vrai quand la salle ne contient plus de menace (portes ouvertes). */
  cleared: boolean
  /** Salle trésor : relique déjà ramassée ? */
  lootTaken?: boolean
}

export interface Dungeon {
  seed: number
  rooms: Map<string, RoomNode>
  startId: string
  bossId: string
}

export function roomId(gx: number, gy: number): string {
  return `${gx},${gy}`
}
