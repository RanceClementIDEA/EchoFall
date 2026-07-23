import { describe, it, expect, beforeEach } from 'vitest'
import {
  placeEchoes,
  echoPowerFrom,
  echoCombatStats,
  echoLoot,
  communeCost,
  MAX_ACTIVE_ECHOES,
} from '../src/core/echoes'
import { loadMeta, recordEcho, forgetEcho, echoCount, type EchoRecord } from '../src/core/meta'
import { BASE_STATS } from '../src/core/stats'
import type { Dungeon, RoomNode, RoomType } from '../src/dungeon/types'

/* ── Fabriques de test ─────────────────────────────────────────────────── */

function makeRoom(id: string, type: RoomType, cleared = false): RoomNode {
  const [gx, gy] = id.split(',').map(Number)
  return { id, gx, gy, type, depth: 0, neighbors: {}, seed: 1, cleared }
}

function makeDungeon(rooms: RoomNode[]): Dungeon {
  const map = new Map<string, RoomNode>()
  for (const r of rooms) map.set(r.id, r)
  return { seed: 123, rooms: map, startId: '0,0', bossId: rooms.find((r) => r.type === 'boss')?.id ?? '' }
}

function echo(roomId: string, over: Partial<EchoRecord> = {}): EchoRecord {
  return { seed: 999, roomId, floor: 1, power: 11, shards: 0, items: [], ...over }
}

/* ── Placement (module pur, déterministe) ──────────────────────────────── */

describe('placeEchoes — hante les cellules de combat régénérées', () => {
  it('place un Écho sur la salle de combat de même coordonnée', () => {
    const dungeon = makeDungeon([makeRoom('0,0', 'start'), makeRoom('1,0', 'combat')])
    const placed = placeEchoes(dungeon, [echo('1,0')])
    expect(placed).toHaveLength(1)
    expect(placed[0].roomId).toBe('1,0')
  })

  it('ignore départ, trésor, Gardien, salle nettoyée et cellule absente', () => {
    const dungeon = makeDungeon([
      makeRoom('0,0', 'start'),
      makeRoom('1,0', 'treasure'),
      makeRoom('0,1', 'boss'),
      makeRoom('-1,0', 'combat', true), // déjà purgée
    ])
    const placed = placeEchoes(dungeon, [
      echo('0,0'), // départ
      echo('1,0'), // trésor
      echo('0,1'), // boss
      echo('-1,0'), // déjà nettoyée
      echo('9,9'), // n'existe pas dans cette descente
    ])
    expect(placed).toHaveLength(0)
  })

  it('borne le nombre d’Échos actifs par descente', () => {
    const rooms = [makeRoom('0,0', 'start')]
    const echoes: EchoRecord[] = []
    for (let i = 1; i <= MAX_ACTIVE_ECHOES + 2; i++) {
      rooms.push(makeRoom(`${i},0`, 'combat'))
      echoes.push(echo(`${i},0`))
    }
    expect(placeEchoes(makeDungeon(rooms), echoes)).toHaveLength(MAX_ACTIVE_ECHOES)
  })

  it('une seule trace par cellule : le premier (plus récent) gagne', () => {
    const dungeon = makeDungeon([makeRoom('0,0', 'start'), makeRoom('1,0', 'combat')])
    const recent = echo('1,0', { seed: 1 })
    const older = echo('1,0', { seed: 2 })
    const placed = placeEchoes(dungeon, [recent, older])
    expect(placed).toHaveLength(1)
    expect(placed[0].echo.seed).toBe(1)
  })

  it('est déterministe (mêmes entrées → même sortie)', () => {
    const dungeon = makeDungeon([makeRoom('0,0', 'start'), makeRoom('1,0', 'combat'), makeRoom('2,0', 'combat')])
    const echoes = [echo('2,0'), echo('1,0')]
    expect(placeEchoes(dungeon, echoes)).toEqual(placeEchoes(dungeon, echoes))
  })
})

/* ── Calibrage & butin (bornés, monotones) ─────────────────────────────── */

describe('echoPowerFrom — force du plongeur tombé', () => {
  it('reste dans [4, 40] et croît avec les objets', () => {
    const base = echoPowerFrom(BASE_STATS, [])
    expect(base).toBeGreaterThanOrEqual(4)
    expect(base).toBeLessThanOrEqual(40)
    expect(echoPowerFrom(BASE_STATS, ['a', 'b', 'c'])).toBeGreaterThan(base)
  })
})

describe('echoCombatStats — mini-boss borné', () => {
  it('gagne en PV avec l’étage et la force, plafonné', () => {
    const shallow = echoCombatStats(echo('1,0', { floor: 1, power: 8 }))
    const deep = echoCombatStats(echo('1,0', { floor: 6, power: 30 }))
    expect(deep.hp).toBeGreaterThan(shallow.hp)
    expect(deep.hp).toBeLessThanOrEqual(64)
    expect(shallow.hp).toBeGreaterThanOrEqual(12)
  })

  it('resserre la cadence en profondeur sans descendre sous le plancher', () => {
    const shallow = echoCombatStats(echo('1,0', { floor: 1 }))
    const deep = echoCombatStats(echo('1,0', { floor: 10 }))
    expect(deep.fireCooldownMs).toBeLessThan(shallow.fireCooldownMs)
    expect(deep.fireCooldownMs).toBeGreaterThanOrEqual(620)
    expect(deep.projectileDamage).toBeGreaterThanOrEqual(shallow.projectileDamage)
  })
})

describe('echoLoot — garanti et bonifié', () => {
  it('lâche toujours au moins un cœur et une clé', () => {
    const drops = echoLoot(echo('1,0'))
    expect(drops).toContain('heart')
    expect(drops).toContain('key')
    expect(drops.filter((d) => d === 'coin').length).toBeGreaterThanOrEqual(2)
  })

  it('devient plus généreux en profondeur / avec les éclats emportés', () => {
    const poor = echoLoot(echo('1,0', { floor: 1, shards: 0 }))
    const rich = echoLoot(echo('1,0', { floor: 5, shards: 30 }))
    expect(rich.length).toBeGreaterThan(poor.length)
    expect(rich.filter((d) => d === 'coin').length).toBeLessThanOrEqual(8)
  })
})

describe('communeCost — recueillement contre un peu de Lumen', () => {
  it('croît avec l’étage, borné [4, 12]', () => {
    expect(communeCost(echo('1,0', { floor: 1 }))).toBe(4)
    const deep = communeCost(echo('1,0', { floor: 99 }))
    expect(deep).toBe(12)
  })
})

/* ── Persistance des Échos (localStorage en mémoire) ───────────────────── */

describe('persistance des Échos (meta)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    } as unknown as Storage
  })

  it('enregistre puis relit un Écho enrichi', () => {
    recordEcho(echo('1,0', { floor: 3, power: 20, shards: 7, items: ['split-shot'] }))
    const [e] = loadMeta().echoes
    expect(e).toMatchObject({ roomId: '1,0', floor: 3, power: 20, shards: 7, items: ['split-shot'] })
    expect(echoCount()).toBe(1)
  })

  it('déduplique par cellule : mourir au même endroit remplace la trace', () => {
    recordEcho(echo('1,0', { seed: 1 }))
    recordEcho(echo('2,0', { seed: 2 }))
    recordEcho(echo('1,0', { seed: 3 })) // remort en 1,0
    const echoes = loadMeta().echoes
    expect(echoes.filter((e) => e.roomId === '1,0')).toHaveLength(1)
    expect(echoes.find((e) => e.roomId === '1,0')!.seed).toBe(3)
    expect(echoCount()).toBe(2)
  })

  it('forgetEcho apaise la cellule (retire la trace)', () => {
    recordEcho(echo('1,0'))
    recordEcho(echo('2,0'))
    forgetEcho('1,0')
    expect(loadMeta().echoes.map((e) => e.roomId)).toEqual(['2,0'])
  })

  it('lit une vieille sauvegarde (seed + roomId seuls) en comblant les défauts', () => {
    localStorage.setItem('echofall.save.v1', JSON.stringify({ echoes: [{ seed: 5, roomId: '3,1' }] }))
    const [e] = loadMeta().echoes
    expect(e).toMatchObject({ seed: 5, roomId: '3,1', floor: 1, shards: 0, items: [] })
    expect(e.power).toBeGreaterThan(0)
  })

  it('écarte les entrées corrompues (objet sans roomId, non-objets)', () => {
    localStorage.setItem(
      'echofall.save.v1',
      JSON.stringify({ echoes: [{ seed: 1 }, 'nope', null, { roomId: '1,0', seed: 2 }] }),
    )
    const echoes = loadMeta().echoes
    expect(echoes).toHaveLength(1)
    expect(echoes[0].roomId).toBe('1,0')
  })
})
