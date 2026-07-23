import Phaser from 'phaser'
import { COLORS, DEPTH, FONTS, GAME_WIDTH, GAME_HEIGHT } from '../theme'

/**
 * Fx — gestionnaire d'effets visuels (« juice », façon BD).
 *
 * Centralise particules, secousses de caméra, flashs plein écran et pop-ups :
 *  • `dust`   — poussière de Lumen soulevée par les déplacements ;
 *  • `trail`  — traînée lumineuse derrière les projectiles ;
 *  • `death`  — gerbe d'éclats teintés + onde de choc à la mort d'un ennemi ;
 *  • `bossDeath` — version amplifiée (double onde, grosse gerbe, secousse) ;
 *  • `impact` — impact de tir (mur ou ennemi) : **étoiles à 4 branches**
 *    blanc chaud (additive) + petits **éclats géométriques saturés** teintés ;
 *  • `damagePop` — **pop-up de dégâts** style comics (« POW ! », « -15 ») :
 *    scale-up sec avec overshoot, montée, disparition — cerné d'encre ;
 *  • `shake`  — secousses de caméra calibrées (hit / kill / boss) ;
 *  • `hurtFlash` — voile rouge bref quand le joueur encaisse.
 *
 * Un seul émetteur par type (émission ponctuelle via `emitParticleAt`) : pas
 * de création/destruction d'objet à chaque effet — seuls les pop-ups texte
 * sont éphémères (quelques par seconde au pire). Recréé à chaque salle
 * (scene.restart nettoie tout).
 */
export class Fx {
  private scene: Phaser.Scene
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter
  private trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter
  private deathEmitter: Phaser.GameObjects.Particles.ParticleEmitter
  private starEmitter: Phaser.GameObjects.Particles.ParticleEmitter
  private triEmitter: Phaser.GameObjects.Particles.ParticleEmitter

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.ensureTextures()

    this.dustEmitter = scene.add
      .particles(0, 0, 'fx-dust', {
        lifespan: 420,
        speed: { min: 6, max: 34 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.35, end: 0 },
        tint: COLORS.lumenGlow,
        emitting: false,
      })
      .setDepth(DEPTH.fxUnder)

    this.trailEmitter = scene.add
      .particles(0, 0, 'fx-trail', {
        lifespan: 170,
        speed: 0,
        scale: { start: 1, end: 0 },
        alpha: { start: 0.45, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.fxUnder)

    this.deathEmitter = scene.add
      .particles(0, 0, 'fx-shard', {
        lifespan: { min: 320, max: 640 },
        speed: { min: 70, max: 220 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 340,
        emitting: false,
      })
      .setDepth(DEPTH.fxOver)

    // Étoiles d'impact BD : blanc chaud, rendu additif (elles CLAQUENT sur
    // le décor sombre), légère rotation, pas de gravité.
    this.starEmitter = scene.add
      .particles(0, 0, 'fx-star', {
        lifespan: { min: 220, max: 380 },
        speed: { min: 30, max: 120 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.95, end: 0 },
        alpha: { start: 1, end: 0.2 },
        rotate: { min: -90, max: 90 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.fxOver)

    // Éclats géométriques (triangles) : teintés saturés, retombent un peu.
    this.triEmitter = scene.add
      .particles(0, 0, 'fx-tri', {
        lifespan: { min: 260, max: 480 },
        speed: { min: 90, max: 230 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0.2 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 300,
        emitting: false,
      })
      .setDepth(DEPTH.fxOver)
  }

  /** Bouffée de poussière (déplacement du joueur). */
  dust(x: number, y: number): void {
    this.dustEmitter.emitParticleAt(x, y, 2)
  }

  /** Point de traînée derrière un projectile (appelé chaque frame). */
  trail(x: number, y: number, tint: number): void {
    this.trailEmitter.setParticleTint(tint)
    this.trailEmitter.emitParticleAt(x, y, 1)
  }

  /** Gerbe d'éclats teintés + onde de choc, à la mort d'un ennemi. */
  death(x: number, y: number, color: number): void {
    this.deathEmitter.setParticleTint(color)
    this.deathEmitter.emitParticleAt(x, y, 14)
    this.ring(x, y, color, 3.4, 260)
    this.shake('kill')
  }

  /** Mort d'un boss : double onde, grosse gerbe, secousse marquée. */
  bossDeath(x: number, y: number, color: number): void {
    this.deathEmitter.setParticleTint(color)
    this.deathEmitter.emitParticleAt(x, y, 34)
    this.ring(x, y, color, 5.5, 380)
    this.scene.time.delayedCall(120, () => this.ring(x, y, 0xffffff, 8, 460))
    this.shake('boss')
  }

  /**
   * Impact de tir (sur un mur OU un ennemi) : 2 étoiles à 4 branches blanc
   * chaud + 4 éclats géométriques teintés de `color` (couleur du projectile
   * ou de la cible) — la signature « BD » de chaque coup qui porte.
   */
  impact(x: number, y: number, color: number): void {
    this.starEmitter.setParticleTint(0xfff3a0)
    this.starEmitter.emitParticleAt(x, y, 2)
    this.triEmitter.setParticleTint(color)
    this.triEmitter.emitParticleAt(x, y, 4)
  }

  /**
   * Pop-up de dégâts « comics » : texte massif cerné d'encre qui surgit
   * (scale-up avec overshoot), monte, puis s'évapore. `crit` : onomatopée
   * jaune solaire, plus grosse, ombre rouge, montée plus haute.
   * L'inclinaison est pseudo-aléatoire mais STABLE (dérivée de la position).
   */
  damagePop(x: number, y: number, label: string, opts: { crit?: boolean; color?: string } = {}): void {
    const crit = opts.crit ?? false
    const t = this.scene.add
      .text(x, y, label, {
        fontFamily: FONTS.comic,
        fontSize: crit ? '27px' : '17px',
        color: opts.color ?? (crit ? COLORS.victory : '#ffffff'),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.fxOver)
    t.setStroke('#120b1c', crit ? 7 : 5) // cerne d'encre (charte)
    if (crit) t.setShadow(0, 3, '#7a0e1e', 0, true, true)
    t.setScale(0.2)
    t.setAngle(((Math.round(x) * 7 + Math.round(y) * 13) % 17) - 8) // −8°..8°

    // Surgissement sec avec overshoot…
    this.scene.tweens.add({
      targets: t,
      scale: crit ? 1.25 : 1,
      duration: 120,
      ease: 'Back.easeOut',
    })
    // …montée en flottant…
    this.scene.tweens.add({
      targets: t,
      y: y - (crit ? 30 : 22),
      duration: crit ? 620 : 480,
      ease: 'Quad.easeOut',
    })
    // …puis évaporation (léger rétrécissement + fondu).
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      scale: crit ? 0.9 : 0.6,
      delay: crit ? 380 : 260,
      duration: 240,
      onComplete: () => t.destroy(),
    })
  }

  /** Secousse de caméra calibrée — subtile mais présente. */
  shake(kind: 'hit' | 'kill' | 'boss'): void {
    const cam = this.scene.cameras.main
    if (kind === 'hit') cam.shake(120, 0.006)
    else if (kind === 'kill') cam.shake(70, 0.0025)
    else cam.shake(450, 0.011)
  }

  /** Voile rouge bref plein écran quand le joueur encaisse un coup. */
  hurtFlash(): void {
    const overlay = this.scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff2a2a, 0.16)
      .setOrigin(0)
      .setDepth(DEPTH.screenFx)
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 200,
      onComplete: () => overlay.destroy(),
    })
  }

  /** Onde de choc circulaire (rayon initial 6 px → échelle cible). */
  private ring(x: number, y: number, color: number, scale: number, duration: number): void {
    const ring = this.scene.add.circle(x, y, 6, color, 0.5).setDepth(DEPTH.fxOver - 1)
    this.scene.tweens.add({
      targets: ring,
      scale,
      alpha: 0,
      duration,
      onComplete: () => ring.destroy(),
    })
  }

  /* ── Textures de particules (générées une fois) ── */

  private ensureTextures(): void {
    this.makeCircle('fx-dust', 3)
    this.makeCircle('fx-trail', 2)
    this.makeSquare('fx-shard', 4)
    this.makeStar('fx-star', 16)
    this.makeTriangle('fx-tri', 8)
  }

  /** Étoile à 4 branches (scintillement BD) — blanche, teintée à l'émission. */
  private makeStar(key: string, s: number): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    const c = s / 2
    const inner = s * 0.16 // finesse des branches
    g.fillStyle(0xffffff, 1)
    g.fillPoints(
      [
        { x: c, y: 0 },
        { x: c + inner, y: c - inner },
        { x: s, y: c },
        { x: c + inner, y: c + inner },
        { x: c, y: s },
        { x: c - inner, y: c + inner },
        { x: 0, y: c },
        { x: c - inner, y: c - inner },
      ],
      true,
    )
    g.generateTexture(key, s, s)
    g.destroy()
  }

  /** Petit éclat triangulaire (débris géométrique). */
  private makeTriangle(key: string, s: number): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(0xffffff, 1)
    g.fillTriangle(0, s, s / 2, 0, s, s)
    g.generateTexture(key, s, s)
    g.destroy()
  }

  private makeCircle(key: string, r: number): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(0xffffff, 1)
    g.fillCircle(r, r, r)
    g.generateTexture(key, r * 2, r * 2)
    g.destroy()
  }

  private makeSquare(key: string, s: number): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(0xffffff, 1)
    g.fillRect(0, 0, s, s)
    g.generateTexture(key, s, s)
    g.destroy()
  }
}
