import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, COLORS, FONTS } from '../theme'
import { GameState } from '../state/GameState'
import { gameFlow } from '../state/GameFlow'
import { loadMeta, buyHeart, heartCost, unlockItem, savePrefs } from '../core/meta'
import { BASE_STATS } from '../core/stats'
import { lockedItems } from '../items/registry'
import { sound } from '../systems/Sound'
import { paintAbyss } from '../ui/background'

const INK = COLORS.ink
const ACCENT = COLORS.wallEdge
const CX = GAME_WIDTH / 2

/**
 * MenuScene — la Citadelle : point d'entrée du flux ET hub de méta-progression,
 * habillée « Dark Comic ».
 *
 * Logo massif cerné d'encre qui claque à l'entrée, braises ascendantes,
 * pastille de Fragments, grand bouton d'appel, et un **Sanctuaire** en panneau
 * encadré où chaque amélioration/objet est une carte cliquable (verte si
 * abordable). On y dépense les Fragments (monnaie persistante) pour des bonus
 * permanents (+1 PV max) et pour **débloquer des objets** (qui rejoignent le
 * pool des runs). Le réglage audio est persisté. Tout est relu depuis la
 * sauvegarde ; un achat rafraîchit l'écran (scene.restart).
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(GameState.Menu)
  }

  create(): void {
    paintAbyss(this)
    this.cameras.main.fadeIn(240, 5, 7, 13)
    const meta = loadMeta()

    this.paintEmbers()
    this.paintVignette()
    this.buildEmblem()
    this.buildTitle()
    this.buildWallet(meta.fragments)
    this.buildDescendButton()
    this.buildSanctuary(meta)
    this.buildSoundToggle(meta)
    this.buildEchoNotice(meta.echoes.length)

    this.add
      .text(CX, GAME_HEIGHT - 16, 'ENTRÉE : descendre     ·     CLIC : dépenser au Sanctuaire', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5)
      .setDepth(20)

    this.input.keyboard?.on('keydown-ENTER', () => gameFlow.startGame(this))
    this.input.keyboard?.on('keydown-SPACE', () => gameFlow.startGame(this))
  }

  /* ────────────────────────── Ambiance ────────────────────────── */

  /** Braises ascendantes (particules chaudes) — vie et profondeur au fond. */
  private paintEmbers(): void {
    if (!this.textures.exists('menu-ember')) {
      const g = this.add.graphics()
      g.fillStyle(0xffffff, 1)
      g.fillCircle(3, 3, 3)
      g.generateTexture('menu-ember', 6, 6)
      g.destroy()
    }
    this.add
      .particles(0, 0, 'menu-ember', {
        x: { min: 0, max: GAME_WIDTH },
        y: GAME_HEIGHT + 10,
        lifespan: { min: 3200, max: 6400 },
        speedY: { min: -70, max: -30 },
        speedX: { min: -14, max: 14 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.55, end: 0 },
        tint: [COLORS.lumen, COLORS.lumenGlow, COLORS.shard],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 200,
      })
      .setDepth(1)
  }

  /** Vignette douce : concentre le regard vers le centre. */
  private paintVignette(): void {
    if (!this.textures.exists('menu-vignette')) {
      const canvas = this.textures.createCanvas('menu-vignette', GAME_WIDTH, GAME_HEIGHT)
      if (canvas) {
        const ctx = canvas.context
        const grad = ctx.createRadialGradient(
          CX, GAME_HEIGHT / 2, GAME_HEIGHT * 0.34,
          CX, GAME_HEIGHT / 2, GAME_WIDTH * 0.66,
        )
        grad.addColorStop(0, 'rgba(5,4,10,0)')
        grad.addColorStop(1, 'rgba(5,4,10,0.62)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
        canvas.refresh()
      }
    }
    this.add.image(0, 0, 'menu-vignette').setOrigin(0).setDepth(2)
  }

  /** Emblème : halo battant + noyau orange (la braise-mère). */
  private buildEmblem(): void {
    const y = 60
    const glow = this.add.circle(CX, y, 34, COLORS.lumenGlow, 0.16).setDepth(3)
    this.add.circle(CX, y, 17, INK, 1).setDepth(3)
    this.add.circle(CX, y, 13, COLORS.lumen, 1).setDepth(3)
    this.add.circle(CX - 4, y - 4, 4, 0xfff3a0, 0.9).setDepth(3)
    this.tweens.add({
      targets: glow,
      scale: { from: 1, to: 1.35 },
      alpha: { from: 0.16, to: 0.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  /** Logo « ECHOFALL » massif, orange cerné d'encre, qui claque à l'entrée. */
  private buildTitle(): void {
    const title = this.add
      .text(CX, 122, 'ECHOFALL', {
        fontFamily: FONTS.comic,
        fontSize: '72px',
        color: '#ff8a2e',
      })
      .setOrigin(0.5)
      .setAngle(-3)
      .setStroke('#120b1c', 10)
      .setShadow(4, 6, '#120b1c', 0, true, true)
      .setDepth(6)
    // Slam-in : surgit en grand puis se cale avec un léger rebond.
    title.setScale(1.7).setAlpha(0)
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' })

    this.add
      .text(CX, 166, 'Descends · Meurs · Souviens-toi', {
        fontFamily: FONTS.mono,
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5)
      .setDepth(6)
  }

  /** Pastille de Fragments (icône gemme + solde en gras). */
  private buildWallet(fragments: number): void {
    const y = 196
    const w = 200
    this.framedBox(CX, y, w, 30, 0x201a2e, 0.92, 3, 0.5, 0.5).setDepth(6)
    this.gemIcon(CX - w / 2 + 22, y).setDepth(7)
    this.add
      .text(CX - w / 2 + 40, y, `${fragments}`, {
        fontFamily: FONTS.comic,
        fontSize: '18px',
        color: COLORS.victory,
      })
      .setOrigin(0, 0.5)
      .setStroke('#120b1c', 3)
      .setDepth(7)
    this.add
      .text(CX + w / 2 - 14, y, 'FRAGMENTS', {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0.5)
      .setDepth(7)
  }

  /** Grand bouton d'appel « DESCENDRE » (cadre épais, orange au survol). */
  private buildDescendButton(): void {
    const y = 244
    const w = 300
    const h = 58
    const bg = this.add.rectangle(CX, y, w, h, COLORS.lumen, 1).setStrokeStyle(4, INK, 1).setDepth(6)
    this.add
      .rectangle(CX, y, w - 8, h - 8, 0x000000, 0)
      .setStrokeStyle(1.5, 0xfff3a0, 0.5)
      .setDepth(7)
    const label = this.add
      .text(CX, y, 'DESCENDRE', { fontFamily: FONTS.comic, fontSize: '30px', color: '#1a1020' })
      .setOrigin(0.5)
      .setDepth(7)

    const zone = this.add
      .zone(CX, y, w, h)
      .setInteractive({ useHandCursor: true })
      .setDepth(8)
    const group = [bg, label]
    zone.on('pointerover', () => {
      bg.setFillStyle(0xff8a2e, 1)
      this.tweens.add({ targets: group, scale: 1.05, duration: 110, ease: 'Quad.easeOut' })
    })
    zone.on('pointerout', () => {
      bg.setFillStyle(COLORS.lumen, 1)
      this.tweens.add({ targets: group, scale: 1, duration: 110, ease: 'Quad.easeOut' })
    })
    zone.on('pointerdown', () => this.tweens.add({ targets: group, scale: 0.97, duration: 70 }))
    zone.on('pointerup', () => gameFlow.startGame(this))

    // Entrée : le bouton monte et apparaît.
    ;[bg, label].forEach((o) => o.setAlpha(0))
    this.tweens.add({ targets: group, alpha: 1, y: { from: y + 16, to: y }, delay: 180, duration: 360, ease: 'Back.easeOut' })
  }

  /* ────────────────────────── Sanctuaire ────────────────────────── */

  private buildSanctuary(meta: ReturnType<typeof loadMeta>): void {
    const px = CX
    const py = 300
    const pw = 660
    const ph = 214
    const panel = this.framedBox(px, py, pw, ph, 0x1a1430, 0.82, 4, 0.5, 0).setDepth(5)
    panel.setData('slide', true)

    this.add
      .text(px, py + 4, '⟡  SANCTUAIRE  ⟡', {
        fontFamily: FONTS.comic,
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5, 0)
      .setStroke('#120b1c', 4)
      .setDepth(6)
      .setData('slide', true)

    const left = px - pw / 2 + 24
    const right = px + pw / 2 - 24
    let y = py + 44

    // Amélioration permanente : +1 PV max.
    const hc = heartCost(meta)
    this.shopCard(
      left,
      right,
      y,
      `❤  +1 PV max de départ  (actuel : ${BASE_STATS.maxHp + meta.bonusHp})`,
      hc,
      meta.fragments >= hc,
      () => {
        if (buyHeart()) this.scene.restart()
      },
    )
    y += 38

    // Déblocage d'objets (rejoignent le pool des runs une fois achetés).
    const locked = lockedItems(meta.unlockedItems)
    if (locked.length === 0) {
      this.add
        .text(px, y + 12, 'Tous les objets sont débloqués. ✦', {
          fontFamily: FONTS.mono,
          fontSize: '13px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setData('slide', true)
    } else {
      for (const item of locked) {
        const cost = item.unlockCost ?? 0
        this.shopCard(
          left,
          right,
          y,
          `✦  ${item.name} — ${item.description}`,
          cost,
          meta.fragments >= cost,
          () => {
            if (unlockItem(item.id, cost)) this.scene.restart()
          },
        )
        y += 38
      }
    }

    // Entrée : le panneau et son contenu montent ensemble.
    const slideTargets = this.children.getAll().filter((o) => o.getData?.('slide'))
    slideTargets.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0))
    this.tweens.add({
      targets: slideTargets,
      alpha: 1,
      y: `-=14`,
      delay: 260,
      duration: 380,
      ease: 'Cubic.easeOut',
    })
  }

  /**
   * Carte d'achat encadrée : libellé à gauche, coût (gemme + valeur) à droite.
   * Abordable → cadre vif, survol vert, cliquable ; sinon grisée et inerte.
   */
  private shopCard(
    left: number,
    right: number,
    cy: number,
    label: string,
    cost: number,
    affordable: boolean,
    onClick: () => void,
  ): void {
    const w = right - left
    const h = 32
    const cx = (left + right) / 2
    const bg = this.add
      .rectangle(cx, cy, w, h, affordable ? 0x241c38 : 0x181320, affordable ? 0.9 : 0.6)
      .setStrokeStyle(3, INK, 1)
      .setDepth(6)
      .setData('slide', true)
    const accent = this.add
      .rectangle(left + 3, cy, 4, h - 8, affordable ? COLORS.treasure : COLORS.stroke, 1)
      .setDepth(7)
      .setData('slide', true)

    const text = this.add
      .text(left + 16, cy, label, {
        fontFamily: FONTS.mono,
        fontSize: '13px',
        color: affordable ? COLORS.text : COLORS.textDim,
      })
      .setOrigin(0, 0.5)
      .setDepth(7)
      .setData('slide', true)

    this.gemIcon(right - 52, cy, 0.8).setDepth(7).setData('slide', true)
    const costText = this.add
      .text(right - 40, cy, `${cost}`, {
        fontFamily: FONTS.comic,
        fontSize: '15px',
        color: affordable ? COLORS.victory : COLORS.textDim,
      })
      .setOrigin(0, 0.5)
      .setStroke('#120b1c', 2)
      .setDepth(7)
      .setData('slide', true)

    if (!affordable) {
      bg.setAlpha(0.6)
      return
    }
    // Survol : carte éclaircie, texte + liseré verts, coût en blanc.
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).setDepth(8)
    zone.on('pointerover', () => {
      bg.setFillStyle(0x2e2646, 1)
      text.setColor(COLORS.victory)
      accent.setFillStyle(COLORS.lumen, 1)
      costText.setColor('#ffffff')
    })
    zone.on('pointerout', () => {
      bg.setFillStyle(0x241c38, 0.9)
      text.setColor(COLORS.text)
      accent.setFillStyle(COLORS.treasure, 1)
      costText.setColor(COLORS.victory)
    })
    zone.on('pointerup', onClick)
  }

  /* ────────────────────────── Échos ────────────────────────── */

  /**
   * Pastille « N Échos » (haut-gauche) : combien de vos morts sommeillent dans
   * l'Abîme, prêtes à resurgir. N'apparaît que s'il en existe (menu épuré au
   * premier lancement).
   */
  private buildEchoNotice(count: number): void {
    if (count <= 0) return
    const x = 92
    const y = 28
    this.framedBox(x, y, 148, 30, 0x201a2e, 0.9, 3, 0.5, 0.5).setDepth(6)
    this.add
      .text(x, y, `◈  ${count} ÉCHO${count > 1 ? 'S' : ''}`, {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: COLORS.echoText,
      })
      .setOrigin(0.5)
      .setDepth(7)
  }

  /* ────────────────────────── Audio ────────────────────────── */

  /** Bouton de son encadré (haut-droit) : bascule et persiste la préférence. */
  private buildSoundToggle(meta: ReturnType<typeof loadMeta>): void {
    const x = GAME_WIDTH - 92
    const y = 28
    const muted = meta.prefs.muted
    const bg = this.framedBox(x, y, 148, 30, 0x201a2e, 0.9, 3, 0.5, 0.5).setDepth(6)
    const label = this.add
      .text(x, y, muted ? '♪  SON : COUPÉ' : '♪  SON : ACTIVÉ', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: muted ? COLORS.textDim : COLORS.victory,
      })
      .setOrigin(0.5)
      .setDepth(7)
    const zone = this.add.zone(x, y, 148, 30).setInteractive({ useHandCursor: true }).setDepth(8)
    zone.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1))
    zone.on('pointerout', () => bg.setFillStyle(0x201a2e, 0.9))
    zone.on('pointerup', () => {
      const next = !meta.prefs.muted
      sound.setMuted(next)
      savePrefs({ muted: next })
      this.scene.restart()
    })
    void label
  }

  /* ────────────────────────── Briques ────────────────────────── */

  /** Boîte à cadre épais noir (encre) + liseré pourpre + fond. */
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
    const box = this.add.rectangle(x, y, w, h, fill, fillAlpha).setOrigin(ox, oy)
    box.setStrokeStyle(inkWidth, INK, 1)
    this.add
      .rectangle(x, y, w - inkWidth, h - inkWidth, 0x000000, 0)
      .setOrigin(ox, oy)
      .setStrokeStyle(1.5, ACCENT, 0.6)
    return box
  }

  /** Petite gemme (Fragment) : losange cerné d'encre + reflet. */
  private gemIcon(x: number, y: number, scale = 1): Phaser.GameObjects.Image {
    if (!this.textures.exists('menu-gem')) {
      const g = this.add.graphics()
      const s = 16
      g.fillStyle(INK, 1)
      g.fillTriangle(s / 2, 0, s, s / 2, s / 2, s)
      g.fillTriangle(s / 2, 0, 0, s / 2, s / 2, s)
      g.fillStyle(COLORS.shard, 1)
      g.fillTriangle(s / 2, 2, s - 2, s / 2, s / 2, s - 2)
      g.fillTriangle(s / 2, 2, 2, s / 2, s / 2, s - 2)
      g.fillStyle(0xfff3a0, 0.85)
      g.fillTriangle(s / 2, 3, s / 2 + 3, s / 2, s / 2, s / 2 + 2)
      g.generateTexture('menu-gem', s, s)
      g.destroy()
      this.textures.get('menu-gem').setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    return this.add.image(x, y, 'menu-gem').setScale(scale)
  }
}
