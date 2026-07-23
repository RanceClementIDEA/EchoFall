import { BASE_STATS, type PlayerStats } from '../core/stats'
import { addFragments, loadMeta, recordEcho, forgetEcho, type EchoRecord } from '../core/meta'
import { placeEchoes, echoPowerFrom } from '../core/echoes'
import { STRATA, dungeonSeedFor, isLastStratum, type StratumDef } from '../core/strata'
import { generateDungeon } from '../dungeon/DungeonGenerator'
import type { Dungeon, RoomNode } from '../dungeon/types'
import type { Item, ActiveItem } from '../items/types'
import type { Outcome, RunSummary } from './GameState'

/** Bonus de Fragments par Écho apaisé (vaincu ou recueilli) — GDD §5.1. */
const ECHO_FRAGMENT_BONUS = 20
/** Bonus de Fragments par Gardien vaincu (un par strate) — GDD §5.1. */
const BOSS_FRAGMENT_BONUS = 40

/**
 * RunState — l'état d'UNE run (GDD §4, permadeath).
 *
 * Vit en dehors des scènes Phaser : il survit aux `scene.restart` (changement
 * de salle) mais est intégralement réinitialisé par `newRun()` — c'est la
 * matérialisation du permadeath. Ce qui doit survivre à la mort passe par
 * `core/meta.ts` (localStorage), jamais par ici.
 */
class RunState {
  stats: PlayerStats = { ...BASE_STATS }
  hp = BASE_STATS.maxHp
  shards = 0
  keys = 0
  bombs = 0

  /** Objets passifs acquis (ids) — pour l'affichage/bilan. */
  passiveItems: string[] = []
  /** Objet actif tenu (un seul à la fois, à la Isaac) + sa charge courante. */
  activeItem: ActiveItem | null = null
  activeCharge = 0

  dungeon: Dungeon | null = null
  currentRoomId = ''
  visited = new Set<string>()

  /** Seed de la RUN entière (les seeds de strate en dérivent — reproductible). */
  private runSeed = 1
  /** Index de la strate courante (0 = surface de l'Abîme). */
  stratumIndex = 0
  /** Salles explorées / totales des strates DÉJÀ quittées (cumul du bilan). */
  private roomsExploredPrev = 0
  private totalRoomsPrev = 0
  /** Gardiens vaincus durant la run (un par strate traversée). */
  bossesDefeated = 0

  /**
   * Échos qui hantent CETTE descente : `roomId` → trace de la mort. Calculé au
   * lancement (positionnel, déterministe — cf. `core/echoes.placeEchoes`) et
   * vidé à chaque nouvelle run. La scène interroge {@link echoInRoom} en
   * construisant une salle, et appelle {@link banishEcho} quand le revenant est
   * apaisé.
   */
  activeEchoes = new Map<string, EchoRecord>()

  /** Statistiques de run (pour les écrans de pause et de fin). */
  enemiesKilled = 0
  /** Échos apaisés (vaincus ou recueillis) durant la run. */
  echoesBanished = 0
  /** Profondeur (BFS) de la salle la plus profonde visitée. */
  depthReached = 0
  private startedAt = 0
  private durationMs = 0

  private finished = false
  private lastSummary: RunSummary | null = null

  /**
   * Démarre une run neuve : stats de base + bonus permanents du Sanctuaire,
   * donjon régénéré (nouvelle seed — l'ancien est définitivement perdu).
   * En debug, `?seed=n` force la seed pour reproduire une descente.
   */
  newRun(): void {
    const meta = loadMeta()
    this.stats = { ...BASE_STATS, maxHp: BASE_STATS.maxHp + meta.bonusHp }
    this.hp = this.stats.maxHp
    this.shards = 0
    this.keys = 0
    this.bombs = 0
    this.passiveItems = []
    this.activeItem = null
    this.activeCharge = 0
    this.enemiesKilled = 0
    this.echoesBanished = 0
    this.depthReached = 0
    this.startedAt = Date.now()
    this.durationMs = 0
    this.finished = false
    this.lastSummary = null

    const urlSeed = Number(new URLSearchParams(location.search).get('seed'))
    this.runSeed =
      Number.isInteger(urlSeed) && urlSeed > 0
        ? urlSeed
        : Math.floor(Math.random() * 2 ** 31)
    this.roomsExploredPrev = 0
    this.totalRoomsPrev = 0
    this.bossesDefeated = 0
    this.enterStratum(0)
  }

  /** Strate courante (monde, bestiaire, Gardien, palette). */
  get stratum(): StratumDef {
    return STRATA[this.stratumIndex]
  }

  /** Le Gardien courant est-il le boss FINAL de la run ? */
  get onLastStratum(): boolean {
    return isLastStratum(this.stratumIndex)
  }

  /** Comptabilise un Gardien vaincu (bonus de Fragments au bilan). */
  defeatBoss(): void {
    this.bossesDefeated += 1
  }

  /**
   * Descente : le Gardien est tombé, on s'enfonce d'une strate. Le bilan des
   * salles est CUMULÉ avant de régénérer ; PV, stats, objets et butin de la
   * run TRAVERSENT la descente (c'est toute la tension de la boucle run).
   */
  descend(): void {
    this.roomsExploredPrev += this.visited.size
    this.totalRoomsPrev += this.dungeon?.rooms.size ?? 0
    this.enterStratum(this.stratumIndex + 1)
  }

  /**
   * Entre dans une strate : donjon régénéré (seed dérivée de la run —
   * reproductible), et les Échos DE CETTE STRATE reprennent leur place (l'Abîme
   * se souvient de la strate ET de la cellule de chaque mort — GDD §4).
   */
  private enterStratum(index: number): void {
    this.stratumIndex = Math.min(index, STRATA.length - 1)
    const def = STRATA[this.stratumIndex]
    this.dungeon = generateDungeon(dungeonSeedFor(this.runSeed, this.stratumIndex), def.rooms)
    this.currentRoomId = this.dungeon.startId
    this.visited = new Set([this.currentRoomId])

    const floor = this.stratumIndex + 1
    this.activeEchoes = new Map()
    const hauntingHere = loadMeta().echoes.filter((e) => e.floor === floor)
    for (const p of placeEchoes(this.dungeon, hauntingHere)) {
      this.activeEchoes.set(p.roomId, p.echo)
    }
  }

  /** L'Écho (revenant) qui hante la salle donnée, s'il y en a un. */
  echoInRoom(roomId: string): EchoRecord | null {
    return this.activeEchoes.get(roomId) ?? null
  }

  /**
   * Apaise l'Écho d'une salle — vaincu au combat ou recueilli : il quitte la
   * descente courante ET la sauvegarde (il ne resurgira plus), et compte pour
   * le bilan/les Fragments.
   */
  banishEcho(roomId: string): void {
    if (!this.activeEchoes.has(roomId)) return
    this.activeEchoes.delete(roomId)
    this.echoesBanished += 1
    forgetEcho(roomId)
  }

  /** Dépense des Éclats de Lumen (recueillement…). Vrai si le solde suffisait. */
  spendShards(amount: number): boolean {
    if (this.shards < amount) return false
    this.shards -= amount
    return true
  }

  /** Salle courante (lève si aucune run n'est en cours — bug de flux). */
  get currentRoom(): RoomNode {
    const room = this.dungeon?.rooms.get(this.currentRoomId)
    if (!room) throw new Error('RunState: aucune run en cours')
    return room
  }

  /** Déplacement vers une salle voisine (franchissement de porte). */
  moveTo(nextRoomId: string): void {
    this.currentRoomId = nextRoomId
    this.visited.add(nextRoomId)
    const room = this.dungeon?.rooms.get(nextRoomId)
    if (room) this.depthReached = Math.max(this.depthReached, room.depth)
  }

  /** Comptabilise un ennemi vaincu (stat de run). */
  killEnemy(): void {
    this.enemiesKilled += 1
  }

  /** Temps écoulé depuis le début de la run (ms) — figé une fois terminée. */
  elapsedMs(): number {
    return this.finished ? this.durationMs : Date.now() - this.startedAt
  }

  /** Inflige des dégâts au joueur. Renvoie vrai si la run est perdue. */
  damage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount)
    return this.hp <= 0
  }

  /** Soigne sans dépasser le max. */
  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount)
  }

  addKey(): void {
    this.keys += 1
  }

  addBomb(): void {
    this.bombs += 1
  }

  /* ── Objets modulaires (items) ── */

  /**
   * Acquiert un objet. Passif → appliqué tout de suite aux stats. Actif →
   * équipé (remplace l'actif courant), charge remise à zéro.
   */
  acquireItem(item: Item): void {
    if (item.kind === 'passive') {
      item.apply({ stats: this.stats, heal: (n) => this.heal(n) })
      this.passiveItems.push(item.id)
    } else {
      this.activeItem = item
      this.activeCharge = 0
    }
  }

  /** Gagne une charge d'objet actif (appelé à chaque ennemi tué). */
  chargeActive(): void {
    if (this.activeItem && this.activeCharge < this.activeItem.chargeMax) {
      this.activeCharge += 1
    }
  }

  /** L'objet actif est-il prêt à être déclenché ? */
  canUseActive(): boolean {
    return !!this.activeItem && this.activeCharge >= this.activeItem.chargeMax
  }

  /**
   * Déclenche l'objet actif s'il est chargé. `hooks` fournit les capacités de
   * scène (ex. blesser tous les ennemis). Renvoie vrai si l'objet a été utilisé.
   */
  useActive(hooks: { damageAllEnemies?: (amount: number) => void }): boolean {
    if (!this.canUseActive() || !this.activeItem) return false
    this.activeItem.activate({ stats: this.stats, heal: (n) => this.heal(n), ...hooks })
    this.activeCharge = 0
    return true
  }

  addShards(amount: number): void {
    this.shards += amount
  }

  /**
   * Clôt la run : calcule le bilan, crédite les Fragments de Mémoire
   * (formule du GDD §5.1) et enregistre l'Écho en cas de mort.
   * Idempotent : un seul crédit par run, même si rappelé.
   */
  finishRun(outcome: Outcome): RunSummary {
    if (this.finished && this.lastSummary) return this.lastSummary
    this.durationMs = Date.now() - this.startedAt // figé avant de marquer terminé
    this.finished = true

    const roomsExplored = this.roomsExploredPrev + this.visited.size
    const earned =
      roomsExplored * 5 +
      this.shards * 2 +
      this.echoesBanished * ECHO_FRAGMENT_BONUS +
      this.bossesDefeated * BOSS_FRAGMENT_BONUS
    const meta = addFragments(earned)
    if (outcome === 'defeat' && this.dungeon) {
      // L'Abîme grave un Écho là où le plongeur est tombé — STRATE + cellule —
      // portant son équipement, calibré sur sa force (cf. core/echoes).
      recordEcho({
        seed: this.dungeon.seed,
        roomId: this.currentRoomId,
        floor: this.stratumIndex + 1,
        power: echoPowerFrom(this.stats, this.passiveItems),
        shards: this.shards,
        items: [...this.passiveItems],
      })
    }

    this.lastSummary = {
      outcome,
      enemiesKilled: this.enemiesKilled,
      durationMs: this.durationMs,
      floorReached: this.stratumIndex + 1, // strate atteinte (1-indexée)
      totalStrata: STRATA.length,
      stratumName: this.stratum.name,
      roomsExplored,
      totalRooms: this.totalRoomsPrev + (this.dungeon?.rooms.size ?? 0),
      shards: this.shards,
      echoesBanished: this.echoesBanished,
      bossesDefeated: this.bossesDefeated,
      fragmentsEarned: earned,
      fragmentsTotal: meta.fragments,
    }
    return this.lastSummary
  }
}

/** Singleton partagé (une seule run à la fois). */
export const runState = new RunState()
