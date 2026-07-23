import { describe, it, expect } from 'vitest'
import {
  PASSIVE_ITEMS,
  ACTIVE_ITEMS,
  ALL_ITEMS,
  availableItems,
  lockedItems,
} from '../src/items/registry'
import { BASE_STATS, type PlayerStats } from '../src/core/stats'
import type { PassiveItem, ActiveItem } from '../src/items/types'

const passive = (id: string): PassiveItem => PASSIVE_ITEMS.find((i) => i.id === id)!
const active = (id: string): ActiveItem => ACTIVE_ITEMS.find((i) => i.id === id)!
const freshStats = (): PlayerStats => ({ ...BASE_STATS })

describe('objets passifs — mutations de stats', () => {
  it('Bottes véloces : +10% de vitesse', () => {
    const stats = freshStats()
    passive('swift-boots').apply({ stats, heal: () => {} })
    expect(stats.speed).toBeCloseTo(BASE_STATS.speed * 1.1)
  })

  it('Éclat scindé : +1 projectile', () => {
    const stats = freshStats()
    passive('split-shot').apply({ stats, heal: () => {} })
    expect(stats.projectileCount).toBe(BASE_STATS.projectileCount + 1)
  })

  it('Cœur de Lumen : +1 PV max et soigne de 1', () => {
    const stats = freshStats()
    let healed = 0
    passive('lumen-heart').apply({ stats, heal: (n) => (healed += n) })
    expect(stats.maxHp).toBe(BASE_STATS.maxHp + 1)
    expect(healed).toBe(1)
  })

  it('Éclat aiguisé : +1 dégât', () => {
    const stats = freshStats()
    passive('sharp-shard').apply({ stats, heal: () => {} })
    expect(stats.damage).toBe(BASE_STATS.damage + 1)
  })

  it('Gâchette vive : +25% de cadence', () => {
    const stats = freshStats()
    passive('quick-draw').apply({ stats, heal: () => {} })
    expect(stats.fireRate).toBeCloseTo(BASE_STATS.fireRate * 1.25)
  })

  it('cumul : appliquer deux fois Éclat scindé donne 3 projectiles', () => {
    const stats = freshStats()
    passive('split-shot').apply({ stats, heal: () => {} })
    passive('split-shot').apply({ stats, heal: () => {} })
    expect(stats.projectileCount).toBe(3)
  })
})

describe('objets actifs — effets', () => {
  it('Prière de Lumen : rend 2 PV', () => {
    let healed = 0
    active('mend').activate({ stats: freshStats(), heal: (n) => (healed += n) })
    expect(healed).toBe(2)
  })

  it("Onde de l'Abîme : inflige 3 dégâts à tous les ennemis", () => {
    let dmg = -1
    active('nova').activate({
      stats: freshStats(),
      heal: () => {},
      damageAllEnemies: (n) => (dmg = n),
    })
    expect(dmg).toBe(3)
  })

  it('tous les actifs ont une charge max > 0', () => {
    for (const a of ACTIVE_ITEMS) expect(a.chargeMax).toBeGreaterThan(0)
  })
})

describe('registre', () => {
  it('ids uniques et kind cohérent', () => {
    const ids = ALL_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of PASSIVE_ITEMS) expect(i.kind).toBe('passive')
    for (const i of ACTIVE_ITEMS) expect(i.kind).toBe('active')
  })
})

describe('déblocage des objets', () => {
  it('sans déblocage : starters disponibles, payants verrouillés', () => {
    const avail = availableItems([]).map((i) => i.id)
    expect(avail).toContain('swift-boots') // gratuit d'emblée
    expect(avail).not.toContain('split-shot') // payant
    const locked = lockedItems([]).map((i) => i.id)
    expect(locked).toContain('split-shot')
    expect(locked).not.toContain('swift-boots')
  })

  it('un id débloqué rejoint le pool disponible', () => {
    expect(availableItems(['split-shot']).map((i) => i.id)).toContain('split-shot')
    expect(lockedItems(['split-shot']).map((i) => i.id)).not.toContain('split-shot')
  })
})
