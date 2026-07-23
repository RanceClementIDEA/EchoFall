import { Rng } from '../core/rng'
import {
  type Dungeon,
  type RoomNode,
  type RoomType,
  SIDES,
  DELTA,
  OPPOSITE,
  roomId,
} from './types'

/**
 * Générateur de donjon (GDD §6) — module pur, déterministe par seed.
 *
 * Algorithme (façon *The Binding of Isaac*) :
 *  1. Marche aléatoire sur grille depuis (0,0) : on choisit une salle
 *     existante, un côté libre, et on y accroche une nouvelle salle.
 *     Les cellules qui toucheraient ≥ 2 salles existantes sont souvent
 *     refusées → le donjon reste arborescent, avec des impasses (loot).
 *  2. Profondeur de chaque salle par BFS depuis le départ.
 *  3. Attribution des types : boss = une salle la plus profonde (impasse
 *     de préférence), trésor = une autre impasse, le reste = combat.
 */
export function generateDungeon(seed: number, targetRooms = 7): Dungeon {
  const rng = new Rng(seed)
  const rooms = new Map<string, RoomNode>()

  const makeRoom = (gx: number, gy: number): RoomNode => {
    const node: RoomNode = {
      id: roomId(gx, gy),
      gx,
      gy,
      type: 'combat', // retypé à l'étape 3
      depth: 0,
      neighbors: {},
      seed: rng.int(1, 2 ** 31 - 2),
      cleared: false,
    }
    rooms.set(node.id, node)
    return node
  }

  // ── 1. Marche aléatoire sur la grille ──────────────────────────────────
  const start = makeRoom(0, 0)

  let attempts = 0
  while (rooms.size < targetRooms && attempts < 500) {
    attempts++
    const from = rng.pick([...rooms.values()])
    const side = rng.pick(SIDES)
    const gx = from.gx + DELTA[side].dx
    const gy = from.gy + DELTA[side].dy
    if (rooms.has(roomId(gx, gy))) continue

    // Compte les salles déjà adjacentes à la cellule candidate : en refuser
    // la plupart quand il y en a ≥ 2 garde une forme arborescente.
    const filledNeighbors = SIDES.filter((s) =>
      rooms.has(roomId(gx + DELTA[s].dx, gy + DELTA[s].dy)),
    ).length
    if (filledNeighbors >= 2 && !rng.chance(0.15)) continue

    const room = makeRoom(gx, gy)
    // Portes symétriques entre les deux salles.
    from.neighbors[side] = room.id
    room.neighbors[OPPOSITE[side]] = from.id
  }

  // ── 2. Profondeurs par BFS depuis le départ ────────────────────────────
  const queue: RoomNode[] = [start]
  const seen = new Set<string>([start.id])
  while (queue.length > 0) {
    const node = queue.shift()!
    for (const nid of Object.values(node.neighbors)) {
      if (nid === undefined || seen.has(nid)) continue
      seen.add(nid)
      const next = rooms.get(nid)!
      next.depth = node.depth + 1
      queue.push(next)
    }
  }

  // ── 3. Types de salles ─────────────────────────────────────────────────
  const isLeaf = (r: RoomNode) => Object.keys(r.neighbors).length <= 1
  const others = [...rooms.values()].filter((r) => r.id !== start.id)

  // Boss : parmi les plus profondes, une impasse de préférence.
  const maxDepth = Math.max(...others.map((r) => r.depth))
  const deepest = others.filter((r) => r.depth === maxDepth)
  const bossPool = deepest.some(isLeaf) ? deepest.filter(isLeaf) : deepest
  const boss = rng.pick(bossPool)

  // Trésor : une autre impasse (ni départ ni boss) ; sinon n'importe quelle
  // autre salle ; les petits donjons peuvent ne pas en avoir.
  const treasurePool = others.filter((r) => r.id !== boss.id && isLeaf(r))
  const fallbackPool = others.filter((r) => r.id !== boss.id)
  const treasure =
    treasurePool.length > 0
      ? rng.pick(treasurePool)
      : fallbackPool.length > 0
        ? rng.pick(fallbackPool)
        : null

  const typeOf = (r: RoomNode): RoomType => {
    if (r.id === start.id) return 'start'
    if (r.id === boss.id) return 'boss'
    if (treasure && r.id === treasure.id) return 'treasure'
    return 'combat'
  }
  for (const room of rooms.values()) {
    room.type = typeOf(room)
    // Départ et trésor sont sans menace : portes ouvertes d'emblée.
    room.cleared = room.type === 'start' || room.type === 'treasure'
  }

  return { seed, rooms, startId: start.id, bossId: boss.id }
}
