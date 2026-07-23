/**
 * Planification des VAGUES de combat — logique pure, sans Phaser, testable.
 *
 * Le Spawner (systems/Spawner.ts) ne fait que DÉROULER un plan calculé ici :
 * quelles vagues, quels ennemis, à quels points d'apparition. Déterministe par
 * RNG seedé (même salle = mêmes vagues), paramétré par la STRATE courante
 * (core/strata.ts) : composition du bestiaire et taille des vagues.
 */

import type { Rng } from './rng'

/** Types d'ennemis pouvant apparaître en vague (hors boss et Écho). */
export type FoeKind = 'charger' | 'shooter' | 'orbiter' | 'splitter' | 'bomber' | 'sentinel'

/** Un ennemi à faire apparaître : son type et sa position. */
export interface SpawnSpec {
  kind: FoeKind
  x: number
  y: number
}

/** Entrée pondérée d'un bestiaire de strate. */
export interface FoePoolEntry {
  kind: FoeKind
  weight: number
}

export interface WavePlanOpts {
  /** Bestiaire pondéré de la strate (somme des poids libre). */
  pool: readonly FoePoolEntry[]
  /** Nombre de vagues, tiré dans [waveMin, waveMax]. */
  waveMin: number
  waveMax: number
  /** Taille de la 1re vague (puis +1 par vague, borné par les points). */
  sizeBase: number
}

/** Tirage pondéré d'un type d'ennemi dans le bestiaire. */
export function weightedFoe(rng: Rng, pool: readonly FoePoolEntry[]): FoeKind {
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let r = rng.next() * total
  for (const entry of pool) {
    r -= entry.weight
    if (r < 0) return entry.kind
  }
  return pool[pool.length - 1].kind
}

/**
 * Planifie les vagues d'une salle de combat : `waveMin..waveMax` vagues de
 * difficulté croissante (taille `sizeBase`, +1 par vague), chaque ennemi tiré
 * au poids dans le bestiaire et posé sur un point d'apparition DISTINCT de sa
 * vague. Déterministe : mêmes entrées → même plan.
 */
export function planWaves(
  rng: Rng,
  spawnPoints: readonly { x: number; y: number }[],
  opts: WavePlanOpts,
): SpawnSpec[][] {
  const waveCount = rng.int(opts.waveMin, opts.waveMax)
  const waves: SpawnSpec[][] = []
  for (let w = 0; w < waveCount; w++) {
    const size = Math.min(opts.sizeBase + w, spawnPoints.length)
    const points = pickDistinct(rng, spawnPoints, size)
    waves.push(points.map((p) => ({ kind: weightedFoe(rng, opts.pool), x: p.x, y: p.y })))
  }
  return waves
}

/** Tire `n` points distincts (seedés) dans la liste. */
function pickDistinct(
  rng: Rng,
  points: readonly { x: number; y: number }[],
  n: number,
): { x: number; y: number }[] {
  const pool = [...points]
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}
