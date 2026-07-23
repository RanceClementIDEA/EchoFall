import Phaser from 'phaser'
import { COLORS, DEPTH, FONTS } from '../theme'

/* ── Palette HUD (charte Dark Comic) ── */
const INK = COLORS.ink // cadres épais noirs (signature comic)
const ACCENT = COLORS.wallEdge // liseré de relief pourpre
const PANEL_BG = 0x181320 // nuit pourpre
const HEART_RED = 0xff2e46 // rouge feu vibrant
const HEART_SHINE = 0xffd6dc
const HEART_EMPTY = 0x2a1c2e // cœur vidé : maroon très sombre
const HEART_ALERT = 0xff5470 // pulse d'urgence
const COIN = 0xffcf1a
const KEY_GOLD = 0xf5c542
const RUNE_READY = 0xffe08a
const RUNE_IDLE = 0xff8a2e
const RUNE_OFF = 0x3a3352
const CHARGE_OFF = 0x2a2440

/** Seuil d'urgence : en dessous, l'interface des cœurs pulse en rouge. */
const DANGER_RATIO = 0.25

/* ── Disposition ── */
const PANEL = { x: 6, y: 6, w: 244, h: 150 }
const HEARTS = { x: 24, y: 30, gap: 21, size: 20, perRow: 10, rowGap: 20 }
const CHIP = { y: 66, w: 68, h: 26, gap: 6, x0: 14 }
const DASH = { x: 22, y: 100, w: 118, h: 10 }
const SLOT = { x: 18, y: 112, size: 34 }

/**
 * Hud — interface incrustée en jeu, style « Dark Comic » percutant.
 *
 * Cadres épais noirs (encre) à liseré pourpre, icônes vectorielles pleines de
 * pep's (cœurs stylisés cernés d'encre, bombe à mèche allumée qui vacille),
 * chiffres en police grasse et massive (FONTS.comic). Affiche : **cœurs** de
 * vie (plein/vide), compteurs **pièces / clés / bombes** en pastilles
 * encadrées, jauge de **dash**, et l'**objet actif** (emplacement + jauge de
 * charge segmentée). Sous 25 % de PV, toute l'interface des cœurs **pulse en
 * rouge** (urgence lisible d'un coup d'œil).
 *
 * Ne redessine que ce qui change ; tout est à la profondeur UI.
 */
export class Hud {
  private scene: Phaser.Scene
  private hearts: Phaser.GameObjects.Image[] = []
  private coinText: Phaser.GameObjects.Text
  private keyText: Phaser.GameObjects.Text
  private bombText: Phaser.GameObjects.Text
  private dashFill: Phaser.GameObjects.Rectangle
  private slotBox: Phaser.GameObjects.Rectangle
  private rune: Phaser.GameObjects.Image
  private activeName: Phaser.GameObjects.Text
  private chargeG: Phaser.GameObjects.Graphics
  private readyTag?: Phaser.GameObjects.Text
  /** Voile rouge sur la zone des cœurs (pulse d'urgence < 25 % PV). */
  private alertOverlay!: Phaser.GameObjects.Rectangle
  private alertTween?: Phaser.Tweens.Tween
  private heartPulse?: Phaser.Tweens.Tween

  private lastHp = -1
  private lastMaxHp = -1
  private lastCoins = -1
  private lastKeys = -1
  private lastBombs = -1
  private lastActiveKey = ' '

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.buildTextures()

    // ── Panneau : cadre ÉPAIS NOIR + liseré pourpre + fond nuit ──
    this.framedBox(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL_BG, 0.66, 4)

    // ── Pastilles de ressources (pièce · clé · bombe) ──
    this.coinText = this.chip(0, 'hud-coin')
    this.keyText = this.chip(1, 'hud-key')
    this.bombText = this.chip(2, 'hud-bomb')
    this.igniteFuse() // flamme vacillante sur la bombe (mèche allumée)

    // ── Jauge de dash (cadre épais noir) ──
    this.framedBox(DASH.x, DASH.y, DASH.w, DASH.h, 0x000000, 0.5, 3, 0, 0.5)
    this.dashFill = this.ui(
      scene.add.rectangle(DASH.x + 2, DASH.y, DASH.w - 4, DASH.h - 4, COLORS.lumen, 1).setOrigin(0, 0.5),
    )
    this.boldText(DASH.x + DASH.w + 8, DASH.y, 11, COLORS.textDim, 0, 0.5).setText('DASH')

    // ── Emplacement d'objet actif (cadre épais noir) ──
    this.slotBox = this.framedBox(SLOT.x, SLOT.y, SLOT.size, SLOT.size, 0x1a1428, 0.92, 4)
    this.rune = this.ui(
      scene.add.image(SLOT.x + SLOT.size / 2, SLOT.y + SLOT.size / 2, 'hud-rune').setTint(RUNE_OFF),
    )
    this.boldText(SLOT.x + SLOT.size + 10, SLOT.y + 2, 10, COLORS.textDim).setText('ACTIF')
    this.activeName = this.boldText(SLOT.x + SLOT.size + 10, SLOT.y + 15, 12, COLORS.text)
    this.chargeG = this.ui(scene.add.graphics())

    // Voile d'alerte rouge (au-dessus des cœurs), invisible au repos.
    this.alertOverlay = this.ui(
      scene.add
        .rectangle(PANEL.x + 2, PANEL.y + 2, PANEL.w - 4, 46, HEART_RED, 0)
        .setOrigin(0),
    )
  }

  /** À appeler chaque frame ; ne redessine que ce qui a changé. */
  update(
    hp: number,
    maxHp: number,
    coins: number,
    keys: number,
    bombs: number,
    dashCharge: number,
    active: { name: string; charge: number; max: number } | null,
  ): void {
    if (hp !== this.lastHp || maxHp !== this.lastMaxHp) {
      this.redrawHearts(hp, maxHp)
      this.lastHp = hp
      this.lastMaxHp = maxHp
    }
    if (coins !== this.lastCoins) {
      this.coinText.setText(String(coins))
      this.lastCoins = coins
    }
    if (keys !== this.lastKeys) {
      this.keyText.setText(String(keys))
      this.lastKeys = keys
    }
    if (bombs !== this.lastBombs) {
      this.bombText.setText(String(bombs))
      this.lastBombs = bombs
    }
    // Jauge de dash : éclaircie et pleine quand le dash est prêt.
    this.dashFill.setScale(dashCharge, 1)
    this.dashFill.setFillStyle(dashCharge >= 1 ? RUNE_READY : COLORS.lumen, 1)

    const key = active ? `${active.name}:${active.charge}/${active.max}` : '—'
    if (key !== this.lastActiveKey) {
      this.redrawActive(active)
      this.lastActiveKey = key
    }
  }

  /* ────────────────────────── Cœurs ────────────────────────── */

  private redrawHearts(hp: number, maxHp: number): void {
    this.hearts.forEach((h) => h.destroy())
    this.hearts = []
    for (let i = 0; i < maxHp; i++) {
      const col = i % HEARTS.perRow
      const row = Math.floor(i / HEARTS.perRow)
      const x = HEARTS.x + col * HEARTS.gap
      const y = HEARTS.y + row * HEARTS.rowGap
      const full = i < hp
      const heart = this.ui(
        this.scene.add.image(x, y, full ? 'hud-heart' : 'hud-heart-empty').setOrigin(0.5),
      )
      this.hearts.push(heart)
    }
    this.updateDanger(hp, maxHp)
  }

  /**
   * Urgence : sous 25 % de PV, l'interface des cœurs pulse en rouge (voile
   * clignotant + battement des cœurs pleins). Au-dessus, tout est calme.
   */
  private updateDanger(hp: number, maxHp: number): void {
    const danger = hp > 0 && hp / maxHp < DANGER_RATIO
    this.alertTween?.remove()
    this.alertTween = undefined
    this.heartPulse?.remove()
    this.heartPulse = undefined

    if (!danger) {
      this.alertOverlay.setAlpha(0)
      this.hearts.forEach((h) => h.setScale(1).clearTint())
      return
    }

    // Voile rouge pulsé sur la zone des cœurs.
    this.alertTween = this.scene.tweens.add({
      targets: this.alertOverlay,
      alpha: { from: 0.05, to: 0.34 },
      duration: 460,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    // Battement des cœurs pleins, teintés d'un rouge d'alerte plus vif.
    const filled = this.hearts.filter((_, i) => i < hp)
    filled.forEach((h) => h.setTint(HEART_ALERT))
    if (filled.length > 0) {
      this.heartPulse = this.scene.tweens.add({
        targets: filled,
        scale: { from: 1, to: 1.28 },
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  /* ────────────────────────── Objet actif ────────────────────────── */

  private redrawActive(active: { name: string; charge: number; max: number } | null): void {
    this.chargeG.clear()
    this.readyTag?.destroy()
    this.readyTag = undefined
    if (!active) {
      this.rune.setTint(RUNE_OFF)
      this.slotBox.setStrokeStyle(4, INK, 1)
      this.activeName.setText('—').setColor(COLORS.textDim)
      return
    }

    const ready = active.charge >= active.max
    this.rune.setTint(ready ? RUNE_READY : RUNE_IDLE)
    this.slotBox.setStrokeStyle(4, ready ? COLORS.lumen : INK, 1)
    this.activeName.setText(active.name).setColor(ready ? COLORS.victory : COLORS.text)

    // Jauge de charge segmentée (un pavé encré par charge).
    const segW = 9
    const segH = 7
    const gap = 3
    const gx = SLOT.x + SLOT.size + 10
    const gy = SLOT.y + 26
    for (let i = 0; i < active.max; i++) {
      const filled = i < active.charge
      this.chargeG.fillStyle(INK, 1)
      this.chargeG.fillRect(gx + i * (segW + gap) - 1, gy - 1, segW + 2, segH + 2)
      this.chargeG.fillStyle(filled ? (ready ? COLORS.lumen : RUNE_IDLE) : CHARGE_OFF, 1)
      this.chargeG.fillRect(gx + i * (segW + gap), gy, segW, segH)
    }
    if (ready) {
      this.readyTag = this.boldText(gx, gy + 12, 11, COLORS.victory)
      this.readyTag.setText('PRÊT (F)')
    }
  }

  /* ────────────────────────── Construction ────────────────────────── */

  /** Fixe la profondeur UI (au-dessus de la vignette et des flashs). */
  private ui<T extends Phaser.GameObjects.Components.Depth>(obj: T): T {
    obj.setDepth(DEPTH.ui)
    return obj
  }

  /**
   * Boîte à CADRE ÉPAIS NOIR (encre) + liseré pourpre + fond — la brique
   * visuelle « comic » du HUD. Renvoie le rectangle de fond (pour restyler le
   * liseré ensuite, ex. slot actif). `ox/oy` = origine (défaut coin haut-gauche).
   */
  private framedBox(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    fillAlpha: number,
    inkWidth: number,
    ox = 0,
    oy = 0,
  ): Phaser.GameObjects.Rectangle {
    const box = this.ui(this.scene.add.rectangle(x, y, w, h, fill, fillAlpha).setOrigin(ox, oy))
    box.setStrokeStyle(inkWidth, INK, 1) // cadre épais noir
    // Liseré pourpre fin, inséré à l'intérieur du cadre noir (relief BD).
    this.ui(
      this.scene.add
        .rectangle(x, y, w - inkWidth, h - inkWidth, 0x000000, 0)
        .setOrigin(ox, oy)
        .setStrokeStyle(1.5, ACCENT, 0.7),
    )
    return box
  }

  /** Pastille de ressource encadrée (icône + compteur gras). i = 0/1/2. */
  private chip(i: number, iconKey: string): Phaser.GameObjects.Text {
    const x = CHIP.x0 + i * (CHIP.w + CHIP.gap)
    this.framedBox(x, CHIP.y, CHIP.w, CHIP.h, PANEL_BG, 0.9, 3, 0, 0.5)
    this.ui(this.scene.add.image(x + 16, CHIP.y, iconKey).setOrigin(0.5))
    return this.boldText(x + 30, CHIP.y, 15, COLORS.text, 0, 0.5).setText('0')
  }

  /** Texte gras et massif (police comics), avec ombre d'encre portée. */
  private boldText(
    x: number,
    y: number,
    size: number,
    color: string,
    ox = 0,
    oy = 0,
  ): Phaser.GameObjects.Text {
    return this.ui(
      this.scene.add
        .text(x, y, '', { fontFamily: FONTS.comic, fontSize: `${size}px`, color })
        .setOrigin(ox, oy)
        .setStroke('#120b1c', 3)
        .setShadow(1, 2, '#120b1c', 0, true, true),
    )
  }

  /** Petite flamme qui vacille au bout de la mèche de la bombe (pep's). */
  private igniteFuse(): void {
    const bombX = CHIP.x0 + 2 * (CHIP.w + CHIP.gap) + 16
    const flame = this.ui(
      this.scene.add.image(bombX + 5, CHIP.y - 11, 'hud-flame').setOrigin(0.5),
    )
    this.scene.tweens.add({
      targets: flame,
      scaleX: { from: 0.8, to: 1.15 },
      scaleY: { from: 1.1, to: 0.75 },
      alpha: { from: 1, to: 0.7 },
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  /* ── Textures vectorielles (cernées d'encre, générées une fois) ── */

  private buildTextures(): void {
    this.makeHeart('hud-heart', HEART_RED, HEART_SHINE)
    this.makeHeart('hud-heart-empty', HEART_EMPTY)
    this.makeCoin('hud-coin')
    this.makeKey('hud-key')
    this.makeBomb('hud-bomb')
    this.makeFlame('hud-flame')
    this.makeRune('hud-rune')
  }

  /** Cœur stylisé cerné d'encre (silhouette d'encre + corps inséré + reflet). */
  private makeHeart(key: string, fill: number, shine?: number): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    const W = HEARTS.size
    const H = HEARTS.size
    const heart = (x: number, y: number, w: number, h: number) => {
      const r = w * 0.28
      g.fillCircle(x + w * 0.3, y + r + h * 0.04, r)
      g.fillCircle(x + w * 0.7, y + r + h * 0.04, r)
      g.fillTriangle(x + w * 0.03, y + h * 0.36, x + w * 0.97, y + h * 0.36, x + w * 0.5, y + h * 0.99)
    }
    g.fillStyle(INK, 1)
    heart(0, 0, W, H) // silhouette d'encre (cadre)
    g.fillStyle(fill, 1)
    heart(2.5, 2, W - 5, H - 4) // corps inséré
    if (shine !== undefined) {
      g.fillStyle(shine, 0.95)
      g.fillCircle(W * 0.34, H * 0.32, W * 0.11)
    }
    g.generateTexture(key, W, H)
    g.destroy()
  }

  private makeCoin(key: string): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(INK, 1)
    g.fillCircle(9, 9, 9)
    g.fillStyle(COIN, 1)
    g.fillCircle(9, 9, 6.5)
    g.fillStyle(0xfff3a0, 0.8)
    g.fillCircle(6.5, 6.5, 2)
    g.generateTexture(key, 18, 18)
    g.destroy()
  }

  private makeKey(key: string): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    // Silhouette d'encre (anse + tige + dents), puis or inséré.
    const draw = (color: number, inset: number) => {
      g.fillStyle(color, 1)
      g.fillCircle(6, 9, 5 - inset) // anse
      g.fillRect(9, 8 + inset, 8 - inset, 3 - inset) // tige
      g.fillRect(14, 11 - inset, 2, 3 - inset) // dent
    }
    draw(INK, 0)
    draw(KEY_GOLD, 1.2)
    g.fillStyle(INK, 1)
    g.fillCircle(6, 9, 1.6) // trou de l'anse
    g.generateTexture(key, 20, 18)
    g.destroy()
  }

  /** Bombe ronde cernée d'encre + mèche (la flamme est un sprite animé). */
  private makeBomb(key: string): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(INK, 1)
    g.fillCircle(9, 12, 8) // corps (encre)
    g.fillStyle(0x3a3352, 1)
    g.fillCircle(9, 12, 6) // corps (métal sombre)
    g.fillStyle(0x6f6a86, 0.7)
    g.fillCircle(6.5, 9.5, 1.8) // reflet
    g.fillStyle(INK, 1)
    g.fillRect(11, 2, 2.4, 5) // mèche (part vers le haut-droit)
    g.fillRect(12.5, 1, 2.4, 3)
    g.generateTexture(key, 20, 22)
    g.destroy()
  }

  /** Petite flamme (dégradé encre→orange→jaune) pour la mèche allumée. */
  private makeFlame(key: string): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(0xff6a1e, 1)
    g.fillTriangle(0, 5, 6, 5, 3, -5) // langue orange
    g.fillStyle(0xffd21e, 1)
    g.fillTriangle(1, 5, 5, 5, 3, -1) // cœur jaune
    g.fillStyle(0xfff3a0, 0.9)
    g.fillCircle(3, 4, 1.2)
    g.generateTexture(key, 6, 12)
    g.destroy()
  }

  private makeRune(key: string): void {
    if (this.scene.textures.exists(key)) return
    const g = this.scene.add.graphics()
    g.fillStyle(INK, 1)
    g.fillTriangle(9, 0, 18, 11, 9, 22)
    g.fillTriangle(9, 0, 0, 11, 9, 22)
    g.fillStyle(0xffffff, 1)
    g.fillTriangle(9, 3, 15, 11, 9, 19)
    g.fillTriangle(9, 3, 3, 11, 9, 19)
    g.generateTexture(key, 18, 22)
    g.destroy()
    this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST)
  }
}
