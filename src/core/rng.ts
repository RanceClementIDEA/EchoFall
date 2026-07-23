/**
 * RNG seedé (mulberry32) — aucune dépendance.
 *
 * Toute la génération procédurale passe par cette classe : une même seed
 * produit toujours le même donjon, les mêmes ennemis, les mêmes reliques.
 * Indispensable pour reproduire un bug ("seed 123, salle 2,1") et pour
 * tester le générateur unitairement.
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    // >>> 0 force un uint32 ; 0 est remplacé (mulberry32 y resterait bloqué).
    this.s = seed >>> 0 || 0x9e3779b9
  }

  /** Nombre pseudo-aléatoire dans [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Élément aléatoire d'un tableau non vide. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** Vrai avec une probabilité p (0..1). */
  chance(p: number): boolean {
    return this.next() < p
  }
}
