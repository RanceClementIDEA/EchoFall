import { Rng } from '../core/rng'

/** Types d'objets lâchés par les ennemis. */
export type LootKind = 'coin' | 'heart' | 'key' | 'bomb'

/** Probabilité qu'un ennemi normal lâche quelque chose. */
const DROP_CHANCE = 0.6

/** Poids relatifs de chaque type quand un drop a lieu (somme libre). */
const DROP_TABLE: { kind: LootKind; weight: number }[] = [
  { kind: 'coin', weight: 58 }, // fréquent : la monnaie de base
  { kind: 'heart', weight: 14 }, // soin, plus rare
  { kind: 'key', weight: 13 },
  { kind: 'bomb', weight: 15 },
]

/** Tirage pondéré d'un type dans la table. */
function weightedPick(rng: Rng, table: { kind: LootKind; weight: number }[]): LootKind {
  const total = table.reduce((s, e) => s + e.weight, 0)
  let r = rng.next() * total
  for (const entry of table) {
    r -= entry.weight
    if (r < 0) return entry.kind
  }
  return table[table.length - 1].kind
}

/**
 * Décide du butin lâché par un ennemi qui meurt.
 * • Ennemi normal : `DROP_CHANCE` de lâcher un objet, dont le type est tiré
 *   dans `DROP_TABLE`.
 * • Boss : butin garanti, généreux et varié.
 *
 * Renvoie la liste des objets à faire apparaître (souvent 0 ou 1 pour un
 * ennemi normal, plusieurs pour un boss).
 */
export function rollDrops(rng: Rng, isBoss: boolean): LootKind[] {
  if (isBoss) {
    return ['heart', 'heart', 'key', 'coin', 'coin', 'coin']
  }
  if (!rng.chance(DROP_CHANCE)) return []
  return [weightedPick(rng, DROP_TABLE)]
}
