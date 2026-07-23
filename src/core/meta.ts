/**
 * Sauvegarde de la méta-progression (GDD §5) — tout ce qui SURVIT entre deux
 * sessions, stocké en localStorage :
 *   • fragments  — monnaie persistante (les « pièces » du méta) ;
 *   • bonusHp    — améliorations permanentes du Sanctuaire ;
 *   • unlockedItems — objets débloqués (dépensés dans le menu principal) ;
 *   • prefs      — préférences joueur (audio…) ;
 *   • echoes     — traces des morts (système d'Échos, V0.3).
 *
 * Robuste : versionnée, et tolérante à un storage absent ou corrompu (chaque
 * champ manquant reprend sa valeur par défaut — donc les anciennes sauvegardes
 * restent lisibles sans migration explicite).
 */

const STORAGE_KEY = 'echofall.save.v1'
const SAVE_VERSION = 1
const MAX_ECHOES = 10

/**
 * Trace d'une mort — de quoi faire réapparaître un **Écho** (revenant) plus
 * tard (GDD §5.3). On enregistre ASSEZ pour que le revenant « porte votre
 * équipement » et se calibre sur la force du plongeur tombé :
 *   • `seed`    — seed du donjon de la mort (héritage + graine d'apparence) ;
 *   • `roomId`  — coordonnée « gx,gy » HANTÉE : l'Abîme se souvient de
 *     l'endroit, pas de la strate ; une descente future qui régénère cette
 *     cellule y fait resurgir l'Écho ;
 *   • `floor`   — étage atteint (1-indexé) → échelle de puissance/butin ;
 *   • `power`   — « force » du plongeur tombé (dérivée de ses stats/objets) →
 *     PV et dégâts du revenant ;
 *   • `shards`  — Éclats non convertis emportés dans la mort → butin bonifié ;
 *   • `items`   — objets passifs portés (ids) : couleur narrative + butin.
 *
 * Les champs au-delà de `seed`/`roomId` sont apparus en V0.3 : les anciennes
 * sauvegardes (seed + roomId seuls) restent lisibles, chaque champ manquant
 * reprenant un défaut raisonnable (cf. {@link sanitizeEcho}).
 */
export interface EchoRecord {
  seed: number
  roomId: string
  floor: number
  power: number
  shards: number
  items: string[]
}

/** Puissance par défaut d'un Écho hérité d'une vieille sauvegarde (sans `power`). */
const LEGACY_ECHO_POWER = 4

/** Préférences joueur persistées. */
export interface Prefs {
  /** Son coupé. */
  muted: boolean
}

export interface MetaData {
  version: number
  /** Monnaie méta persistante — gagnée à chaque fin de run, jamais perdue. */
  fragments: number
  /** PV max supplémentaires achetés au Sanctuaire. */
  bonusHp: number
  /** Ids des objets débloqués (achetés dans le menu). */
  unlockedItems: string[]
  /** Préférences joueur. */
  prefs: Prefs
  /** Dernières morts enregistrées (les plus récentes en tête). */
  echoes: EchoRecord[]
}

const DEFAULT_PREFS: Prefs = { muted: false }

/**
 * Valide/normalise un Écho brut issu du storage. Renvoie `null` si le noyau
 * indispensable (seed entier + roomId chaîne) manque — l'entrée est alors
 * écartée. Les champs V0.3 absents (vieilles sauvegardes) reçoivent un défaut,
 * donc aucune migration explicite n'est nécessaire.
 */
function sanitizeEcho(raw: unknown): EchoRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Partial<EchoRecord>
  if (!Number.isFinite(e.seed) || typeof e.roomId !== 'string') return null
  return {
    seed: e.seed as number,
    roomId: e.roomId,
    floor: Number.isFinite(e.floor) && (e.floor as number) > 0 ? Math.floor(e.floor as number) : 1,
    power: Number.isFinite(e.power) && (e.power as number) > 0 ? (e.power as number) : LEGACY_ECHO_POWER,
    shards: Number.isFinite(e.shards) && (e.shards as number) >= 0 ? Math.floor(e.shards as number) : 0,
    items: Array.isArray(e.items) ? e.items.filter((id): id is string => typeof id === 'string') : [],
  }
}

function defaults(): MetaData {
  return {
    version: SAVE_VERSION,
    fragments: 0,
    bonusHp: 0,
    unlockedItems: [],
    prefs: { ...DEFAULT_PREFS },
    echoes: [],
  }
}

/** Coût du prochain +1 PV max au Sanctuaire (croissant : 50, 80, 110…). */
export function heartCost(meta: MetaData): number {
  return 50 + meta.bonusHp * 30
}

/** Charge la sauvegarde ; tolère un storage absent ou corrompu. */
export function loadMeta(): MetaData {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<MetaData>
    return {
      version: SAVE_VERSION,
      fragments: typeof p.fragments === 'number' ? p.fragments : 0,
      bonusHp: typeof p.bonusHp === 'number' ? p.bonusHp : 0,
      unlockedItems: Array.isArray(p.unlockedItems)
        ? p.unlockedItems.filter((id): id is string => typeof id === 'string')
        : [],
      prefs: {
        muted: typeof p.prefs?.muted === 'boolean' ? p.prefs.muted : DEFAULT_PREFS.muted,
      },
      echoes: Array.isArray(p.echoes)
        ? p.echoes
            .map(sanitizeEcho)
            .filter((e): e is EchoRecord => e !== null)
            .slice(0, MAX_ECHOES)
        : [],
    }
  } catch {
    return base
  }
}

function save(meta: MetaData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
  } catch {
    // Storage plein ou indisponible : la méta de la session reste en mémoire.
  }
}

/** Crédite des fragments et persiste. Renvoie la sauvegarde à jour. */
export function addFragments(amount: number): MetaData {
  const meta = loadMeta()
  meta.fragments += amount
  save(meta)
  return meta
}

/** Achat Sanctuaire : +1 PV max permanent si le solde suffit. */
export function buyHeart(): MetaData | null {
  const meta = loadMeta()
  const cost = heartCost(meta)
  if (meta.fragments < cost) return null
  meta.fragments -= cost
  meta.bonusHp += 1
  save(meta)
  return meta
}

/**
 * Débloque un objet contre des Fragments, s'il n'est pas déjà débloqué et si
 * le solde suffit. Renvoie la sauvegarde à jour, ou null en cas d'échec.
 */
export function unlockItem(id: string, cost: number): MetaData | null {
  const meta = loadMeta()
  if (meta.unlockedItems.includes(id)) return null
  if (meta.fragments < cost) return null
  meta.fragments -= cost
  meta.unlockedItems.push(id)
  save(meta)
  return meta
}

/** Met à jour une ou plusieurs préférences et persiste. */
export function savePrefs(partial: Partial<Prefs>): MetaData {
  const meta = loadMeta()
  meta.prefs = { ...meta.prefs, ...partial }
  save(meta)
  return meta
}

/** Raccourci de lecture des préférences. */
export function loadPrefs(): Prefs {
  return loadMeta().prefs
}

/**
 * Enregistre une mort (Écho) — les plus récentes en tête, liste bornée.
 * **Une seule trace par cellule** : mourir à nouveau au même endroit REMPLACE
 * l'ancien Écho (c'est le plongeur le plus récent qui garde le lieu), ce qui
 * évite d'accumuler des doublons inertes (un seul Écho peut hanter une salle
 * donnée — cf. `placeEchoes`) et laisse vivre plus longtemps les Échos
 * d'autres cellules.
 */
export function recordEcho(echo: EchoRecord): void {
  const meta = loadMeta()
  const others = meta.echoes.filter((e) => e.roomId !== echo.roomId)
  meta.echoes = [echo, ...others].slice(0, MAX_ECHOES)
  save(meta)
}

/**
 * Efface l'Écho d'une cellule — appelé quand le revenant est **apaisé**
 * (vaincu au combat ou recueilli) : la mémoire est mise au repos et ne
 * resurgira plus. Sans effet si aucune trace n'y subsiste.
 */
export function forgetEcho(roomId: string): void {
  const meta = loadMeta()
  const next = meta.echoes.filter((e) => e.roomId !== roomId)
  if (next.length === meta.echoes.length) return // rien à retirer
  meta.echoes = next
  save(meta)
}

/** Nombre d'Échos en sommeil dans l'Abîme (pour l'affichage du menu). */
export function echoCount(): number {
  return loadMeta().echoes.length
}
