/**
 * Échos (GDD §5.3) — **logique pure**, sans Phaser, donc testable au même
 * titre que le générateur de donjon et le RNG.
 *
 * L'Abîme se souvient de l'ENDROIT de chaque mort : un Écho enregistré hante
 * une **cellule de grille** (`roomId = "gx,gy"`), pas une strate précise. Une
 * descente future qui régénère cette cellule en salle de combat y fait
 * resurgir le revenant. Comme les cellules proches du départ reviennent d'une
 * seed à l'autre, les Échos ressurgissent réellement — sans jamais garantir
 * qu'une mort donnée retombe pile sur la même descente (« les descentes
 * suivantes PEUVENT retomber dessus »).
 *
 * Ce module ne décide QUE des données (placement, calibrage, butin). La mise
 * en scène du revenant (entité, combat, recueillement) vit dans
 * `entities/Echo.ts` et `scenes/GameplayScene.ts`.
 */

import type { Dungeon } from '../dungeon/types'
import type { EchoRecord } from './meta'
import type { PlayerStats } from './stats'
import type { LootKind } from '../systems/loot'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Nombre maximum d'Échos actifs simultanément dans une même descente. */
export const MAX_ACTIVE_ECHOES = 2

/** Un Écho placé dans la descente courante : quelle cellule il hante. */
export interface EchoPlacement {
  /** Cellule hantée du donjon courant (== `echo.roomId`, explicité). */
  roomId: string
  echo: EchoRecord
}

/**
 * Décide quels Échos hantent une descente donnée — **déterministe** : dépend
 * uniquement du donjon (ses cellules) et de la liste d'Échos, jamais de
 * l'horloge.
 *
 * Un Écho hante sa cellule si le donjon courant contient CETTE cellule en
 * salle de **combat** encore hostile (jamais le départ, le trésor ni le
 * Gardien — leur rôle prime). Au plus un Écho par cellule et
 * {@link MAX_ACTIVE_ECHOES} au total ; la liste étant « plus récent en tête »,
 * ce sont les morts les plus récentes qui reprennent leur place en priorité.
 */
export function placeEchoes(
  dungeon: Dungeon,
  echoes: readonly EchoRecord[],
  maxActive: number = MAX_ACTIVE_ECHOES,
): EchoPlacement[] {
  const placed: EchoPlacement[] = []
  const taken = new Set<string>()
  for (const echo of echoes) {
    if (placed.length >= maxActive) break
    if (taken.has(echo.roomId)) continue // une seule trace par cellule
    const room = dungeon.rooms.get(echo.roomId)
    if (!room || room.type !== 'combat' || room.cleared) continue
    taken.add(echo.roomId)
    placed.push({ roomId: echo.roomId, echo })
  }
  return placed
}

/**
 * « Force » d'un plongeur au moment de sa mort, dérivée de ses statistiques et
 * de ses objets — capacité offensive × survie + bonus d'équipement. Bornée
 * pour que le revenant reste lisible et jamais infaisable. Un plongeur de base
 * (aucun objet) vaut ~11.
 */
export function echoPowerFrom(stats: PlayerStats, passiveItems: readonly string[]): number {
  const raw = stats.damage * 2 + stats.maxHp + stats.fireRate + passiveItems.length * 2
  return Math.round(clamp(raw, 4, 40))
}

/** Profil de combat d'un revenant, calibré sur l'étage et la force du plongeur. */
export interface EchoCombatStats {
  hp: number
  /** Dégâts de contact UNE FOIS éveillé (0 tant qu'il est en sommeil). */
  contactDamage: number
  projectileDamage: number
  projectileSpeed: number
  fireCooldownMs: number
  moveSpeed: number
  minRange: number
  maxRange: number
  /** Vitesse de la ruée télégraphiée (écho du dash du joueur). */
  lungeSpeed: number
  lungeCooldownMs: number
}

/**
 * Calibre le revenant : coriace comme un mini-boss, à la mesure de l'étage
 * atteint et de la force du plongeur tombé — mais toujours **borné** (dégâts
 * contenus, cadence esquivable) : le joueur garde ses i-frames et son dash.
 */
export function echoCombatStats(echo: EchoRecord): EchoCombatStats {
  const floor = Math.max(1, echo.floor)
  const power = clamp(echo.power, 4, 40)
  return {
    hp: Math.round(clamp(10 + power * 0.7 + (floor - 1) * 4, 12, 64)),
    contactDamage: floor >= 5 ? 2 : 1,
    projectileDamage: floor >= 4 ? 2 : 1,
    projectileSpeed: Math.round(clamp(280 + (floor - 1) * 18, 280, 420)),
    fireCooldownMs: Math.round(clamp(1200 - (floor - 1) * 90, 620, 1200)),
    moveSpeed: Math.round(clamp(120 + (floor - 1) * 8, 120, 190)),
    minRange: 165,
    maxRange: 320,
    lungeSpeed: Math.round(clamp(360 + (floor - 1) * 20, 360, 520)),
    lungeCooldownMs: 2600,
  }
}

/**
 * Butin lâché par un Écho vaincu — **garanti et bonifié** (GDD §5.3) : un cœur
 * et une clé d'office, les Éclats emportés dans la mort restitués (bornés),
 * puis une prime de profondeur. Renvoie toujours au moins un cœur.
 */
export function echoLoot(echo: EchoRecord): LootKind[] {
  const floor = Math.max(1, echo.floor)
  const drops: LootKind[] = ['heart', 'key']
  const coins = clamp(2 + Math.floor(Math.max(0, echo.shards) / 3) + Math.floor(floor / 2), 2, 8)
  for (let i = 0; i < coins; i++) drops.push('coin')
  if (floor >= 3) drops.push('heart')
  if (floor >= 4) drops.push('bomb')
  return drops
}

/**
 * Coût en Éclats de Lumen pour **se recueillir** auprès d'un Écho plutôt que
 * de l'affronter (GDD §5.3 : « un soutien temporaire contre un peu de
 * Lumen »). Croît avec l'étage, borné.
 */
export function communeCost(echo: EchoRecord): number {
  return clamp(3 + Math.max(1, echo.floor), 4, 12)
}
