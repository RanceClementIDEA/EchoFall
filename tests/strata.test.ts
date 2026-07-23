import { describe, it, expect } from 'vitest'
import { STRATA, isLastStratum, dungeonSeedFor } from '../src/core/strata'
import { generateDungeon } from '../src/dungeon/DungeonGenerator'

const KNOWN_KINDS = ['charger', 'shooter', 'orbiter', 'splitter', 'bomber', 'sentinel']

describe('STRATA — définition des mondes', () => {
  it('propose au moins 3 strates, ids uniques', () => {
    expect(STRATA.length).toBeGreaterThanOrEqual(3)
    expect(new Set(STRATA.map((s) => s.id)).size).toBe(STRATA.length)
  })

  it('difficulté croissante : salles, PV bonus et vitesse montent avec la profondeur', () => {
    for (let i = 1; i < STRATA.length; i++) {
      expect(STRATA[i].rooms).toBeGreaterThan(STRATA[i - 1].rooms)
      expect(STRATA[i].foeHpBonus).toBeGreaterThanOrEqual(STRATA[i - 1].foeHpBonus)
      expect(STRATA[i].foeSpeedMul).toBeGreaterThanOrEqual(STRATA[i - 1].foeSpeedMul)
      expect(STRATA[i].boss.hp).toBeGreaterThan(STRATA[i - 1].boss.hp)
    }
  })

  it('bestiaires valides : poids > 0, types connus, bornes de vagues cohérentes', () => {
    for (const s of STRATA) {
      expect(s.pool.length).toBeGreaterThan(0)
      for (const e of s.pool) {
        expect(e.weight).toBeGreaterThan(0)
        expect(KNOWN_KINDS).toContain(e.kind)
      }
      expect(s.waveMin).toBeGreaterThanOrEqual(1)
      expect(s.waveMax).toBeGreaterThanOrEqual(s.waveMin)
      expect(s.waveSizeBase).toBeGreaterThanOrEqual(1)
    }
  })

  it('le bestiaire s’enrichit avec la profondeur (types cumulés)', () => {
    for (let i = 1; i < STRATA.length; i++) {
      expect(STRATA[i].pool.length).toBeGreaterThanOrEqual(STRATA[i - 1].pool.length)
    }
    // La dernière strate mobilise TOUT le bestiaire.
    expect(STRATA[STRATA.length - 1].pool.length).toBe(KNOWN_KINDS.length)
  })

  it('palettes complètes (4 tons de pierre, accents définis)', () => {
    for (const s of STRATA) {
      expect(s.palette.stones).toHaveLength(4)
      for (const c of [...s.palette.stones, s.palette.wall, s.palette.wallEdge, s.palette.obstacle]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('isLastStratum repère la dernière', () => {
    expect(isLastStratum(0)).toBe(false)
    expect(isLastStratum(STRATA.length - 1)).toBe(true)
  })
})

describe('dungeonSeedFor — seeds de strate dérivées de la seed de run', () => {
  it('déterministe et distinct par strate', () => {
    const runSeed = 123456
    const seeds = STRATA.map((_, i) => dungeonSeedFor(runSeed, i))
    expect(seeds).toEqual(STRATA.map((_, i) => dungeonSeedFor(runSeed, i))) // stable
    expect(new Set(seeds).size).toBe(seeds.length) // distinct
    for (const s of seeds) expect(s).toBeGreaterThan(0)
  })

  it('produit des donjons valides à la taille demandée par la strate', () => {
    for (const [i, stratum] of STRATA.entries()) {
      const d = generateDungeon(dungeonSeedFor(777, i), stratum.rooms)
      expect(d.rooms.size).toBe(stratum.rooms)
      expect(d.rooms.get(d.bossId)?.type).toBe('boss')
    }
  })
})
