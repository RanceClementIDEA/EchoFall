import type { Item, PassiveItem, ActiveItem } from './types'

/**
 * Registre des objets — LE point d'extension du jeu.
 *
 * Ajouter un objet = ajouter une entrée ici. Un passif décrit sa mutation de
 * stats dans `apply`, un actif son effet dans `activate`. Aucune autre partie
 * du code n'a besoin de changer : la salle trésor tire dans ce registre, et le
 * moteur applique/déclenche les objets de façon générique.
 */

export const PASSIVE_ITEMS: PassiveItem[] = [
  {
    id: 'swift-boots',
    name: 'Bottes véloces',
    description: '+10% de vitesse',
    kind: 'passive',
    apply: (c) => {
      c.stats.speed *= 1.1
    },
  },
  {
    id: 'split-shot',
    name: 'Éclat scindé',
    description: '+1 projectile par tir',
    kind: 'passive',
    unlockCost: 60,
    apply: (c) => {
      c.stats.projectileCount += 1
    },
  },
  {
    id: 'lumen-heart',
    name: 'Cœur de Lumen',
    description: '+1 cœur max',
    kind: 'passive',
    apply: (c) => {
      c.stats.maxHp += 1
      c.heal(1)
    },
  },
  {
    id: 'sharp-shard',
    name: 'Éclat aiguisé',
    description: '+1 dégât',
    kind: 'passive',
    unlockCost: 50,
    apply: (c) => {
      c.stats.damage += 1
    },
  },
  {
    id: 'quick-draw',
    name: 'Gâchette vive',
    description: '+25% de cadence de tir',
    kind: 'passive',
    unlockCost: 70,
    apply: (c) => {
      c.stats.fireRate *= 1.25
    },
  },
]

export const ACTIVE_ITEMS: ActiveItem[] = [
  {
    id: 'mend',
    name: 'Prière de Lumen',
    description: 'Actif : rend 2 PV',
    kind: 'active',
    chargeMax: 6,
    activate: (c) => {
      c.heal(2)
    },
  },
  {
    id: 'nova',
    name: "Onde de l'Abîme",
    description: 'Actif : blesse tous les ennemis',
    kind: 'active',
    unlockCost: 90,
    chargeMax: 8,
    activate: (c) => {
      c.damageAllEnemies?.(3)
    },
  },
]

/** Tous les objets, pour le tirage en salle trésor. */
export const ALL_ITEMS: Item[] = [...PASSIVE_ITEMS, ...ACTIVE_ITEMS]

/** Objets disponibles pour une run : gratuits d'emblée OU débloqués. */
export function availableItems(unlockedIds: readonly string[]): Item[] {
  return ALL_ITEMS.filter((i) => (i.unlockCost ?? 0) === 0 || unlockedIds.includes(i.id))
}

/** Objets encore verrouillés (à débloquer dans le menu principal). */
export function lockedItems(unlockedIds: readonly string[]): Item[] {
  return ALL_ITEMS.filter((i) => (i.unlockCost ?? 0) > 0 && !unlockedIds.includes(i.id))
}
