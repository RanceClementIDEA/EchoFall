import Phaser from 'phaser'
import { GAME_WIDTH, COLORS, DEPTH } from '../theme'
import type { Dungeon } from '../dungeon/types'
import { SIDES } from '../dungeon/types'

const CELL = 14 // taille d'une cellule (px)
const GAP = 3 // espacement entre cellules

/**
 * Minimap — vue du donjon en haut à droite (façon Isaac).
 * Affiche les salles visitées (pleines) et les voisines connues (contour) ;
 * la salle courante est surlignée, le boss marqué s'il est découvert, et une
 * salle **hantée par un Écho** (encore connue mais non purgée) porte un point
 * spectral — l'Abîme signale où l'un de vos morts vous attend.
 * Dessinée à la création de la salle (la scène redémarre à chaque porte,
 * donc la minimap est naturellement à jour).
 */
export function drawMinimap(
  scene: Phaser.Scene,
  dungeon: Dungeon,
  currentId: string,
  visited: ReadonlySet<string>,
  echoRooms: ReadonlySet<string> = new Set(),
): void {
  // Salles « connues » : visitées + voisines immédiates des visitées.
  const known = new Set<string>(visited)
  for (const id of visited) {
    const room = dungeon.rooms.get(id)
    if (!room) continue
    for (const side of SIDES) {
      const nid = room.neighbors[side]
      if (nid) known.add(nid)
    }
  }

  // knownRooms contient toujours au moins la salle courante (visitée),
  // donc les min/max ci-dessous sont bien définis.
  const knownRooms = [...known].map((id) => dungeon.rooms.get(id)!).filter(Boolean)
  const minGx = Math.min(...knownRooms.map((r) => r.gx))
  const maxGx = Math.max(...knownRooms.map((r) => r.gx))
  const minGy = Math.min(...knownRooms.map((r) => r.gy))

  const originX = GAME_WIDTH - 16 - (maxGx - minGx + 1) * (CELL + GAP)
  const originY = 16

  for (const room of knownRooms) {
    const x = originX + (room.gx - minGx) * (CELL + GAP)
    const y = originY + (room.gy - minGy) * (CELL + GAP)
    const isVisited = visited.has(room.id)
    const isCurrent = room.id === currentId

    const fill = isCurrent ? COLORS.lumen : isVisited ? COLORS.wall : 0x000000
    const rect = scene.add.rectangle(x, y, CELL, CELL, fill, isVisited || isCurrent ? 1 : 0.3)
    rect.setOrigin(0, 0)
    rect.setStrokeStyle(1, isCurrent ? COLORS.lumenGlow : COLORS.stroke, 1)
    rect.setDepth(DEPTH.ui)

    // Boss découvert : point rouge.
    if (room.id === dungeon.bossId) {
      scene.add.circle(x + CELL / 2, y + CELL / 2, 3, COLORS.boss, 1).setDepth(DEPTH.ui)
    }

    // Salle hantée par un Écho (connue mais pas encore apaisée) : point spectral.
    if (echoRooms.has(room.id)) {
      scene.add.circle(x + CELL / 2, y + CELL / 2, 3, COLORS.echoGlow, 1).setDepth(DEPTH.ui)
      scene.add
        .circle(x + CELL / 2, y + CELL / 2, 5)
        .setStrokeStyle(1, COLORS.echo, 0.9)
        .setDepth(DEPTH.ui)
    }
  }
}
