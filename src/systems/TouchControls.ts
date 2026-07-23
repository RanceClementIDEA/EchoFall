import Phaser from 'phaser'
import { COLORS, DEPTH, GAME_WIDTH } from '../theme'

/**
 * TouchControls — commandes tactiles « twin-stick » pour le jeu au doigt
 * (téléphone / tablette). N'est instancié QUE sur appareil tactile
 * (`TouchControls.available()`) : sur desktop rien n'existe, le clavier/souris
 * reste seul maître — compatibilité 100 % ascendante.
 *
 * Schéma :
 *  • moitié GAUCHE  → joystick de DÉPLACEMENT (dynamique : apparaît au doigt) ;
 *  • moitié DROITE  → joystick de VISÉE + TIR auto (on tire dans la direction
 *    poussée, au-delà d'une zone morte) ;
 *  • boutons fixes  → DASH, OBJET actif, PAUSE.
 *
 * Le déplacement, la visée et le tir sont LUS chaque frame (moveVector /
 * aimVector / isFiring) ; le dash, l'objet et la pause sont des impulsions
 * (callbacks). Multi-touch : jusqu'à déplacement + visée + un bouton
 * simultanés.
 */

const DEAD = 14 // zone morte du joystick (px)
const REACH = 54 // course max du pouce (px)
const HALF = GAME_WIDTH / 2

interface Btn {
  name: 'dash' | 'active' | 'pause'
  x: number
  y: number
  r: number
  fn: () => void
  g: Phaser.GameObjects.Arc
  label: Phaser.GameObjects.Text
}

export interface TouchHandlers {
  onPause: () => void
  onDash: () => void
  onActive: () => void
}

/** Garantit une seule fois que le gestionnaire d'entrées gère le multi-touch. */
let pointersEnsured = false

export class TouchControls {
  /** Appareil tactile ? (téléphone, tablette, écran tactile). */
  static available(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0)
    )
  }

  private scene: Phaser.Scene

  private moveId = -1
  private moveBase = new Phaser.Math.Vector2()
  private moveVec = new Phaser.Math.Vector2()
  private moveBaseG: Phaser.GameObjects.Arc
  private moveThumbG: Phaser.GameObjects.Arc

  private aimId = -1
  private aimBase = new Phaser.Math.Vector2()
  private aimVec = new Phaser.Math.Vector2()
  private aimActive = false
  private aimBaseG: Phaser.GameObjects.Arc
  private aimThumbG: Phaser.GameObjects.Arc

  private buttons: Btn[] = []

  private readonly onDown: (p: Phaser.Input.Pointer) => void
  private readonly onMove: (p: Phaser.Input.Pointer) => void
  private readonly onUp: (p: Phaser.Input.Pointer) => void

  constructor(scene: Phaser.Scene, handlers: TouchHandlers) {
    this.scene = scene

    if (!pointersEnsured) {
      scene.input.addPointer(3) // ≥ 4 pointeurs → déplacement + visée + bouton
      pointersEnsured = true
    }

    // Joysticks (cachés au repos, fixés à l'écran).
    this.moveBaseG = this.mk(0, 0, REACH, 0.14, false)
    this.moveThumbG = this.mk(0, 0, 26, 0.42, false)
    this.aimBaseG = this.mk(0, 0, REACH, 0.14, false)
    this.aimThumbG = this.mk(0, 0, 26, 0.42, false)

    // Boutons fixes : DASH & OBJET en bas, PAUSE en haut au centre.
    this.buttons = [
      this.mkButton('dash', 384, 470, 40, '⤢', handlers.onDash, COLORS.lumen),
      this.mkButton('active', 576, 470, 40, 'F', handlers.onActive, COLORS.treasure),
      this.mkButton('pause', GAME_WIDTH / 2, 30, 24, 'II', handlers.onPause, COLORS.stroke),
    ]

    this.onDown = (p) => this.pointerDown(p)
    this.onMove = (p) => this.pointerMove(p)
    this.onUp = (p) => this.pointerUp(p)
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp)
  }

  /* ── Lecture par la scène ── */

  /** Direction de déplacement normalisée (null si aucun doigt). */
  moveVector(): Phaser.Math.Vector2 | null {
    return this.moveId >= 0 && this.moveVec.lengthSq() > 0 ? this.moveVec : null
  }

  /** Direction de visée normalisée (null si le stick de visée n'est pas poussé). */
  aimVector(): Phaser.Math.Vector2 | null {
    return this.aimActive ? this.aimVec : null
  }

  /** Le joueur tire-t-il (stick de visée poussé au-delà de la zone morte) ? */
  isFiring(): boolean {
    return this.aimActive
  }

  /* ── Gestion des pointeurs ── */

  private pointerDown(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) return // la souris garde le comportement desktop

    // Boutons d'abord (priorité sur les joysticks).
    for (const b of this.buttons) {
      if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r + 6) {
        this.flash(b)
        b.fn()
        return
      }
    }

    if (p.x < HALF && this.moveId < 0) {
      this.moveId = p.id
      this.moveBase.set(p.x, p.y)
      this.moveVec.set(0, 0)
      this.showStick(this.moveBaseG, this.moveThumbG, p.x, p.y)
    } else if (p.x >= HALF && this.aimId < 0) {
      this.aimId = p.id
      this.aimBase.set(p.x, p.y)
      this.aimVec.set(0, 0)
      this.aimActive = false
      this.showStick(this.aimBaseG, this.aimThumbG, p.x, p.y)
    }
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.moveId) {
      this.trackStick(p, this.moveBase, this.moveVec, this.moveThumbG, (active) => void active)
    } else if (p.id === this.aimId) {
      this.trackStick(p, this.aimBase, this.aimVec, this.aimThumbG, (active) => {
        this.aimActive = active
      })
    }
  }

  private pointerUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.moveId) {
      this.moveId = -1
      this.moveVec.set(0, 0)
      this.hideStick(this.moveBaseG, this.moveThumbG)
    } else if (p.id === this.aimId) {
      this.aimId = -1
      this.aimActive = false
      this.aimVec.set(0, 0)
      this.hideStick(this.aimBaseG, this.aimThumbG)
    }
  }

  /** Met à jour un joystick depuis la position du doigt (delta clampé). */
  private trackStick(
    p: Phaser.Input.Pointer,
    base: Phaser.Math.Vector2,
    out: Phaser.Math.Vector2,
    thumb: Phaser.GameObjects.Arc,
    setActive: (active: boolean) => void,
  ): void {
    const dx = p.x - base.x
    const dy = p.y - base.y
    const len = Math.hypot(dx, dy)
    if (len < DEAD) {
      out.set(0, 0)
      setActive(false)
      thumb.setPosition(base.x, base.y)
      return
    }
    out.set(dx / len, dy / len) // direction normalisée (vitesse pleine)
    setActive(true)
    const clamp = Math.min(len, REACH)
    thumb.setPosition(base.x + (dx / len) * clamp, base.y + (dy / len) * clamp)
  }

  /* ── Visuels ── */

  private mk(x: number, y: number, r: number, alpha: number, visible: boolean): Phaser.GameObjects.Arc {
    return this.scene.add
      .circle(x, y, r, 0xffffff, alpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 1)
      .setVisible(visible)
      .setStrokeStyle(2, 0xffffff, alpha + 0.15)
  }

  private mkButton(
    name: Btn['name'],
    x: number,
    y: number,
    r: number,
    label: string,
    fn: () => void,
    tint: number,
  ): Btn {
    const g = this.scene.add
      .circle(x, y, r, tint, 0.18)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 1)
      .setStrokeStyle(2.5, COLORS.ink, 0.9)
    const t = this.scene.add
      .text(x, y, label, { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: `${Math.round(r * 0.8)}px`, color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0.85)
      .setDepth(DEPTH.ui + 1)
    return { name, x, y, r, fn, g, label: t }
  }

  /** Retour visuel bref à l'appui d'un bouton. */
  private flash(b: Btn): void {
    b.g.setFillStyle(0xffffff, 0.55)
    this.scene.time.delayedCall(120, () => b.g.setFillStyle(this.tintOf(b), 0.18))
  }
  private tintOf(b: Btn): number {
    return b.name === 'dash' ? COLORS.lumen : b.name === 'active' ? COLORS.treasure : COLORS.stroke
  }

  private showStick(base: Phaser.GameObjects.Arc, thumb: Phaser.GameObjects.Arc, x: number, y: number): void {
    base.setPosition(x, y).setVisible(true)
    thumb.setPosition(x, y).setVisible(true)
  }
  private hideStick(base: Phaser.GameObjects.Arc, thumb: Phaser.GameObjects.Arc): void {
    base.setVisible(false)
    thumb.setVisible(false)
  }

  /** Retire les écouteurs (au shutdown de la scène). */
  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown)
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp)
  }
}
