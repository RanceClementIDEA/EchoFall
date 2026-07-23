/**
 * STRATES de l'Abîme (GDD §2.3 / §6) — données pures, sans Phaser, testables.
 *
 * Une run traverse désormais PLUSIEURS strates : chaque Gardien vaincu ouvre
 * un gouffre de descente vers la suivante — la victoire finale n'arrive qu'au
 * bout de la dernière. Chaque strate est un MONDE : sa palette (environnement),
 * son bestiaire pondéré, son Gardien, ses pièges et sa difficulté.
 *
 * Ce module ne décide QUE des données ; la mise en scène (tileset teinté,
 * pièges, portail) vit dans systems/tileset.ts et scenes/GameplayScene.ts.
 */

import type { FoePoolEntry } from './waves'

/** Palette d'environnement d'une strate (habillage du donjon). */
export interface EnvPalette {
  /** Tons de pierre du sol (4 nuances, du plus sombre au plus clair). */
  stones: [number, number, number, number]
  wall: number
  /** Liseré de crête des murs (accent électrique de la strate). */
  wallEdge: number
  obstacle: number
  /** Lueur des runes ambiantes au sol. */
  runeGlow: number
  /** Flamme des appliques murales (corps + cœur clair). */
  torch: number
  torchCore: number
}

/** Configuration du Gardien d'une strate. */
export interface BossDef {
  /** 'gardien' = fonceur massif (classe Charger) ; sinon boss à patterns. */
  kind: 'gardien' | 'alpha' | 'avatar'
  name: string
  hp: number
  contactDamage: number
}

export type HazardKind = 'none' | 'spores' | 'braises'

/** Une strate de l'Abîme : monde, bestiaire, Gardien, difficulté. */
export interface StratumDef {
  /** Identifiant court (suffixe des clés de texture, noms d'assets env-*). */
  id: string
  name: string
  /** Nombre de salles du donjon de cette strate. */
  rooms: number
  /** Bestiaire pondéré des vagues. */
  pool: readonly FoePoolEntry[]
  /** Bornes du nombre de vagues par salle de combat. */
  waveMin: number
  waveMax: number
  /** Taille de la première vague (puis +1 par vague). */
  waveSizeBase: number
  boss: BossDef
  /** Pièges d'ambiance des salles de combat. */
  hazard: HazardKind
  /** PV supplémentaires de chaque ennemi de vague. */
  foeHpBonus: number
  /** Multiplicateur de vitesse des ennemis de vague. */
  foeSpeedMul: number
  palette: EnvPalette
}

/**
 * Les strates, de la surface vers le fond. L'ordre EST la progression.
 * Difficulté croissante sur tous les axes : salles, bestiaire, vagues,
 * PV/vitesse, pièges — et un Gardien plus retors à chaque fois.
 */
export const STRATA: readonly StratumDef[] = [
  {
    id: 'ardoise',
    name: 'Failles d’Ardoise',
    rooms: 7,
    pool: [
      { kind: 'charger', weight: 55 },
      { kind: 'shooter', weight: 35 },
      { kind: 'orbiter', weight: 10 },
    ],
    waveMin: 2,
    waveMax: 3,
    waveSizeBase: 2,
    boss: { kind: 'gardien', name: 'GARDIEN DE LA STRATE', hp: 24, contactDamage: 2 },
    hazard: 'none',
    foeHpBonus: 0,
    foeSpeedMul: 1,
    palette: {
      stones: [0x221c30, 0x29233a, 0x252038, 0x2b2338],
      wall: 0x3a3152,
      wallEdge: 0x8257cf,
      obstacle: 0x322a46,
      runeGlow: 0xffc24a,
      torch: 0xff8a2e,
      torchCore: 0xffe08a,
    },
  },
  {
    id: 'fonge',
    name: 'Jardins Fongiques',
    rooms: 9,
    pool: [
      { kind: 'charger', weight: 25 },
      { kind: 'shooter', weight: 25 },
      { kind: 'orbiter', weight: 25 },
      { kind: 'splitter', weight: 25 },
    ],
    waveMin: 2,
    waveMax: 4,
    waveSizeBase: 3,
    boss: { kind: 'alpha', name: 'CRACHEUR ALPHA', hp: 34, contactDamage: 1 },
    hazard: 'spores',
    foeHpBonus: 1,
    foeSpeedMul: 1.1,
    palette: {
      stones: [0x18251e, 0x1e2e25, 0x1b2921, 0x213329],
      wall: 0x2b4638,
      wallEdge: 0x3fe0a0,
      obstacle: 0x25392e,
      runeGlow: 0x7dffc9,
      torch: 0x59f2c2,
      torchCore: 0xdcffee,
    },
  },
  {
    id: 'fournaise',
    name: 'Fournaise des Profondeurs',
    rooms: 11,
    pool: [
      { kind: 'charger', weight: 15 },
      { kind: 'shooter', weight: 18 },
      { kind: 'orbiter', weight: 20 },
      { kind: 'splitter', weight: 15 },
      { kind: 'bomber', weight: 17 },
      { kind: 'sentinel', weight: 15 },
    ],
    waveMin: 3,
    waveMax: 4,
    waveSizeBase: 3,
    boss: { kind: 'avatar', name: 'AVATAR DE L’ABÎME', hp: 46, contactDamage: 2 },
    hazard: 'braises',
    foeHpBonus: 2,
    foeSpeedMul: 1.2,
    palette: {
      stones: [0x2a1a16, 0x33201a, 0x2e1c17, 0x38231c],
      wall: 0x4a2c24,
      wallEdge: 0xff7a3c,
      obstacle: 0x3a2620,
      runeGlow: 0xffb03c,
      torch: 0xff6a1e,
      torchCore: 0xffd28a,
    },
  },
] as const

/** Dernière strate ? (le Gardien y est le boss FINAL de la run.) */
export function isLastStratum(index: number): boolean {
  return index >= STRATA.length - 1
}

/**
 * Seed du donjon d'une strate, dérivée de la seed de RUN : déterministe
 * (`?seed=n` reproduit toute la descente) et distincte par strate.
 */
export function dungeonSeedFor(runSeed: number, stratumIndex: number): number {
  const s = (runSeed ^ Math.imul(stratumIndex + 1, 0x9e3779b9)) >>> 0
  return s === 0 ? 1 : s
}
