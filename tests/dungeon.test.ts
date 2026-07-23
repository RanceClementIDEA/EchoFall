import { describe, it, expect } from 'vitest'
import { generateDungeon } from '../src/dungeon/DungeonGenerator'
import { SIDES, OPPOSITE, DELTA, roomId } from '../src/dungeon/types'
import { Rng } from '../src/core/rng'

/** Invariants du générateur, vérifiés sur un éventail de seeds. */
const SEEDS = [1, 7, 42, 1337, 99991, 2 ** 30 + 123]

describe('Rng', () => {
  it('est déterministe : même seed → même séquence', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('int(min, max) reste dans les bornes incluses', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
})

describe('generateDungeon', () => {
  it('est déterministe : même seed → même donjon', () => {
    for (const seed of SEEDS) {
      const a = generateDungeon(seed)
      const b = generateDungeon(seed)
      expect([...a.rooms.keys()]).toEqual([...b.rooms.keys()])
      for (const [id, room] of a.rooms) {
        const other = b.rooms.get(id)!
        expect(room.type).toBe(other.type)
        expect(room.neighbors).toEqual(other.neighbors)
        expect(room.seed).toBe(other.seed)
      }
      expect(a.bossId).toBe(b.bossId)
    }
  })

  it('produit le nombre de salles demandé', () => {
    for (const seed of SEEDS) {
      expect(generateDungeon(seed, 7).rooms.size).toBe(7)
      expect(generateDungeon(seed, 10).rooms.size).toBe(10)
    }
  })

  it('toutes les salles sont accessibles depuis le départ (connexité)', () => {
    for (const seed of SEEDS) {
      const d = generateDungeon(seed)
      const seen = new Set([d.startId])
      const queue = [d.rooms.get(d.startId)!]
      while (queue.length > 0) {
        const room = queue.shift()!
        for (const nid of Object.values(room.neighbors)) {
          if (nid && !seen.has(nid)) {
            seen.add(nid)
            queue.push(d.rooms.get(nid)!)
          }
        }
      }
      expect(seen.size).toBe(d.rooms.size)
    }
  })

  it('les portes sont symétriques et géométriquement cohérentes', () => {
    for (const seed of SEEDS) {
      const d = generateDungeon(seed)
      for (const room of d.rooms.values()) {
        for (const side of SIDES) {
          const nid = room.neighbors[side]
          if (!nid) continue
          const neighbor = d.rooms.get(nid)!
          // La porte inverse pointe bien vers cette salle.
          expect(neighbor.neighbors[OPPOSITE[side]]).toBe(room.id)
          // Le voisin est bien la cellule de grille adjacente.
          expect(neighbor.id).toBe(
            roomId(room.gx + DELTA[side].dx, room.gy + DELTA[side].dy),
          )
        }
      }
    }
  })

  it('typage : un départ, un boss (le plus profond), au plus un trésor', () => {
    for (const seed of SEEDS) {
      const d = generateDungeon(seed)
      const rooms = [...d.rooms.values()]
      expect(rooms.filter((r) => r.type === 'start')).toHaveLength(1)
      expect(rooms.filter((r) => r.type === 'boss')).toHaveLength(1)
      expect(rooms.filter((r) => r.type === 'treasure').length).toBeLessThanOrEqual(1)

      const boss = rooms.find((r) => r.type === 'boss')!
      expect(boss.id).toBe(d.bossId)
      expect(boss.id).not.toBe(d.startId)
      const maxDepth = Math.max(...rooms.filter((r) => r.id !== d.startId).map((r) => r.depth))
      expect(boss.depth).toBe(maxDepth)
    }
  })

  it('départ et trésor sont ouverts, combat et boss verrouillés', () => {
    for (const seed of SEEDS) {
      for (const room of generateDungeon(seed).rooms.values()) {
        const expectOpen = room.type === 'start' || room.type === 'treasure'
        expect(room.cleared).toBe(expectOpen)
      }
    }
  })
})
