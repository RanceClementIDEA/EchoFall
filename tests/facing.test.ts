import { describe, it, expect } from 'vitest'
import { turnFrameForAngle } from '../src/core/facing'

const PI = Math.PI
// Angles à l'écran (Y vers le bas) : 0 = Est, +horaire.
const EAST = 0
const SOUTH = PI / 2
const WEST = PI
const NORTH = -PI / 2
const SOUTH_EAST = PI / 4
const NORTH_EAST = -PI / 4

describe('turnFrameForAngle — feuille de rotation (frame = direction)', () => {
  it('8 frames, ordre E,SE,S,SW,W,NW,N,NE (défaut) : chaque cardinale tombe juste', () => {
    expect(turnFrameForAngle(EAST, 8)).toBe(0)
    expect(turnFrameForAngle(SOUTH_EAST, 8)).toBe(1)
    expect(turnFrameForAngle(SOUTH, 8)).toBe(2)
    expect(turnFrameForAngle(WEST, 8)).toBe(4)
    expect(turnFrameForAngle(NORTH, 8)).toBe(6)
    expect(turnFrameForAngle(NORTH_EAST, 8)).toBe(7)
  })

  it('reste toujours dans [0, frameCount-1] (bouclage propre)', () => {
    for (let a = -10; a <= 10; a += 0.3) {
      const i = turnFrameForAngle(a, 8)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(8)
      expect(Number.isInteger(i)).toBe(true)
    }
  })

  it('décalage : si la frame 0 regarde le SUD (offset 2), l’Est passe en frame 6', () => {
    expect(turnFrameForAngle(SOUTH, 8, 2)).toBe(0)
    expect(turnFrameForAngle(EAST, 8, 2)).toBe(6)
  })

  it('sens anti-horaire inverse la rotation', () => {
    expect(turnFrameForAngle(SOUTH, 8, 0, false)).toBe(6) // au lieu de 2
    expect(turnFrameForAngle(NORTH, 8, 0, false)).toBe(2) // au lieu de 6
  })

  it('4 directions (cardinales) : E=0, S=1, W=2, N=3', () => {
    expect(turnFrameForAngle(EAST, 4)).toBe(0)
    expect(turnFrameForAngle(SOUTH, 4)).toBe(1)
    expect(turnFrameForAngle(WEST, 4)).toBe(2)
    expect(turnFrameForAngle(NORTH, 4)).toBe(3)
  })

  it('une seule frame (image statique) : toujours 0', () => {
    expect(turnFrameForAngle(SOUTH, 1)).toBe(0)
    expect(turnFrameForAngle(NORTH, 0)).toBe(0)
  })
})
