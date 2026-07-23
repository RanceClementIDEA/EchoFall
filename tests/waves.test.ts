import { describe, it, expect } from 'vitest'
import { Rng } from '../src/core/rng'
import { planWaves, weightedFoe, type FoePoolEntry } from '../src/core/waves'

const POINTS = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 300, y: 100 },
  { x: 100, y: 200 },
  { x: 200, y: 200 },
  { x: 300, y: 200 },
]
const POOL: FoePoolEntry[] = [
  { kind: 'charger', weight: 50 },
  { kind: 'shooter', weight: 30 },
  { kind: 'orbiter', weight: 20 },
]

describe('planWaves — plan de combat pur et seedé', () => {
  const opts = { pool: POOL, waveMin: 2, waveMax: 3, sizeBase: 2 }

  it('respecte les bornes de vagues et la taille croissante', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const waves = planWaves(new Rng(seed), POINTS, opts)
      expect(waves.length).toBeGreaterThanOrEqual(2)
      expect(waves.length).toBeLessThanOrEqual(3)
      waves.forEach((wave, w) => {
        expect(wave.length).toBe(Math.min(2 + w, POINTS.length))
      })
    }
  })

  it('ne tire que des types du bestiaire, sur des points distincts par vague', () => {
    const waves = planWaves(new Rng(42), POINTS, opts)
    for (const wave of waves) {
      const seen = new Set(wave.map((s) => `${s.x},${s.y}`))
      expect(seen.size).toBe(wave.length) // pas deux ennemis au même point
      for (const s of wave) expect(['charger', 'shooter', 'orbiter']).toContain(s.kind)
    }
  })

  it('est déterministe par seed', () => {
    expect(planWaves(new Rng(7), POINTS, opts)).toEqual(planWaves(new Rng(7), POINTS, opts))
    // ...et varie selon la seed (au moins une différence sur 10 essais).
    const a = JSON.stringify(planWaves(new Rng(1), POINTS, opts))
    const anyDiff = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(
      (s) => JSON.stringify(planWaves(new Rng(s), POINTS, opts)) !== a,
    )
    expect(anyDiff).toBe(true)
  })

  it('borne la taille des vagues au nombre de points disponibles', () => {
    const few = POINTS.slice(0, 2)
    const waves = planWaves(new Rng(3), few, { ...opts, sizeBase: 4 })
    for (const wave of waves) expect(wave.length).toBeLessThanOrEqual(2)
  })
})

describe('weightedFoe — tirage pondéré', () => {
  it('suit approximativement les poids (loi des grands nombres)', () => {
    const rng = new Rng(99)
    const counts: Record<string, number> = { charger: 0, shooter: 0, orbiter: 0 }
    for (let i = 0; i < 3000; i++) counts[weightedFoe(rng, POOL)]++
    expect(counts.charger).toBeGreaterThan(counts.shooter)
    expect(counts.shooter).toBeGreaterThan(counts.orbiter)
    expect(counts.orbiter).toBeGreaterThan(0)
  })
})
