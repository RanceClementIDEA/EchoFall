import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, COLORS, DEPTH } from '../theme'
import { GameState } from '../state/GameState'
import { gameFlow } from '../state/GameFlow'
import { runState } from '../state/RunState'
import { Rng } from '../core/rng'
import { availableItems } from '../items/registry'
import { loadMeta, savePrefs } from '../core/meta'
import { type RoomNode, type Side, SIDES, OPPOSITE } from '../dungeon/types'
import { Player } from '../entities/Player'
import { EnemyBase } from '../entities/EnemyBase'
import { Charger } from '../entities/Charger'
import { Shooter, type EnemyShot } from '../entities/Shooter'
import { Orbiter } from '../entities/Orbiter'
import { Splitter } from '../entities/Splitter'
import { Bomber, type BomberBlast } from '../entities/Bomber'
import { Sentinel } from '../entities/Sentinel'
import { AbyssBoss } from '../entities/AbyssBoss'
import { Echo } from '../entities/Echo'
import { echoCombatStats, echoLoot, communeCost } from '../core/echoes'
import type { EchoRecord } from '../core/meta'
import { planWaves } from '../core/waves'
import { STRATA, type StratumDef, type HazardKind } from '../core/strata'
import { Spawner, type SpawnSpec } from '../systems/Spawner'
import { rollDrops, type LootKind } from '../systems/loot'
import { Fx } from '../systems/Fx'
import {
  ensureTilesetTextures,
  paintSlabFloor,
  dressWall,
  dressObstacle,
  addTorches,
  type WallSide,
  type EnvSkin,
} from '../systems/tileset'
import { TouchControls } from '../systems/TouchControls'
import { sound } from '../systems/Sound'
import { Hud } from '../ui/Hud'
import { drawMinimap } from '../ui/Minimap'

/* ── Géométrie de salle ── */
const WALL = 24 // épaisseur des murs
const DOOR_W = 76 // largeur d'une porte

/* ── Combat ── */
const BULLET_LIFESPAN_MS = 900
const ENEMY_BULLET_LIFESPAN_MS = 2400
/** Durée d'immobilité au contact d'un Écho endormi pour le recueillement (ms). */
const COMMUNE_MS = 1100
/** Onomatopées BD des coups critiques (tirées par le RNG de combat). */
const ONOMATOPOEIA = ['POW !', 'BAM !', 'CRAC !'] as const

/** Position du joueur quand il entre par un côté donné. */
const ENTRY_POS: Record<Side, { x: number; y: number }> = {
  north: { x: GAME_WIDTH / 2, y: WALL + 46 },
  south: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - WALL - 46 },
  east: { x: GAME_WIDTH - WALL - 46, y: GAME_HEIGHT / 2 },
  west: { x: WALL + 46, y: GAME_HEIGHT / 2 },
}

const ROOM_LABEL: Record<RoomNode['type'], string> = {
  start: 'Départ',
  combat: 'Combat',
  treasure: 'Trésor',
  boss: 'Gardien',
}

/**
 * GameplayScene — état « en jeu ».
 *
 * Construit la SALLE COURANTE du donjon (murs, portes, obstacles, ennemis,
 * loot) à partir de `runState`. Franchir une porte = `runState.moveTo` puis
 * `scene.restart` : Phaser nettoie tout (timers, listeners, corps physiques)
 * et la salle suivante est reconstruite — zéro fuite d'état entre salles.
 *
 * Collisions (moteur arcade) :
 *   collider  joueur/ennemis ↔ murs, obstacles, grilles (bloquant)
 *   collider  projectiles ↔ décor (le projectile meurt)
 *   overlap   projectiles ↔ ennemis (dégâts), joueur ↔ ennemis (contact),
 *             joueur ↔ éclats (ramassage), joueur ↔ portes (transition)
 */
export class GameplayScene extends Phaser.Scene {
  private player!: Player
  private enemies!: Phaser.Physics.Arcade.Group
  private bullets!: Phaser.Physics.Arcade.Group
  private enemyBullets!: Phaser.Physics.Arcade.Group
  private loot!: Phaser.Physics.Arcade.Group
  /** RNG dédié aux tirages de butin (seedé par la salle). */
  private lootRng!: Rng
  /** RNG dédié au combat — coups critiques, onomatopées (seedé par la salle). */
  private combatRng!: Rng
  /** Gestionnaire d'effets visuels (particules, flashs). */
  private fx!: Fx
  /** Prochaine bouffée de poussière autorisée (throttle du déplacement). */
  private nextDustAt = 0
  /** Halo-lanterne qui suit le joueur (lumière diégétique). */
  private halo?: Phaser.GameObjects.Arc
  /** Valeur affichée de la barre du foe vedette (interpolée — jauge fluide). */
  private foeBarValue = 1
  private walls!: Phaser.Physics.Arcade.StaticGroup
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private grilles!: Phaser.Physics.Arcade.StaticGroup

  /** Portes de la salle : verrou éventuel à détruire au nettoyage. */
  private doors: { side: Side; grille?: Phaser.GameObjects.Rectangle }[] = []
  /** Capteurs de porte, câblés au joueur dans bindPhysics (créé après eux). */
  private doorSensors: { side: Side; sensor: Phaser.GameObjects.Zone }[] = []

  private hud!: Hud
  /** Barre de vie du « foe vedette » (Gardien OU Écho éveillé) + ses éléments. */
  private foeBarFill?: Phaser.GameObjects.Rectangle
  private foeBarParts: Phaser.GameObjects.GameObject[] = []
  private boss?: EnemyBase
  /** Gestionnaire de vagues de la salle de combat courante (le cas échéant). */
  private spawner?: Spawner

  /** Strate courante (monde, palette, bestiaire) — figée à la construction. */
  private stratum!: StratumDef
  /** Habillage d'environnement passé au tileset ({ id, palette }). */
  private env!: EnvSkin
  /** Portail de descente (après un Gardien non final) : anneaux animés. */
  private portalParts: Phaser.GameObjects.GameObject[] = []

  /* ── Écho (revenant) hantant la salle courante, le cas échéant ── */
  /** Le revenant (en sommeil ou éveillé) ; absent si la salle n'est pas hantée. */
  private echo?: Echo
  /** Trace de la mort dont provient l'Écho (butin, apaisement). */
  private echoRecord?: EchoRecord
  /** Sigil pulsant sous l'Écho en sommeil (repère de recueillement). */
  private echoSigil?: Phaser.GameObjects.Arc
  /** Invite de recueillement/affrontement affichée tant que l'Écho dort. */
  private echoPrompt?: Phaser.GameObjects.Text
  /** Jauge de recueillement (fond + remplissage) et progression accumulée (ms). */
  private communeBarBg?: Phaser.GameObjects.Rectangle
  private communeBarFill?: Phaser.GameObjects.Rectangle
  private communeProgress = 0

  private entrySide: Side | null = null
  private firing = false
  /** Tir maintenu à la SOURIS (desktop). Le tactile a sa propre source. */
  private mouseFiring = false
  private nextFireAt = 0
  /** Commandes tactiles (téléphone/tablette) — absentes sur desktop. */
  private touch?: TouchControls
  /** Vrai pendant un changement de salle ou une fin de run (anti-doublon). */
  private transitioning = false

  constructor() {
    super(GameState.Gameplay)
  }

  init(data: { entry?: Side }): void {
    this.entrySide = data.entry ?? null
    this.firing = false
    this.mouseFiring = false
    this.touch = undefined
    this.nextFireAt = 0
    this.transitioning = false
    this.nextDustAt = 0
    this.doors = []
    this.doorSensors = []
    this.boss = undefined
    this.foeBarFill = undefined
    this.foeBarParts = []
    this.foeBarValue = 1
    this.halo = undefined
    this.spawner = undefined
    this.echo = undefined
    this.echoRecord = undefined
    this.echoSigil = undefined
    this.echoPrompt = undefined
    this.communeBarBg = undefined
    this.communeBarFill = undefined
    this.communeProgress = 0
    this.portalParts = []
  }

  create(): void {
    const room = runState.currentRoom
    const rng = new Rng(room.seed)
    this.lootRng = new Rng(room.seed ^ 0x1007a2)
    // RNG de combat dédié (critiques…) : ne consomme NI la seed de décor NI
    // celle du loot — même salle + mêmes tirs = mêmes critiques.
    this.combatRng = new Rng(room.seed ^ 0xc217)

    // Monde courant : la strate décide de l'habillage, du bestiaire, des
    // pièges et du Gardien (core/strata.ts).
    this.stratum = runState.stratum
    this.env = { id: this.stratum.id, pal: this.stratum.palette }

    this.ensureTextures()
    this.fx = new Fx(this)
    this.paintFloor()

    this.walls = this.physics.add.staticGroup()
    this.obstacles = this.physics.add.staticGroup()
    this.grilles = this.physics.add.staticGroup()

    // Décor : murs + portes, puis obstacles seedés (sauf salle de départ).
    this.buildWallsAndDoors(room)
    if (room.type !== 'start') this.buildObstacles(rng)
    addTorches(this, this.env) // appliques aux couleurs de la strate

    // Joueur : à la porte d'entrée, ou au centre au début de la run.
    const at = this.entrySide ? ENTRY_POS[this.entrySide] : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }
    this.player = new Player(this, at.x, at.y, 'player')
    this.player.setDepth(DEPTH.entities)
    // Halo-lanterne : la lumière du joueur (UI diégétique, cf. GDD).
    this.halo = this.add.circle(at.x, at.y, 52, COLORS.lumenGlow, 0.07).setDepth(DEPTH.fxUnder)
    // Feedback d'écran quand un coup porte : secousse + voile rouge.
    this.player.on('player-hurt', () => {
      this.fx.shake('hit')
      this.fx.hurtFlash()
    })

    // Groupes dynamiques.
    this.enemies = this.physics.add.group({ runChildUpdate: true })
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      defaultKey: 'bullet',
      maxSize: 48,
    })
    this.enemyBullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      defaultKey: 'enemy-bullet',
      maxSize: 64,
    })
    this.loot = this.physics.add.group()

    if (!room.cleared) {
      if (room.type === 'combat') {
        // Salle de combat HANTÉE : le revenant remplace les vagues. Sinon,
        // vagues classiques (Spawner) + pièges d'ambiance de la strate.
        const echoRecord = runState.echoInRoom(room.id)
        if (echoRecord) this.startEchoEncounter(echoRecord)
        else {
          this.startCombat(rng)
          // RNG dédié aux pièges : n'altère pas le plan de vagues existant.
          this.buildHazards(new Rng(room.seed ^ 0x4a2a), this.stratum.hazard)
        }
      } else if (room.type === 'boss') this.spawnBoss()
    }
    if (room.type === 'treasure' && !room.lootTaken) this.buildPedestal(room)

    this.bindPhysics()
    this.bindInput()

    // UI (toujours au-dessus de la vignette et des effets d'écran).
    this.hud = new Hud(this)
    drawMinimap(this, runState.dungeon!, room.id, runState.visited, new Set(runState.activeEchoes.keys()))
    this.add
      .text(
        12,
        GAME_HEIGHT - 20,
        `Strate ${runState.stratumIndex + 1}/${STRATA.length} · ${this.stratum.name} · Salle : ${ROOM_LABEL[room.type]}`,
        { fontFamily: 'monospace', fontSize: '12px', color: COLORS.textDim },
      )
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui)
    // Entrée dans une strate (salle de départ jamais quittée) : on annonce le
    // monde en grand — la descente doit se SENTIR.
    if (room.type === 'start' && runState.visited.size === 1) {
      this.announce(`— Strate ${runState.stratumIndex + 1} : ${this.stratum.name} —`, COLORS.text, 64)
    }
    if (room.type === 'start') {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT - 44,
          'ZQSD : bouger · Maj : dash · clic : tirer · F : objet · Échap : pause · M : son',
          { fontFamily: 'monospace', fontSize: '13px', color: COLORS.textDim },
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.ui)
    }
    if (room.type === 'boss' && !room.cleared) this.buildFoeBar(this.stratum.boss.name, COLORS.boss)

    // Seconde moitié du balayage directionnel : on vient d'entrer par
    // `entrySide`, le voile sort de ce côté et révèle la nouvelle salle.
    if (this.entrySide) this.playWipe('in', this.entrySide)
  }

  update(_time: number, dMs: number): void {
    if (this.transitioning) return

    // Commandes tactiles (si présentes) : déplacement au joystick gauche.
    // L'orientation du sprite est désormais CARDINALE (basée sur le
    // déplacement réel, gérée dans Player) — la visée du joystick droit ne
    // sert qu'au TIR (cf. fire()), pas à l'orientation.
    const move = this.touch?.moveVector() ?? null
    this.player.controlUpdate(this.touch ? { move } : undefined)

    const now = this.time.now

    // Poussière de Lumen soulevée quand le joueur se déplace (throttlée).
    const vel = (this.player.body as Phaser.Physics.Arcade.Body).velocity
    if (vel.lengthSq() > 40 * 40 && now >= this.nextDustAt) {
      this.fx.dust(this.player.x, this.player.y + 12)
      this.nextDustAt = now + 85
    }

    // Le halo-lanterne suit le joueur (léger retard doux).
    if (this.halo) {
      this.halo.x = Phaser.Math.Linear(this.halo.x, this.player.x, 0.3)
      this.halo.y = Phaser.Math.Linear(this.halo.y, this.player.y, 0.3)
    }

    // Traînées lumineuses derrière les projectiles (joueur et ennemis).
    for (const b of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (b.active) this.fx.trail(b.x, b.y, COLORS.lumenGlow)
    }
    for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (b.active) this.fx.trail(b.x, b.y, COLORS.enemyBullet)
    }

    // Tir maintenu — deux sources possibles (souris OU joystick de visée) ;
    // une transition « repos → tir » relance la cadence pour un premier tir
    // immédiat. La direction est résolue dans `fire()`.
    const firing = this.mouseFiring || !!this.touch?.isFiring()
    if (firing && !this.firing) this.nextFireAt = 0
    this.firing = firing
    if (this.firing && now >= this.nextFireAt) {
      this.fire()
      this.nextFireAt = now + 1000 / runState.stats.fireRate
    }

    this.hud.update(
      runState.hp,
      runState.stats.maxHp,
      runState.shards,
      runState.keys,
      runState.bombs,
      this.player.dashCharge(),
      runState.activeItem
        ? {
            name: runState.activeItem.name,
            charge: runState.activeCharge,
            max: runState.activeItem.chargeMax,
          }
        : null,
    )
    // Barre de vie du foe vedette (Gardien OU Écho éveillé), FLUIDE : la jauge
    // glisse vers la valeur réelle au lieu de sauter (lisible et satisfaisant
    // quand les dégâts s'enchaînent).
    const featured = this.boss ?? (this.echo && this.echo.active && !this.echo.dormant ? this.echo : undefined)
    if (this.foeBarFill && featured && featured.active) {
      const target = Math.max(0, featured.hp / featured.maxHp)
      this.foeBarValue = Phaser.Math.Linear(this.foeBarValue, target, 0.12)
      this.foeBarFill.setScale(this.foeBarValue, 1)
    }

    // Recueillement : jauge d'immobilité au contact d'un Écho endormi.
    this.updateCommune(dMs)
  }

  /* ────────────────────────── Décor ────────────────────────── */

  private paintFloor(): void {
    // Sol « Dark Comic » : dalles de pierre épaisses à joints d'encre francs
    // (chanfrein 2 tons, fissures, éclats) — générées par systems/tileset AUX
    // COULEURS DE LA STRATE (ou texture d'asset env-*-floor si fournie).
    ensureTilesetTextures(this, this.env)
    paintSlabFloor(this, this.env)

    // Poussière de Lumen, déterministe (rendu stable).
    for (let i = 0; i < 40; i++) {
      const x = (i * 137.5) % GAME_WIDTH
      const y = (i * 89.3) % GAME_HEIGHT
      this.add.circle(x, y, (i % 3) * 0.5 + 0.4, COLORS.lumenGlow, 0.1).setDepth(DEPTH.decor)
    }

    // Vignette d'atmosphère : assombrit doucement les bords de la salle.
    if (!this.textures.exists('vignette')) {
      const canvas = this.textures.createCanvas('vignette', GAME_WIDTH, GAME_HEIGHT)
      if (canvas) {
        const ctx = canvas.context
        const grad = ctx.createRadialGradient(
          GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.42,
          GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.68,
        )
        grad.addColorStop(0, 'rgba(5,7,13,0)')
        grad.addColorStop(1, 'rgba(5,7,13,0.5)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
        canvas.refresh()
      }
    }
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH.vignette)
  }

  /** Murs pleins sur les côtés sans voisin ; murs percés + porte sinon. */
  private buildWallsAndDoors(room: RoomNode): void {
    const W = GAME_WIDTH
    const H = GAME_HEIGHT
    // Mur « Dark Comic » : rectangle physique intact, cerné d'encre, puis
    // habillé par le tileset (ombre portée sur le sol, hachures crayonnées,
    // liseré d'accent) — voir systems/tileset.dressWall.
    const solid = (x: number, y: number, w: number, h: number, side: WallSide) => {
      const r = this.add.rectangle(x, y, w, h, this.env.pal.wall, 1)
      r.setStrokeStyle(2, COLORS.ink, 1) // franche bordure noire
      this.walls.add(r)
      dressWall(this, r, side, this.env)
    }

    for (const side of SIDES) {
      const hasDoor = room.neighbors[side] !== undefined
      const horizontal = side === 'north' || side === 'south'
      const wallCenter = {
        north: { x: W / 2, y: WALL / 2 },
        south: { x: W / 2, y: H - WALL / 2 },
        west: { x: WALL / 2, y: H / 2 },
        east: { x: W - WALL / 2, y: H / 2 },
      }[side]

      if (!hasDoor) {
        // Mur plein.
        solid(wallCenter.x, wallCenter.y, horizontal ? W : WALL, horizontal ? WALL : H, side)
        continue
      }

      // Mur percé : deux segments de part et d'autre de la porte.
      const span = horizontal ? W : H
      const segLen = (span - DOOR_W) / 2
      if (horizontal) {
        solid(segLen / 2, wallCenter.y, segLen, WALL, side)
        solid(W - segLen / 2, wallCenter.y, segLen, WALL, side)
      } else {
        solid(wallCenter.x, segLen / 2, WALL, segLen, side)
        solid(wallCenter.x, H - segLen / 2, WALL, segLen, side)
      }

      // La porte : verrouillée (grille bloquante) tant que la salle est
      // hostile ; sinon simple seuil lumineux.
      const locked = !room.cleared
      const doorRect = this.add.rectangle(
        wallCenter.x,
        wallCenter.y,
        horizontal ? DOOR_W : WALL,
        horizontal ? WALL : DOOR_W,
        locked ? COLORS.doorLocked : COLORS.door,
        locked ? 1 : 0.55,
      )
      doorRect.setStrokeStyle(2, COLORS.ink, 1) // cadre d'encre (BD)
      let grille: Phaser.GameObjects.Rectangle | undefined
      if (locked) {
        this.grilles.add(doorRect)
        grille = doorRect
      }
      this.doors.push({ side, grille })

      // Capteur de transition, juste À L'INTÉRIEUR de la salle : toucher la
      // porte (déverrouillée) déclenche le passage.
      const inset = 16
      const sensorCenter = {
        north: { x: W / 2, y: WALL + inset / 2 },
        south: { x: W / 2, y: H - WALL - inset / 2 },
        west: { x: WALL + inset / 2, y: H / 2 },
        east: { x: W - WALL - inset / 2, y: H / 2 },
      }[side]
      const sensor = this.add.zone(
        sensorCenter.x,
        sensorCenter.y,
        horizontal ? DOOR_W - 12 : inset,
        horizontal ? inset : DOOR_W - 12,
      )
      this.physics.add.existing(sensor, true)
      // Le joueur n'existe pas encore (ordre de create) : l'overlap est
      // câblé plus tard, dans bindPhysics().
      this.doorSensors.push({ side, sensor })
    }
  }

  /** Obstacles seedés — hors des couloirs de portes et du centre. */
  private buildObstacles(rng: Rng): void {
    const candidates = [
      { x: 200, y: 150 },
      { x: 760, y: 150 },
      { x: 200, y: 390 },
      { x: 760, y: 390 },
      { x: 330, y: 160 },
      { x: 630, y: 380 },
      { x: 390, y: 270 },
      { x: 570, y: 270 },
    ]
    // Plus dense en profondeur : les strates basses sont plus encombrées.
    const count = rng.int(2, 4) + Math.min(runState.stratumIndex, 2)
    const pool = [...candidates]
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = rng.int(0, pool.length - 1)
      const spot = pool.splice(idx, 1)[0]
      // Bloc taillé aux couleurs de la strate (ou asset env-*-obstacle) —
      // le rectangle renvoyé garde la hitbox 64×64 d'origine.
      this.obstacles.add(dressObstacle(this, spot.x, spot.y, this.env, 64))
    }
  }

  /* ────────────────────────── Ennemis ────────────────────────── */

  /** Démarre une salle de combat : verrou déjà posé, on lance les vagues. */
  private startCombat(rng: Rng): void {
    // Points d'apparition candidats, jamais collés à la porte d'entrée.
    const spawnPoints = [
      { x: 240, y: 270 },
      { x: 720, y: 270 },
      { x: 480, y: 160 },
      { x: 480, y: 380 },
      { x: 300, y: 380 },
      { x: 660, y: 160 },
      { x: 300, y: 160 },
      { x: 660, y: 380 },
    ].filter((s) => Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) > 150)

    // Plan des vagues : PUR et seedé (core/waves), composition et taille
    // dictées par la strate (bestiaire pondéré, difficulté croissante).
    const waves = planWaves(rng, spawnPoints, {
      pool: this.stratum.pool,
      waveMin: this.stratum.waveMin,
      waveMax: this.stratum.waveMax,
      sizeBase: this.stratum.waveSizeBase,
    })

    this.spawner = new Spawner({
      scene: this,
      waves,
      createEnemy: (spec) => this.createEnemy(spec),
      aliveCount: () => this.enemies.countActive(true),
      onWaveStart: (n, total) => this.announce(`Vague ${n} / ${total}`, COLORS.text, 124),
      onCleared: () => this.clearRoom(),
    })
    this.announce('Les portes se verrouillent !', COLORS.danger)
    this.spawner.start()
  }

  /**
   * Fabrique un ennemi à partir d'une spec (types concrets + câblage events).
   * Les PV et vitesses sont MODULÉS par la strate (`foeHpBonus`,
   * `foeSpeedMul`) : même bestiaire, pression croissante avec la profondeur.
   */
  private createEnemy(spec: SpawnSpec): EnemyBase {
    const span = 70
    const patrolA = { x: spec.x - span, y: spec.y }
    const patrolB = { x: spec.x + span, y: spec.y }
    const hpBonus = this.stratum.foeHpBonus
    const spd = (v: number) => Math.round(v * this.stratum.foeSpeedMul)
    // Base commune à tous les types (position, cible, patrouille).
    const common = { x: spec.x, y: spec.y, patrolA, patrolB, target: this.player }

    let enemy: EnemyBase
    switch (spec.kind) {
      case 'shooter':
        enemy = new Shooter(this, {
          ...common,
          patrolSpeed: 55,
          hp: 2 + hpBonus,
          contactDamage: 1,
          detectRadius: 340,
          loseRadius: 480,
          moveSpeed: spd(110),
          minRange: 175,
          maxRange: 300,
          fireCooldownMs: 1300,
          projectileSpeed: spd(265),
          projectileDamage: 1,
          texture: 'shooter',
          color: COLORS.shooter,
          sheets: { idle: 'foe-shooter-idle', act: 'foe-shooter-fire' },
        })
        break
      case 'orbiter':
        enemy = new Orbiter(this, {
          ...common,
          patrolSpeed: 70,
          hp: 2 + hpBonus,
          contactDamage: 1,
          detectRadius: 320,
          loseRadius: 460,
          orbitRadius: 170,
          orbitSpeed: spd(170),
          dashSpeed: spd(390),
          dashCooldownMs: 2400,
          texture: 'orbiter',
          color: COLORS.orbiter,
          sheets: { idle: 'foe-orbiter-idle', act: 'foe-orbiter-dash' },
        })
        break
      case 'splitter':
        enemy = new Splitter(this, {
          ...common,
          patrolSpeed: 40,
          hp: 4 + hpBonus,
          contactDamage: 1,
          detectRadius: 260,
          loseRadius: 400,
          chaseSpeed: spd(85),
          texture: 'splitter',
          color: COLORS.splitter,
          sheets: { idle: 'foe-splitter-idle', act: 'foe-splitter-move' },
        })
        break
      case 'bomber':
        enemy = new Bomber(this, {
          ...common,
          patrolSpeed: 55,
          hp: 2 + hpBonus,
          contactDamage: 1,
          detectRadius: 300,
          loseRadius: 440,
          chaseSpeed: spd(115),
          triggerRadius: 92,
          fuseMs: 950,
          blastRadius: 96,
          blastDamage: 1,
          texture: 'bomber',
          color: COLORS.bomber,
          sheets: { idle: 'foe-bomber-idle', act: 'foe-bomber-fuse' },
        })
        break
      case 'sentinel':
        enemy = new Sentinel(this, {
          ...common,
          patrolA: { x: spec.x, y: spec.y }, // une tourelle ne patrouille pas
          patrolB: { x: spec.x, y: spec.y },
          patrolSpeed: 0,
          hp: 4 + hpBonus,
          contactDamage: 1,
          detectRadius: 430,
          loseRadius: 600,
          burstCount: 7,
          burstCooldownMs: 2100,
          projectileSpeed: spd(210),
          projectileDamage: 1,
          texture: 'sentinel',
          color: COLORS.sentinel,
          sheets: { idle: 'foe-sentinel-idle', act: 'foe-sentinel-burst' },
        })
        break
      default:
        enemy = new Charger(this, {
          ...common,
          patrolSpeed: 65,
          chargeSpeed: spd(150),
          hp: 3 + hpBonus,
          contactDamage: 1,
          detectRadius: 190,
          loseRadius: 300,
          texture: 'enemy',
          color: COLORS.enemy,
          sheets: { idle: 'foe-charger-idle', act: 'foe-charger-rush' },
        })
    }
    this.addEnemy(enemy)
    return enemy
  }

  /** Rejeton de Gélif (issu d'une scission) : petit, vif, 1 PV, ne se scinde plus. */
  private spawnSplitterMini(x: number, y: number): void {
    const off = 16
    for (const dx of [-off, off]) {
      const mini = new Splitter(this, {
        x: x + dx,
        y: y + (dx < 0 ? -6 : 6),
        target: this.player,
        patrolA: { x: x - 50, y },
        patrolB: { x: x + 50, y },
        patrolSpeed: 60,
        hp: 1,
        contactDamage: 1,
        detectRadius: 420,
        loseRadius: 600,
        chaseSpeed: Math.round(150 * this.stratum.foeSpeedMul),
        mini: true,
        texture: 'splitter-mini',
        color: COLORS.splitter,
        sheets: { idle: 'foe-splitter-idle', act: 'foe-splitter-move' },
      })
      this.addEnemy(mini)
      this.fx.impact(mini.x, mini.y, COLORS.splitter)
    }
  }

  /**
   * Le Gardien de la strate — un boss par monde (core/strata.ts) :
   *   • « Gardien » (strate 1)  : fonceur massif (Charger costaud) ;
   *   • « Cracheur Alpha » (2)  : patterns radial + visé (AbyssBoss) ;
   *   • « Avatar de l'Abîme » (3) : radial + visé + RUÉES (AbyssBoss complet).
   */
  private spawnBoss(): void {
    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2 - 60
    const def = this.stratum.boss
    const base = {
      x: cx,
      y: cy,
      patrolA: { x: cx - 120, y: cy },
      patrolB: { x: cx + 120, y: cy },
      patrolSpeed: 70,
      hp: def.hp,
      contactDamage: def.contactDamage,
      detectRadius: 520,
      loseRadius: 2000, // un Gardien ne décroche jamais
      target: this.player,
      color: COLORS.boss,
      isBoss: true,
    }

    let boss: EnemyBase
    if (def.kind === 'alpha') {
      boss = new AbyssBoss(this, {
        ...base,
        texture: 'boss-alpha',
        moveSpeed: 120,
        minRange: 170,
        maxRange: 330,
        radial: { count: 8, cooldownMs: 2100, speed: 200, damage: 1 },
        aimed: { count: 3, spreadDeg: 14, cooldownMs: 1500, speed: 275, damage: 1 },
        sheets: { idle: 'foe-boss-alpha-idle', act: 'foe-boss-alpha-act' },
      })
    } else if (def.kind === 'avatar') {
      boss = new AbyssBoss(this, {
        ...base,
        texture: 'boss-avatar',
        moveSpeed: 135,
        minRange: 150,
        maxRange: 320,
        radial: { count: 10, cooldownMs: 1900, speed: 215, damage: 1 },
        aimed: { count: 3, spreadDeg: 12, cooldownMs: 1400, speed: 290, damage: 1 },
        lunge: { speed: 470, cooldownMs: 3400 },
        sheets: { idle: 'foe-boss-avatar-idle', act: 'foe-boss-avatar-act' },
      })
    } else {
      boss = new Charger(this, {
        ...base,
        texture: 'boss',
        chargeSpeed: 150,
        sheets: { idle: 'foe-boss-gardien-idle', act: 'foe-boss-gardien-act' },
      })
    }
    this.addEnemy(boss)
    this.boss = boss
  }

  /** Ajoute un ennemi au groupe et branche ses événements (mort, tir, boum). */
  private addEnemy(enemy: EnemyBase): void {
    enemy.setDepth(DEPTH.entities)
    enemy.on('enemy-died', () => this.onEnemyDied(enemy))
    // TOUT tireur (Cracheur, Sentinelle, Écho, boss à patterns…) émet
    // `enemy-fire` et laisse la scène créer le projectile — câblage universel,
    // sans effet pour ceux qui n'émettent jamais.
    enemy.on('enemy-fire', (shot: EnemyShot) => this.fireEnemyBullet(shot))
    if (enemy instanceof Bomber) {
      enemy.on('bomber-explode', (blast: BomberBlast, source: EnemyBase) =>
        this.onBomberExplode(blast, source),
      )
    }
    this.enemies.add(enemy)
  }

  /** Déflagration d'un Sapeur : dégâts de ZONE (joueur ET ennemis) + gros FX. */
  private onBomberExplode(blast: BomberBlast, source: EnemyBase): void {
    this.fx.death(blast.x, blast.y, COLORS.bomber)
    this.fx.impact(blast.x, blast.y, COLORS.bomber)
    // Onde de choc à l'échelle du rayon réel (lisibilité de la zone).
    const ring = this.add.circle(blast.x, blast.y, blast.radius, COLORS.bomber, 0.22).setDepth(DEPTH.fxOver - 1)
    this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 300, onComplete: () => ring.destroy() })

    // Joueur dans le rayon → dégâts (ses i-frames s'appliquent normalement).
    if (
      !this.transitioning &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, blast.x, blast.y) < blast.radius
    ) {
      const died = this.player.takeDamage(blast.damage, blast.x, blast.y)
      if (died) this.endRun('defeat')
    }
    // Tir ami : les AUTRES ennemis dans le rayon encaissent aussi (réactions
    // en chaîne savoureuses — copie du tableau : la liste mute pendant l'itération).
    for (const obj of [...this.enemies.getChildren()]) {
      const foe = obj as EnemyBase
      if (!foe.active || foe === source) continue
      if (Phaser.Math.Distance.Between(foe.x, foe.y, blast.x, blast.y) < blast.radius) {
        this.fx.damagePop(foe.x, foe.y - foe.displayHeight / 2 - 8, '-2')
        foe.takeDamage(2, blast.x, blast.y)
      }
    }
  }

  private onEnemyDied(enemy: EnemyBase): void {
    // Un Écho vaincu suit son propre dénouement (butin bonifié, apaisement).
    if (enemy === this.echo) {
      this.onEchoDefeated(enemy)
      return
    }
    // Gerbe d'éclats + onde (+ secousse) — amplifiée pour un Gardien.
    if (enemy.isBoss) this.fx.bossDeath(enemy.x, enemy.y, enemy.color)
    else this.fx.death(enemy.x, enemy.y, enemy.color)
    sound.death() // bruitage de mort
    // Butin : la table de drop décide quoi lâcher (0..n objets).
    for (const kind of rollDrops(this.lootRng, enemy.isBoss)) {
      this.spawnLoot(kind, enemy.x, enemy.y)
    }
    runState.killEnemy() // stat de run
    runState.chargeActive() // recharge l'objet actif (une charge par kill)

    // Gélif adulte : il se SCINDE en deux rejetons — AVANT d'interroger le
    // Spawner, pour que la vague ne soit jamais considérée vide à tort.
    if (enemy instanceof Splitter && enemy.canSplit) {
      this.spawnSplitterMini(enemy.x, enemy.y)
    }

    if (enemy.isBoss) {
      this.boss = undefined // évite une référence pendante vers l'objet détruit
      runState.defeatBoss() // bonus de Fragments au bilan (un par Gardien)
      this.clearRoom()
      if (runState.onLastStratum) {
        this.endRun('victory') // dernier Gardien : la run est GAGNÉE
      } else {
        this.buildDescentPortal(enemy.x, enemy.y) // sinon : la descente s'ouvre
      }
      return
    }
    // Salle de combat : c'est le Spawner qui décide (vague suivante ou fin).
    this.spawner?.onEnemyDied()
  }

  /**
   * Message fugace centré en haut (verrouillage, vague, purge…) avec une
   * vraie entrée : pop (Back.easeOut) puis fondu en glissant vers le haut.
   */
  private announce(text: string, color: string = COLORS.text, y = 90): void {
    const label = this.add
      .text(GAME_WIDTH / 2, y, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '19px',
        color,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui)
      .setShadow(0, 2, '#05070d', 4)
      .setScale(0.7)
      .setAlpha(0)
    this.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          y: y - 16,
          delay: 1050,
          duration: 450,
          onComplete: () => label.destroy(),
        })
      },
    })
  }

  /** Salle nettoyée : portes déverrouillées, verrous détruits. */
  private clearRoom(): void {
    runState.currentRoom.cleared = true
    this.openDoors()
    this.announce('Salle purgée — les portes s’ouvrent', COLORS.victory)
  }

  /** Déverrouille les portes : détruit les grilles bloquantes et pose le seuil ouvert. */
  private openDoors(): void {
    for (const door of this.doors) {
      if (!door.grille) continue
      const { x, y, width, height } = door.grille
      door.grille.destroy() // retire aussi le corps statique
      door.grille = undefined
      this.add.rectangle(x, y, width, height, COLORS.door, 0.55).setStrokeStyle(2, COLORS.ink, 1)
    }
  }

  /* ────────────────────────── Descente & pièges ────────────────────────── */

  /**
   * Après un Gardien NON FINAL : un gouffre s'ouvre — marcher dedans plonge
   * vers la strate suivante (runState.descend + reconstruction). La victoire
   * totale n'existe qu'au bout de la DERNIÈRE strate (GDD §2.3).
   */
  private buildDescentPortal(x: number, y: number): void {
    const px = Phaser.Math.Clamp(x, 140, GAME_WIDTH - 140)
    const py = Phaser.Math.Clamp(y, 120, GAME_HEIGHT - 120)

    // Gouffre : cœur d'encre + anneaux tournoyants + halo qui respire.
    const glow = this.add
      .circle(px, py, 44, COLORS.door, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.fxUnder)
    const core = this.add.circle(px, py, 26, COLORS.ink, 1).setStrokeStyle(3, COLORS.door, 0.9).setDepth(DEPTH.decor)
    const ringA = this.add.circle(px, py, 34).setStrokeStyle(2, COLORS.door, 0.55).setDepth(DEPTH.decor)
    const ringB = this.add.circle(px, py, 18).setStrokeStyle(1.5, COLORS.doorLocked, 0.0).setDepth(DEPTH.decor)
    this.tweens.add({ targets: glow, scale: 1.3, alpha: 0.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    this.tweens.add({ targets: ringA, angle: 360, scale: { from: 1, to: 0.82 }, duration: 2400, repeat: -1 })
    this.tweens.add({ targets: ringB, scale: { from: 0.4, to: 1.5 }, alpha: { from: 0.5, to: 0 }, duration: 1100, repeat: -1 })
    this.portalParts = [glow, core, ringA, ringB]

    const zone = this.add.zone(px, py, 56, 56)
    this.physics.add.existing(zone, true)
    this.physics.add.overlap(this.player, zone, () => this.beginDescent())
    this.portalParts.push(zone)

    this.announce('Le gouffre s’ouvre — descendez !', COLORS.echoText, 124)
  }

  /** Plongée vers la strate suivante : voile, descente, reconstruction. */
  private beginDescent(): void {
    if (this.transitioning) return
    this.transitioning = true
    sound.chestOpen()
    // Voile « chute » : on sort par le bas, on rentre par le haut de la
    // strate suivante (entry north = position haute + wipe-in cohérent).
    this.playWipe('out', 'south', () => {
      runState.descend()
      this.scene.restart({ entry: 'north' })
    })
  }

  /**
   * Pièges d'ambiance des salles de combat (par strate — core/strata.ts) :
   *   • 'spores'  (Jardins Fongiques) : poches fongiques qui éclatent ;
   *   • 'braises' (Fournaise)         : évents de braises qui s'embrasent.
   * Cycle : sommeil → TÉLÉGRAPHE (gonfle + s'éclaire, ~520 ms) → éclat bref
   * qui blesse le joueur s'il est dessus (ses i-frames s'appliquent). Tout est
   * seedé (positions, déphasages) ; scene.restart nettoie timers et tweens.
   */
  private buildHazards(rng: Rng, kind: HazardKind): void {
    if (kind === 'none') return
    const spots = [
      { x: 360, y: 200 },
      { x: 600, y: 340 },
      { x: 360, y: 340 },
      { x: 600, y: 200 },
      { x: 480, y: 270 },
    ]
    const color = this.env.pal.wallEdge // l'accent de la strate signe le danger
    const count = rng.int(1, 2) + (runState.stratumIndex >= 2 ? 1 : 0)
    const pool = [...spots]
    for (let i = 0; i < count && pool.length > 0; i++) {
      const spot = pool.splice(rng.int(0, pool.length - 1), 1)[0]
      this.spawnHazard(spot.x, spot.y, color, rng.int(200, 1400))
    }
  }

  /** Un piège : marque au sol qui cycle sommeil → télégraphe → éclat blessant. */
  private spawnHazard(x: number, y: number, color: number, initialDelayMs: number): void {
    const R = 30
    const base = this.add
      .circle(x, y, R, color, 0.09)
      .setStrokeStyle(1.5, color, 0.32)
      .setDepth(DEPTH.fxUnder)
    // Trois évents décoratifs (lisibilité de la zone même en sommeil).
    for (const [dx, dy] of [[-9, -4], [8, -7], [0, 9]] as const) {
      this.add.circle(x + dx, y + dy, 3, color, 0.35).setDepth(DEPTH.fxUnder)
    }

    const cycle = (): void => {
      // Télégraphe : la poche enfle et s'éclaire — le temps de s'écarter.
      this.tweens.add({
        targets: base,
        alpha: 0.5,
        scale: 1.3,
        duration: 520,
        ease: 'Sine.easeIn',
        onComplete: () => {
          if (!base.active) return
          // Éclat : FX + dégâts si le joueur est dessus (2 fenêtres de test).
          this.fx.impact(x, y, color)
          const burst = this.add.circle(x, y, R * 0.5, color, 0.4).setDepth(DEPTH.fxOver - 1)
          this.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 260, onComplete: () => burst.destroy() })
          const hurtIfOn = (): void => {
            if (this.transitioning) return
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < R + 10) {
              const died = this.player.takeDamage(1, x, y)
              if (died) this.endRun('defeat')
            }
          }
          hurtIfOn()
          this.time.delayedCall(140, hurtIfOn)
          // Retour au sommeil, puis prochain cycle (déphasage stable par position).
          this.tweens.add({ targets: base, alpha: 0.09, scale: 1, duration: 220 })
          this.time.delayedCall(1500 + ((x * 7 + y * 13) % 700), cycle)
        },
      })
    }
    this.time.delayedCall(initialDelayMs, cycle)
  }

  /* ────────────────────────── Échos (revenants) ────────────────────────── */

  /**
   * Salle HANTÉE : au lieu des vagues, un Écho manifeste à l'endroit de votre
   * mort. Il apparaît EN SOMMEIL — le joueur choisit de s'en approcher pour se
   * **recueillir** (soutien contre un peu de Lumen) ou de le **provoquer** en
   * tirant. Les portes restent verrouillées jusqu'à résolution (défaite du
   * revenant OU recueillement).
   */
  private startEchoEncounter(record: EchoRecord): void {
    this.echoRecord = record
    const stats = echoCombatStats(record)
    const ex = GAME_WIDTH / 2
    const ey = GAME_HEIGHT / 2 - 10

    // Sigil au sol : repère pulsant du lieu de recueillement.
    this.echoSigil = this.add
      .circle(ex, ey, 30, COLORS.echoGlow, 0.16)
      .setStrokeStyle(2, COLORS.echo, 0.6)
      .setDepth(DEPTH.fxUnder)
    this.tweens.add({
      targets: this.echoSigil,
      scale: { from: 0.85, to: 1.2 },
      alpha: { from: 0.18, to: 0.06 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const echo = new Echo(this, {
      x: ex,
      y: ey,
      patrolA: { x: ex - 40, y: ey },
      patrolB: { x: ex + 40, y: ey },
      patrolSpeed: 40,
      hp: stats.hp,
      contactDamage: 0, // en sommeil : inoffensif au contact
      awakeContactDamage: stats.contactDamage,
      detectRadius: 2000, // toujours « engagé » (mais figé tant qu'il dort)
      loseRadius: 4000, // une fois éveillé, il ne décroche jamais
      moveSpeed: stats.moveSpeed,
      minRange: stats.minRange,
      maxRange: stats.maxRange,
      fireCooldownMs: stats.fireCooldownMs,
      projectileSpeed: stats.projectileSpeed,
      projectileDamage: stats.projectileDamage,
      lungeSpeed: stats.lungeSpeed,
      lungeCooldownMs: stats.lungeCooldownMs,
      target: this.player,
      texture: 'echo',
      color: COLORS.echoGlow,
      // Assets optionnels du revenant (src/assets/echo/) — sinon procédural.
      sheets: { idle: 'echo-idle', act: 'echo-act' },
    })
    echo.on('echo-awakened', () => this.onEchoAwakened())
    this.addEnemy(echo)
    this.echo = echo

    // Manifestation : surgit du sigil (scale-in) + éclat spectral.
    echo.setScale(0.2)
    this.tweens.add({ targets: echo, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.fx.impact(ex, ey, COLORS.echoGlow)

    // Jauge de recueillement (sous l'Écho), masquée tant que rien ne se remplit.
    this.communeBarBg = this.add
      .rectangle(ex, ey + 30, 54, 6, 0x000000, 0.5)
      .setStrokeStyle(1, COLORS.echo, 0.8)
      .setDepth(DEPTH.ui)
      .setAlpha(0)
    this.communeBarFill = this.add
      .rectangle(ex - 27, ey + 30, 54, 6, COLORS.echoGlow, 1)
      .setOrigin(0, 0.5)
      .setScale(0, 1)
      .setDepth(DEPTH.ui)
      .setAlpha(0)

    // Invite : recueillement (coût) OU affrontement.
    const cost = communeCost(record)
    this.echoPrompt = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 64,
        `Un Écho garde ce lieu — approchez-vous sans tirer pour vous recueillir (${cost} Lumen), ou tirez pour l’affronter`,
        { fontFamily: 'Georgia, serif', fontSize: '14px', color: COLORS.echoText },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui)
      .setShadow(0, 2, '#05070d', 4)

    this.announce('L’Abîme se souvient de vous…', COLORS.echoText)
  }

  /** L'Écho s'éveille : fin du recueillement possible, place au combat. */
  private onEchoAwakened(): void {
    this.destroyEchoPrompts()
    this.buildFoeBar('ÉCHO', COLORS.echo)
    this.fx.shake('hit')
    this.announce('Un Écho se dresse contre vous !', COLORS.danger)
    sound.death() // grondement d'éveil (réutilise le bruitage existant)
  }

  /**
   * Recueillement (GDD §5.3) : rester immobile, sans tirer, au contact de
   * l'Écho endormi remplit une jauge ; pleine, elle dépense des Éclats de
   * Lumen contre un **soutien temporaire** (soin + regain de force), apaise
   * l'Écho et ouvre la salle sans combat. Provoquer l'Écho (tir) l'annule.
   */
  private updateCommune(dMs: number): void {
    const echo = this.echo
    const record = this.echoRecord
    if (!echo || !echo.active || !echo.dormant || !record) return

    const cost = communeCost(record)
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, echo.x, echo.y)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const still = body.velocity.lengthSq() < 60 * 60
    const affordable = runState.shards >= cost

    if (dist < 52 && still && !this.firing && affordable) {
      this.communeProgress += dMs
      if (this.communeProgress >= COMMUNE_MS) {
        this.communeWithEcho(record, cost)
        return
      }
    } else {
      this.communeProgress = Math.max(0, this.communeProgress - dMs * 2)
    }

    // Jauge : apparaît dès qu'on progresse, se remplit avec l'immobilité.
    const p = Phaser.Math.Clamp(this.communeProgress / COMMUNE_MS, 0, 1)
    const shown = p > 0.001
    this.communeBarBg?.setAlpha(shown ? 1 : 0)
    this.communeBarFill?.setAlpha(shown ? 1 : 0).setScale(p, 1)
  }

  private communeWithEcho(record: EchoRecord, cost: number): void {
    if (!this.echo || !this.echo.dormant) return
    if (!runState.spendShards(cost)) return // garde-fou (solde insuffisant)

    // Soutien temporaire : soin + regain de force pour la run.
    runState.heal(4)
    runState.stats.damage += 1

    runState.banishEcho(record.roomId)
    this.dissolveEcho() // dissolution paisible — pas de butin de combat

    runState.currentRoom.cleared = true
    this.openDoors()
    this.announce('Vous vous recueillez — l’Écho s’apaise (+1 Dégâts)', COLORS.echoText)
    sound.chestOpen()
  }

  /** Dénouement d'un Écho VAINCU au combat : butin bonifié + apaisement. */
  private onEchoDefeated(echo: EnemyBase): void {
    this.fx.bossDeath(echo.x, echo.y, COLORS.echoGlow)
    sound.death()
    const record = this.echoRecord
    if (record) {
      for (const kind of echoLoot(record)) this.spawnLoot(kind, echo.x, echo.y)
      runState.banishEcho(record.roomId)
    }
    runState.killEnemy()
    runState.chargeActive()

    this.echo = undefined
    this.destroyEchoPrompts()
    this.destroyFoeBar()
    this.announce('L’Écho est vaincu — l’Abîme se tait', COLORS.victory, 124)
    this.clearRoom()
  }

  /** Retire paisiblement l'Écho (recueillement) : neutralisé puis dissous. */
  private dissolveEcho(): void {
    const echo = this.echo
    this.echo = undefined
    this.destroyEchoPrompts()
    if (!echo) return
    echo.setActive(false) // ne peut plus être ni éveillé ni touché pendant le fondu
    ;(echo.body as Phaser.Physics.Arcade.Body).enable = false
    this.fx.impact(echo.x, echo.y, COLORS.echoGlow)
    this.tweens.add({
      targets: echo,
      alpha: 0,
      scale: 1.4,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => echo.destroy(),
    })
  }

  /** Détruit sigil, invite et jauge de recueillement (fin du sommeil de l'Écho). */
  private destroyEchoPrompts(): void {
    this.echoSigil?.destroy()
    this.echoSigil = undefined
    this.echoPrompt?.destroy()
    this.echoPrompt = undefined
    this.communeBarBg?.destroy()
    this.communeBarBg = undefined
    this.communeBarFill?.destroy()
    this.communeBarFill = undefined
    this.communeProgress = 0
  }

  /* ────────────────────────── Combat ────────────────────────── */

  private fire(): void {
    // Tirer en salle hantée PROVOQUE l'Écho encore en sommeil (même si le tir
    // manque) : lever son arme, c'est renoncer au recueillement.
    if (this.echo && this.echo.active && this.echo.dormant) this.echo.awaken()

    // Direction : joystick de visée tactile s'il est engagé, sinon le curseur.
    const aim = this.touch?.aimVector() ?? null
    const base = aim
      ? Math.atan2(aim.y, aim.x)
      : Phaser.Math.Angle.Between(
          this.player.x,
          this.player.y,
          this.input.activePointer.worldX,
          this.input.activePointer.worldY,
        )

    sound.shoot() // un bruitage par volée (pas par projectile)
    this.player.recoil() // squash de tir (juice)

    // Tirs multiples : `projectileCount` projectiles en éventail (stat modifiée
    // par l'objet passif « Éclat scindé »).
    const count = runState.stats.projectileCount
    const step = Phaser.Math.DegToRad(runState.stats.spreadDeg)
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * step
      this.spawnBullet(base + offset)
    }
  }

  /** Fait apparaître un projectile du joueur selon un angle donné. */
  private spawnBullet(angle: number): void {
    const bullet = this.bullets.get(this.player.x, this.player.y) as
      | Phaser.Physics.Arcade.Image
      | null
    if (!bullet) return // pool plein

    bullet.setActive(true).setVisible(true)
    bullet.setDepth(DEPTH.entities)
    const body = bullet.body as Phaser.Physics.Arcade.Body
    body.enable = true
    body.reset(this.player.x, this.player.y)
    this.physics.velocityFromRotation(angle, runState.stats.projectileSpeed, body.velocity)

    // Timer de fin de vie STOCKÉ sur le projectile : il sera annulé si le
    // projectile meurt avant (mur/ennemi), sinon un timer obsolète pourrait
    // tuer prématurément le projectile suivant qui réutilise l'objet du pool.
    const timer = this.time.delayedCall(BULLET_LIFESPAN_MS, () => this.killBullet(bullet))
    bullet.setData('killTimer', timer)
  }

  private killBullet(bullet: Phaser.Physics.Arcade.Image): void {
    if (!bullet.active) return // déjà recyclé
    ;(bullet.getData('killTimer') as Phaser.Time.TimerEvent | undefined)?.remove(false)
    bullet.setData('killTimer', undefined)
    const body = bullet.body as Phaser.Physics.Arcade.Body
    body.stop()
    body.enable = false
    this.bullets.killAndHide(bullet)
  }

  /** Tir d'un Shooter (déclenché par l'événement `enemy-fire`). */
  private fireEnemyBullet(shot: EnemyShot): void {
    const bullet = this.enemyBullets.get(shot.x, shot.y) as Phaser.Physics.Arcade.Image | null
    if (!bullet) return // pool plein

    bullet.setActive(true).setVisible(true)
    bullet.setDepth(DEPTH.entities)
    const body = bullet.body as Phaser.Physics.Arcade.Body
    body.enable = true
    body.reset(shot.x, shot.y)
    bullet.setData('damage', shot.damage) // dégâts portés par le projectile
    this.physics.velocityFromRotation(shot.angle, shot.speed, body.velocity)

    const timer = this.time.delayedCall(ENEMY_BULLET_LIFESPAN_MS, () => this.killEnemyBullet(bullet))
    bullet.setData('killTimer', timer)
  }

  private killEnemyBullet(bullet: Phaser.Physics.Arcade.Image): void {
    if (!bullet.active) return // déjà recyclé
    ;(bullet.getData('killTimer') as Phaser.Time.TimerEvent | undefined)?.remove(false)
    bullet.setData('killTimer', undefined)
    const body = bullet.body as Phaser.Physics.Arcade.Body
    body.stop()
    body.enable = false
    this.enemyBullets.killAndHide(bullet)
  }

  /** Fait apparaître un objet de butin à (x, y) avec une petite dispersion. */
  private spawnLoot(kind: LootKind, x: number, y: number): void {
    const item = this.loot.create(x, y, kind) as Phaser.Physics.Arcade.Image
    item.setData('kind', kind)
    item.setDepth(DEPTH.entities)
    const body = item.body as Phaser.Physics.Arcade.Body
    body.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-100, 100))
    body.setDrag(340, 340)
    body.setCollideWorldBounds(true)
    // Pulse doux : le butin attire l'œil sans clignoter agressivement.
    this.tweens.add({
      targets: item,
      scale: { from: 1, to: 1.18 },
      duration: 460,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  /** Ramassage au contact : applique l'effet selon le type d'objet. */
  private collectLoot(item: Phaser.Physics.Arcade.Image): void {
    if (!item.active) return
    const kind = item.getData('kind') as LootKind
    switch (kind) {
      case 'coin':
        runState.addShards(1) // monnaie de la run
        break
      case 'heart':
        runState.heal(1) // soin (plafonné aux PV max)
        break
      case 'key':
        runState.addKey()
        break
      case 'bomb':
        runState.addBomb()
        break
    }
    // Petit « pop » de ramassage.
    const fx = this.add.circle(item.x, item.y, 6, COLORS.lumenGlow, 0.8).setDepth(6)
    this.tweens.add({ targets: fx, scale: 2.4, alpha: 0, duration: 220, onComplete: () => fx.destroy() })
    item.destroy()
  }

  /* ────────────────────────── Câblage physique & entrées ────────────── */

  private bindPhysics(): void {
    const blocking = [this.walls, this.obstacles, this.grilles]

    this.physics.add.collider(this.player, blocking)
    this.physics.add.collider(this.enemies, blocking)
    this.physics.add.collider(this.enemies, this.enemies)
    this.physics.add.collider(this.loot, blocking)

    // Tirs sur le DÉCOR : étoiles + éclats saturés au point d'impact (BD).
    this.physics.add.collider(this.bullets, blocking, (obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image
      if (bullet.active) this.fx.impact(bullet.x, bullet.y, COLORS.lumenGlow)
      this.killBullet(bullet)
    })
    // Les projectiles ennemis meurent aussi sur le décor (éclats magenta).
    this.physics.add.collider(this.enemyBullets, blocking, (obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image
      if (bullet.active) this.fx.impact(bullet.x, bullet.y, COLORS.enemyBullet)
      this.killEnemyBullet(bullet)
    })

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      const bullet = b as Phaser.Physics.Arcade.Image
      const enemy = e as EnemyBase
      // Ne pas gaspiller un projectile sur un ennemi déjà mort (même frame,
      // deux projectiles) : on ignore l'impact tant que l'ennemi n'est plus actif.
      if (!bullet.active || !enemy.active) return

      // Coup critique ? RNG de combat seedé par salle (déterministe).
      const crit = this.combatRng.chance(runState.stats.critChance)
      const dmg = crit
        ? Math.round(runState.stats.damage * runState.stats.critMult)
        : runState.stats.damage

      // Juice BD : étoiles + éclats teintés, et pop-up de dégâts au-dessus
      // de l'ennemi (« POW ! » + montant sur critique, montant sinon).
      this.fx.impact(bullet.x, bullet.y, enemy.color)
      const popY = enemy.y - enemy.displayHeight / 2 - 8
      if (crit) {
        this.fx.damagePop(enemy.x, popY, this.combatRng.pick(ONOMATOPOEIA), { crit: true })
        this.fx.damagePop(enemy.x + 16, popY + 16, `-${dmg}`, { color: '#ffc24a' })
      } else {
        this.fx.damagePop(enemy.x, popY, `-${dmg}`)
      }

      sound.enemyHit() // bruitage de dégâts ennemi
      this.killBullet(bullet)
      // La position du projectile oriente le recul visuel de l'ennemi.
      enemy.takeDamage(dmg, bullet.x, bullet.y)
    })

    // Dégâts de CONTACT : joueur ↔ ennemi. Un ennemi à 0 dégât de contact (Écho
    // en sommeil) ne blesse pas — on peut s'en approcher pour se recueillir.
    this.physics.add.overlap(this.player, this.enemies, (_, e) => {
      const enemy = e as EnemyBase
      if (!enemy.active || this.transitioning || enemy.contactDamage <= 0) return
      const died = this.player.takeDamage(enemy.contactDamage, enemy.x, enemy.y)
      if (died) this.endRun('defeat')
    })

    // Dégâts À DISTANCE : projectile ennemi → joueur.
    this.physics.add.overlap(this.player, this.enemyBullets, (_, b) => {
      const bullet = b as Phaser.Physics.Arcade.Image
      if (!bullet.active || this.transitioning) return
      this.killEnemyBullet(bullet)
      const dmg = (bullet.getData('damage') as number) ?? 1
      const died = this.player.takeDamage(dmg, bullet.x, bullet.y)
      if (died) this.endRun('defeat')
    })

    // Ramassage du butin au contact.
    this.physics.add.overlap(this.player, this.loot, (_, item) => {
      this.collectLoot(item as Phaser.Physics.Arcade.Image)
    })

    // Capteurs de porte (créés avant le joueur dans buildWallsAndDoors).
    for (const { side, sensor } of this.doorSensors) {
      this.physics.add.overlap(this.player, sensor, () => this.tryTransition(side))
    }
  }

  private bindInput(): void {
    // ── Commandes TACTILES (téléphone/tablette) : instanciées uniquement sur
    //    appareil tactile ; sur desktop `this.touch` reste indéfini et le
    //    clavier/souris demeure seul maître. ──
    if (TouchControls.available()) {
      this.touch = new TouchControls(this, {
        onPause: () => {
          if (!this.transitioning) gameFlow.pauseGame(this)
        },
        onDash: () => this.player.requestDash(),
        onActive: () => this.useActiveItem(),
      })
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.touch?.destroy())
    }

    // Tir maintenu à la SOURIS (les pointeurs tactiles sont gérés par
    // TouchControls et ignorés ici via `wasTouch`).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sound.resume() // débloque l'audio au premier geste
      if (this.touch && p.wasTouch) return
      this.mouseFiring = true
    })
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.touch && p.wasTouch) return
      this.mouseFiring = false
    })
    // Bouton relâché HORS du canvas : sinon le tir automatique resterait actif.
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => {
      this.mouseFiring = false
    })

    // Focus perdu (alt-tab, clic ailleurs) : les keyup/pointerup peuvent être
    // manqués → on réinitialise les entrées pour éviter un joueur qui glisse
    // ou tire tout seul. Le listener est GLOBAL (game.events) : on le retire
    // au shutdown de la scène pour ne pas l'empiler à chaque changement de salle.
    const onBlur = () => {
      this.input.keyboard?.resetKeys()
      this.mouseFiring = false
      this.firing = false
    }
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur)
    })
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.transitioning) gameFlow.pauseGame(this)
    })
    // F : déclenche l'objet actif (s'il est chargé).
    this.input.keyboard?.on('keydown-F', () => this.useActiveItem())
    // M : coupe / rétablit le son (préférence persistée entre sessions).
    this.input.keyboard?.on('keydown-M', () => {
      const muted = sound.toggleMute()
      savePrefs({ muted })
      this.announce(muted ? 'Son coupé' : 'Son rétabli', COLORS.textDim)
    })
  }

  /** Déclenche l'objet actif tenu, s'il est chargé. */
  private useActiveItem(): void {
    if (this.transitioning) return
    const used = runState.useActive({ damageAllEnemies: (n) => this.damageAllEnemies(n) })
    if (used) this.announce(`${runState.activeItem?.name} !`, COLORS.victory)
  }

  /** Effet d'objet actif : blesse tous les ennemis + onde visuelle. */
  private damageAllEnemies(amount: number): void {
    const ring = this.add.circle(this.player.x, this.player.y, 10, COLORS.lumenGlow, 0.4).setDepth(4)
    this.tweens.add({
      targets: ring,
      scale: 60,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    })
    this.enemies
      .getChildren()
      .filter((e) => (e as EnemyBase).active)
      .forEach((obj) => {
        const enemy = obj as EnemyBase
        // Juice BD : chaque ennemi touché par l'onde affiche ses dégâts.
        this.fx.impact(enemy.x, enemy.y, enemy.color)
        this.fx.damagePop(enemy.x, enemy.y - enemy.displayHeight / 2 - 8, `-${amount}`)
        enemy.takeDamage(amount)
      })
  }

  /* ────────────────────────── Transitions ────────────────────────── */

  /** Franchissement de porte (si la salle est nettoyée). */
  private tryTransition(side: Side): void {
    if (this.transitioning) return
    const room = runState.currentRoom
    if (!room.cleared) return // portes verrouillées : pas de passage
    const nextId = room.neighbors[side]
    if (!nextId) return

    this.transitioning = true // gèle le joueur pendant le balayage
    runState.moveTo(nextId)
    // Balayage directionnel : un voile arrive DANS le sens de la porte pour
    // couvrir la salle quittée, puis on reconstruit la salle adjacente.
    this.playWipe('out', side, () => this.scene.restart({ entry: OPPOSITE[side] }))
  }

  /** Décalage hors écran d'un côté (pour animer le voile de transition). */
  private offscreen(side: Side): { x: number; y: number } {
    switch (side) {
      case 'east':
        return { x: GAME_WIDTH, y: 0 }
      case 'west':
        return { x: -GAME_WIDTH, y: 0 }
      case 'south':
        return { x: 0, y: GAME_HEIGHT }
      case 'north':
        return { x: 0, y: -GAME_HEIGHT }
    }
  }

  /**
   * Voile de transition plein écran, glissé de façon DIRECTIONNELLE.
   * • 'out' : entre depuis `side` (le sens du déplacement) → couvre l'écran.
   * • 'in'  : part couvrant l'écran → sort par `side` (le côté d'entrée),
   *           révélant la nouvelle salle dans un mouvement continu.
   */
  private playWipe(mode: 'in' | 'out', side: Side, onDone?: () => void): void {
    const off = this.offscreen(side)
    const from = mode === 'out' ? off : { x: 0, y: 0 }
    const to = mode === 'out' ? { x: 0, y: 0 } : off
    const cover = this.add
      .rectangle(from.x, from.y, GAME_WIDTH, GAME_HEIGHT, COLORS.abyssTop, 1)
      .setOrigin(0)
      .setDepth(10_000)
    this.tweens.add({
      targets: cover,
      x: to.x,
      y: to.y,
      duration: 150,
      ease: mode === 'out' ? 'Quad.easeOut' : 'Quad.easeIn',
      onComplete: () => {
        if (mode === 'in') cover.destroy()
        onDone?.()
      },
    })
  }

  /** Fin de run (victoire ou mort) — petit délai pour lire l'action. */
  private endRun(outcome: 'victory' | 'defeat'): void {
    if (this.transitioning) return
    this.transitioning = true
    if (outcome === 'defeat') this.player.setTint(0x5a5470)
    this.time.delayedCall(650, () => gameFlow.endGame(this, outcome))
  }

  /* ────────────────────────── Trésor ────────────────────────── */

  private buildPedestal(room: RoomNode): void {
    const rng = new Rng(room.seed ^ 0x5eed)
    // Ne tire que parmi les objets débloqués (gratuits d'emblée ou achetés).
    const item = rng.pick(availableItems(loadMeta().unlockedItems))

    const pedestal = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 16, COLORS.treasure, 1)
    pedestal.setStrokeStyle(2, COLORS.lumenGlow)
    pedestal.setDepth(DEPTH.entities)
    // Pulse d'appel (comme le butin) + halo discret.
    this.tweens.add({
      targets: pedestal,
      scale: { from: 1, to: 1.12 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.physics.add.existing(pedestal, true)

    const overlap = this.physics.add.overlap(this.player, pedestal, () => {
      if (room.lootTaken) return // garde anti double-acquisition (double overlap)
      room.lootTaken = true
      overlap.destroy()
      pedestal.destroy()
      sound.chestOpen() // bruitage d'ouverture de coffre
      runState.acquireItem(item) // passif appliqué / actif équipé (générique)

      const tag = item.kind === 'active' ? 'Objet actif' : 'Objet'
      const label = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, `${tag} : ${item.name} — ${item.description}`, {
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
          color: COLORS.victory,
        })
        .setOrigin(0.5)
      this.tweens.add({ targets: label, alpha: 0, delay: 1800, duration: 600 })
    })
  }

  /* ────────────────────────── UI boss ────────────────────────── */

  /**
   * Barre de vie d'un foe vedette (le Gardien, ou un Écho éveillé) : titre +
   * jauge en haut de l'écran. Les éléments sont mémorisés pour pouvoir être
   * retirés (`destroyFoeBar`) quand la scène se poursuit après la victoire —
   * cas de l'Écho, contrairement au Gardien dont la mort clôt la scène.
   */
  private buildFoeBar(label: string, color: number): void {
    const cx = GAME_WIDTH / 2
    const title = this.add
      .text(cx, 26, label, { fontFamily: 'Georgia, serif', fontSize: '14px', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui)
      .setShadow(0, 2, '#05070d', 4)
    const back = this.add.rectangle(cx - 150, 44, 300, 10, 0x000000, 0.5).setOrigin(0, 0.5).setDepth(DEPTH.ui)
    this.foeBarFill = this.add
      .rectangle(cx - 150, 44, 300, 10, color, 1)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui)
    const frame = this.add
      .rectangle(cx - 150, 44, 300, 10)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, COLORS.stroke, 1)
      .setDepth(DEPTH.ui)
    this.foeBarValue = 1
    this.foeBarParts = [title, back, this.foeBarFill, frame]
  }

  /** Retire la barre du foe vedette (Écho vaincu — la scène continue). */
  private destroyFoeBar(): void {
    for (const part of this.foeBarParts) part.destroy()
    this.foeBarParts = []
    this.foeBarFill = undefined
  }

  /* ────────────────────────── Textures ────────────────────────── */

  /** Textures générées à la volée (pas d'assets externes pour l'instant). */
  private ensureTextures(): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, w: number, h: number) => {
      if (this.textures.exists(key)) return
      const g = this.add.graphics()
      draw(g)
      g.generateTexture(key, w, h)
      g.destroy()
    }

    // Un contour sombre entoure chaque entité : elle se détache du décor
    // quel que soit le sol derrière elle (lisibilité du combat).
    make(
      'player',
      (g) => {
        g.fillStyle(COLORS.lumen, 1)
        g.fillRoundedRect(1, 1, 24, 28, 7)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 24, 28, 7)
        g.fillStyle(COLORS.abyssBottom, 1)
        g.fillRect(16, 8, 5, 7) // visière : rend l'orientation lisible
      },
      26,
      30,
    )
    make(
      'enemy',
      (g) => {
        g.fillStyle(COLORS.enemy, 1)
        g.fillRoundedRect(1, 1, 22, 22, 5)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 22, 22, 5)
        g.fillStyle(0x000000, 0.5)
        g.fillRect(5, 8, 5, 4)
        g.fillRect(14, 8, 5, 4) // « yeux » sombres
      },
      24,
      24,
    )
    make(
      'boss',
      (g) => {
        g.fillStyle(COLORS.boss, 1)
        g.fillRoundedRect(1, 1, 44, 44, 9)
        g.lineStyle(2.5, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 44, 44, 9)
        g.fillStyle(0x000000, 0.55)
        g.fillRect(10, 16, 9, 7)
        g.fillRect(27, 16, 9, 7)
      },
      46,
      46,
    )
    // Cracheur Alpha (strate 2) : gueule béante d'où partent les salves.
    make(
      'boss-alpha',
      (g) => {
        g.fillStyle(COLORS.boss, 1)
        g.fillRoundedRect(1, 1, 44, 44, 14)
        g.lineStyle(2.5, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 44, 44, 14)
        g.fillStyle(COLORS.ink, 0.85)
        g.fillCircle(23, 26, 9) // gueule-canon centrale
        g.fillStyle(COLORS.enemyBullet, 0.9)
        g.fillCircle(23, 26, 4) // lueur de charge magenta
        g.fillStyle(0x000000, 0.55)
        g.fillRect(8, 10, 8, 5)
        g.fillRect(30, 10, 8, 5)
      },
      46,
      46,
    )
    // Avatar de l'Abîme (strate 3) : plus massif, cornu, cœur incandescent.
    make(
      'boss-avatar',
      (g) => {
        g.fillStyle(COLORS.ink, 1)
        g.fillTriangle(6, 14, 16, 2, 20, 14) // corne gauche
        g.fillTriangle(48, 14, 38, 2, 34, 14) // corne droite
        g.fillStyle(COLORS.boss, 1)
        g.fillRoundedRect(2, 8, 50, 44, 11)
        g.lineStyle(3, COLORS.ink, 0.95)
        g.strokeRoundedRect(2, 8, 50, 44, 11)
        g.fillStyle(0x000000, 0.6)
        g.fillRect(11, 20, 10, 7)
        g.fillRect(33, 20, 10, 7)
        g.fillStyle(0xffd23e, 0.95)
        g.fillCircle(27, 40, 5) // cœur incandescent (point faible narratif)
      },
      54,
      56,
    )
    // Rôdeur : losange cyan effilé (voué à l'orbite et à la ruée).
    make(
      'orbiter',
      (g) => {
        g.fillStyle(COLORS.orbiter, 1)
        g.fillTriangle(12, 1, 23, 12, 12, 23)
        g.fillTriangle(12, 1, 1, 12, 12, 23)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeTriangle(12, 1, 23, 12, 12, 23)
        g.strokeTriangle(12, 1, 1, 12, 12, 23)
        g.fillStyle(0x000000, 0.55)
        g.fillRect(8, 9, 8, 4) // fente-regard
      },
      24,
      24,
    )
    // Gélif : masse gélatineuse verte, deux yeux, base qui goutte.
    make(
      'splitter',
      (g) => {
        g.fillStyle(COLORS.splitter, 1)
        g.fillRoundedRect(1, 4, 24, 20, { tl: 11, tr: 11, bl: 6, br: 6 })
        g.fillCircle(6, 24, 3) // gouttes
        g.fillCircle(18, 25, 2.5)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 4, 24, 20, { tl: 11, tr: 11, bl: 6, br: 6 })
        g.fillStyle(0x000000, 0.5)
        g.fillRect(7, 11, 4, 5)
        g.fillRect(15, 11, 4, 5)
      },
      26,
      28,
    )
    // Rejeton de Gélif : petite goutte (l'échelle 0.62 fait le reste).
    make(
      'splitter-mini',
      (g) => {
        g.fillStyle(COLORS.splitter, 1)
        g.fillRoundedRect(1, 3, 18, 15, { tl: 8, tr: 8, bl: 5, br: 5 })
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 3, 18, 15, { tl: 8, tr: 8, bl: 5, br: 5 })
        g.fillStyle(0x000000, 0.5)
        g.fillRect(5, 8, 3, 4)
        g.fillRect(12, 8, 3, 4)
      },
      20,
      20,
    )
    // Sapeur : bombe vivante orange, mèche allumée, yeux inquiets.
    make(
      'bomber',
      (g) => {
        g.fillStyle(0x6b5a3a, 1)
        g.fillRect(11, 1, 3, 5) // mèche
        g.fillStyle(0xfff3a0, 1)
        g.fillCircle(12.5, 1.5, 2) // étincelle
        g.fillStyle(COLORS.bomber, 1)
        g.fillCircle(12, 15, 10)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeCircle(12, 15, 10)
        g.fillStyle(0x000000, 0.55)
        g.fillRect(7, 12, 4, 4)
        g.fillRect(14, 12, 4, 4)
      },
      24,
      26,
    )
    // Sentinelle : tourelle lavande hexagonale à bouche radiale.
    make(
      'sentinel',
      (g) => {
        g.fillStyle(COLORS.sentinel, 1)
        g.fillPoints(
          [
            { x: 12, y: 1 }, { x: 22, y: 7 }, { x: 22, y: 17 },
            { x: 12, y: 23 }, { x: 2, y: 17 }, { x: 2, y: 7 },
          ],
          true,
        )
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokePoints(
          [
            { x: 12, y: 1 }, { x: 22, y: 7 }, { x: 22, y: 17 },
            { x: 12, y: 23 }, { x: 2, y: 17 }, { x: 2, y: 7 },
          ],
          true,
          true,
        )
        g.fillStyle(COLORS.ink, 0.85)
        g.fillCircle(12, 12, 5) // bouche radiale
        g.fillStyle(COLORS.enemyBullet, 0.9)
        g.fillCircle(12, 12, 2.2)
      },
      24,
      24,
    )
    make(
      'shooter',
      (g) => {
        g.fillStyle(COLORS.shooter, 1)
        g.fillRoundedRect(1, 1, 22, 22, 5)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 22, 22, 5)
        g.fillStyle(0xffffff, 0.4)
        g.fillCircle(12, 12, 4) // « canon » clair : distingue le tireur
      },
      24,
      24,
    )
    // Écho : la silhouette du joueur (même forme + visière), teintée spectrale
    // et blafarde — « le fantôme de vous-même qui porte votre équipement ».
    make(
      'echo',
      (g) => {
        g.fillStyle(COLORS.echo, 1)
        g.fillRoundedRect(1, 1, 24, 28, 7)
        g.lineStyle(2, COLORS.ink, 0.9)
        g.strokeRoundedRect(1, 1, 24, 28, 7)
        g.fillStyle(COLORS.echoGlow, 0.9)
        g.fillCircle(13, 12, 4) // cœur spectral clair
        g.fillStyle(COLORS.abyssBottom, 1)
        g.fillRect(16, 8, 5, 7) // visière (écho de l'orientation du héros)
      },
      26,
      30,
    )
    make(
      'bullet',
      (g) => {
        g.fillStyle(COLORS.lumenGlow, 1)
        g.fillCircle(5, 5, 4)
      },
      10,
      10,
    )
    make(
      'enemy-bullet',
      (g) => {
        g.fillStyle(COLORS.enemyBullet, 1)
        g.fillCircle(5, 5, 4)
      },
      10,
      10,
    )
    // ── Objets de butin ──
    make(
      'coin',
      (g) => {
        g.fillStyle(0xffcf1a, 1) // jaune solaire
        g.fillCircle(6, 6, 6)
        g.fillStyle(0xfff0b0, 0.6)
        g.fillCircle(4, 4, 2) // reflet
      },
      12,
      12,
    )
    make(
      'heart',
      (g) => {
        g.fillStyle(0xff4d63, 1) // rouge feu vibrant
        g.fillCircle(3.5, 4, 3.5)
        g.fillCircle(8.5, 4, 3.5)
        g.fillTriangle(0.3, 5, 11.7, 5, 6, 12)
      },
      12,
      12,
    )
    make(
      'key',
      (g) => {
        g.fillStyle(0xe8c86a, 1)
        g.fillCircle(4, 5, 4) // anse
        g.fillStyle(COLORS.floor, 1)
        g.fillCircle(4, 5, 1.6) // trou de l'anse
        g.fillStyle(0xe8c86a, 1)
        g.fillRect(7, 4, 8, 2.2) // tige
        g.fillRect(12, 6, 2, 2.4)
        g.fillRect(9, 6, 2, 2) // dents
      },
      16,
      10,
    )
    make(
      'bomb',
      (g) => {
        g.fillStyle(0x2a2440, 1)
        g.fillCircle(6, 8, 5.5) // corps
        g.fillStyle(0x6b5a3a, 1)
        g.fillRect(6, 1, 2, 4) // mèche
        g.fillStyle(COLORS.lumen, 1)
        g.fillCircle(7, 1, 1.6) // étincelle
      },
      14,
      14,
    )
  }
}
