/**
 * Statistiques du joueur (GDD §3) — des DONNÉES, pas des constantes codées
 * en dur dans les entités : les objets (in-run) et le Sanctuaire (permanent)
 * les modifient librement.
 */
export interface PlayerStats {
  /** PV max (orbes de Lumen). */
  maxHp: number
  /** Vitesse de déplacement max (px/s). */
  speed: number
  /** Dégâts par projectile. */
  damage: number
  /** Cadence de tir (projectiles/seconde). */
  fireRate: number
  /** Vitesse des projectiles (px/s). */
  projectileSpeed: number
  /** Nombre de projectiles par tir (tirs multiples). */
  projectileCount: number
  /** Écart angulaire entre projectiles quand il y en a plusieurs (degrés). */
  spreadDeg: number
  /** Délai entre deux dashes (ms). */
  dashCooldownMs: number
  /** Probabilité de coup critique par projectile (0..1). */
  critChance: number
  /** Multiplicateur de dégâts d'un critique. */
  critMult: number
}

/** Valeurs de base d'une run, avant méta et objets. */
export const BASE_STATS: PlayerStats = {
  maxHp: 6,
  speed: 240,
  damage: 1,
  fireRate: 3.2,
  projectileSpeed: 520,
  projectileCount: 1,
  spreadDeg: 9,
  dashCooldownMs: 600,
  critChance: 0.1,
  critMult: 2,
}
