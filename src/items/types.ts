import type { PlayerStats } from '../core/stats'

/**
 * Contexte fourni à un objet quand il s'applique (passif) ou s'active (actif).
 *
 * Les objets passifs n'ont besoin que de `stats` et `heal`. Les objets actifs
 * peuvent en plus utiliser des « hooks » de scène (ex. blesser tous les
 * ennemis) — présents uniquement au moment de l'activation.
 */
export interface ItemContext {
  stats: PlayerStats
  heal: (amount: number) => void
  /** Hook de scène : inflige `amount` dégâts à tous les ennemis de la salle. */
  damageAllEnemies?: (amount: number) => void
}

interface BaseItem {
  id: string
  name: string
  description: string
  /** Coût de déblocage en Fragments (0 / absent = disponible d'emblée). */
  unlockCost?: number
}

/**
 * Objet PASSIF : s'applique une fois, à l'acquisition, et modifie durablement
 * les statistiques (vitesse, dégâts, projectiles, PV max…).
 */
export interface PassiveItem extends BaseItem {
  kind: 'passive'
  apply: (ctx: ItemContext) => void
}

/**
 * Objet ACTIF : déclenché par le joueur (touche F), rechargeable — on gagne
 * une charge par ennemi tué, et l'effet se déclenche à pleine charge.
 */
export interface ActiveItem extends BaseItem {
  kind: 'active'
  /** Nombre de charges (kills) nécessaires pour l'utiliser. */
  chargeMax: number
  activate: (ctx: ItemContext) => void
}

export type Item = PassiveItem | ActiveItem
