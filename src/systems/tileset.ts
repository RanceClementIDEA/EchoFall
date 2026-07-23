import Phaser from 'phaser'
import { COLORS, DEPTH, GAME_WIDTH, GAME_HEIGHT } from '../theme'
import type { EnvPalette } from '../core/strata'

/**
 * Tileset — habillage « Dark Comic » RICHE du donjon, PARAMÉTRÉ PAR STRATE.
 *
 * Chaque strate (core/strata.ts) fournit sa palette d'environnement (tons de
 * pierre, liseré, torches, runes) : les mêmes fonctions habillent les Failles
 * d'Ardoise, les Jardins Fongiques ou la Fournaise — seule la matière change.
 * Tout est GÉNÉRÉ par défaut (aucun asset requis) et purement VISUEL : les
 * corps physiques (murs, obstacles) restent des rectangles intacts.
 *
 * **Assets optionnels** (`src/assets/env/`, cf. README) : si une texture
 * `env-<id>-floor` / `env-<id>-obstacle` est chargée, elle REMPLACE le rendu
 * procédural correspondant (le sol est répété en tuile, l'obstacle dessiné à
 * la place du bloc) — sans toucher aux collisions.
 *
 *  • SOL   — dalles de pierre TAILLÉES : biseau éclairé haut-gauche / ombré
 *    bas-droite (relief 3D), joints d'encre francs, fissures, éclats et
 *    quelques dalles à rune ambiante (variété déterministe).
 *  • MURS  — appareil de PIERRE (assises de blocs à joints décalés), liseré
 *    de crête éclairé côté salle, ombre portée prononcée sur le sol, hachures.
 *  • OBSTACLES — blocs taillés (appareil + biseau + ombre portée bas-droite).
 *  • TORCHES — appliques murales à flamme et halo chaud VACILLANT, aux
 *    couleurs de la strate (braises orange, spores turquoise…).
 */

/** Environnement d'une salle : identifiant de strate + palette. */
export interface EnvSkin {
  id: string
  pal: EnvPalette
}

const SLAB = 48
const GRID = 4
const GROUT = 2
const WALL_SHADOW = 9
const SHADOW_ALPHA = 0.34

export type WallSide = 'north' | 'south' | 'west' | 'east'

export function ensureTilesetTextures(scene: Phaser.Scene, env: EnvSkin): void {
  makeSlabTile(scene, env)
  makeHatchTile(scene)
}

/** Tuile 4×4 dalles taillées : biseau 2 tons, joints d'encre, fissures, runes. */
function makeSlabTile(scene: Phaser.Scene, env: EnvSkin): void {
  const key = `tile-slabs-${env.id}`
  if (scene.textures.exists(key)) return
  const stones = env.pal.stones
  const size = SLAB * GRID
  const g = scene.add.graphics()
  g.fillStyle(COLORS.ink, 1)
  g.fillRect(0, 0, size, size) // fond = joints d'encre

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = i * SLAB + GROUT
      const y = j * SLAB + GROUT
      const s = SLAB - GROUT * 2

      g.fillStyle(stones[(i * 3 + j * 5 + (i * j) % 2) % stones.length], 1)
      g.fillRect(x, y, s, s)
      // Biseau taillé : arêtes HAUTE+GAUCHE claires, BASSE+DROITE sombres.
      g.fillStyle(0xffffff, 0.05)
      g.fillRect(x + 2, y + 2, s - 4, 2)
      g.fillRect(x + 2, y + 2, 2, s - 4)
      g.fillStyle(COLORS.ink, 0.34)
      g.fillRect(x + 2, y + s - 4, s - 4, 2)
      g.fillRect(x + s - 4, y + 2, 2, s - 4)
      // Bordure d'encre franche.
      g.lineStyle(1.5, COLORS.ink, 1)
      g.strokeRect(x + 1, y + 1, s - 2, s - 2)

      // Fissure (~1 dalle/5).
      if ((i * 7 + j * 11) % 5 === 0) {
        const cx = x + 8 + ((i * 5 + j * 3) % 12)
        g.lineStyle(1.5, COLORS.ink, 0.72)
        g.beginPath()
        g.moveTo(cx, y + 6)
        g.lineTo(cx + 6 - ((i + j) % 5), y + 18 + ((j * 7) % 6))
        g.lineTo(cx + 2 + ((i * 3) % 8), y + s - 12)
        g.strokePath()
      }
      // Éclat de coin (~1 dalle/7).
      if ((i * 13 + j * 3) % 7 === 0) {
        const corner = (i + j) % 4
        const px = corner % 2 === 0 ? x + 3 : x + s - 3
        const py = corner < 2 ? y + 3 : y + s - 3
        g.fillStyle(COLORS.ink, 0.6)
        g.fillTriangle(px, py, px + (corner % 2 === 0 ? 7 : -7), py, px, py + (corner < 2 ? 7 : -7))
      }
      // Rune ambiante discrète (~1 dalle/11) — teintée par la strate.
      if ((i * 5 + j * 17) % 11 === 0) {
        g.lineStyle(1.5, env.pal.runeGlow, 0.06)
        const rx = x + s / 2, ry = y + s / 2, r = s * 0.22
        g.strokeRect(rx - r, ry - r, r * 2, r * 2)
        g.beginPath(); g.moveTo(rx - r, ry); g.lineTo(rx + r, ry); g.strokePath()
        g.beginPath(); g.moveTo(rx, ry - r); g.lineTo(rx, ry + r); g.strokePath()
      }
    }
  }
  g.generateTexture(key, size, size)
  g.destroy()
}

/** Hachures « crayonnées » raccordables (relief des murs/obstacles). */
function makeHatchTile(scene: Phaser.Scene): void {
  if (scene.textures.exists('wall-hatch')) return
  const T = 64
  const g = scene.add.graphics()
  for (let t = 0; t < T; t += 8) {
    g.lineStyle(1 + (t % 3 === 0 ? 0.5 : 0), COLORS.ink, 0.1 + ((t / 8) % 3) * 0.03)
    g.beginPath(); g.moveTo(t, 0); g.lineTo(t - T, T); g.strokePath()
    g.beginPath(); g.moveTo(t + T, 0); g.lineTo(t, T); g.strokePath()
  }
  g.generateTexture('wall-hatch', T, T)
  g.destroy()
}

/** Sol de la salle : texture d'asset `env-<id>-floor` si fournie, sinon dalles. */
export function paintSlabFloor(scene: Phaser.Scene, env: EnvSkin): Phaser.GameObjects.TileSprite {
  const assetKey = `env-${env.id}-floor`
  const key = scene.textures.exists(assetKey) ? assetKey : `tile-slabs-${env.id}`
  return scene.add
    .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
    .setOrigin(0)
    .setDepth(DEPTH.floor)
}

export function addHatch(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.5): void {
  scene.add.tileSprite(x, y, w, h, 'wall-hatch').setAlpha(alpha).setDepth(DEPTH.decor)
}

/** Appareil de pierre (assises de blocs à joints décalés) sur une zone. */
function masonry(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number): void {
  const g = scene.add.graphics().setDepth(DEPTH.decor)
  const x0 = cx - w / 2, y0 = cy - h / 2
  g.lineStyle(1.5, COLORS.ink, 0.55)
  const rowH = 11
  let row = 0
  for (let y = y0 + rowH; y < y0 + h; y += rowH, row++) {
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.strokePath()
  }
  row = 0
  for (let y = y0; y < y0 + h; y += rowH, row++) {
    const off = (row % 2) * 9
    for (let x = x0 + off + 9; x < x0 + w; x += 18) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, Math.min(y + rowH, y0 + h)); g.strokePath()
    }
  }
}

/**
 * Habille un mur : ombre portée sur le sol (arête intérieure), appareil de
 * pierre, hachures, et liseré de CRÊTE éclairé (accent de la strate).
 */
export function dressWall(
  scene: Phaser.Scene,
  rect: Phaser.GameObjects.Rectangle,
  side: WallSide,
  env: EnvSkin,
): void {
  const { x, y } = rect
  const w = rect.width
  const h = rect.height
  const s = WALL_SHADOW

  // Ombre portée (bande d'encre sur le sol, côté salle).
  const sh = {
    north: { x, y: y + h / 2 + s / 2, w, h: s },
    south: { x, y: y - h / 2 - s / 2, w, h: s },
    west: { x: x + w / 2 + s / 2, y, w: s, h },
    east: { x: x - w / 2 - s / 2, y, w: s, h },
  }[side]
  scene.add.rectangle(sh.x, sh.y, sh.w, sh.h, COLORS.ink, SHADOW_ALPHA).setDepth(DEPTH.decor)

  masonry(scene, x, y, w, h)
  addHatch(scene, x, y, w, h, 0.4)

  // Liseré de crête éclairé (pierre captant la lumière) côté intérieur.
  const t = 2
  const edge = {
    north: { x, y: y + h / 2 - t / 2, w, h: t },
    south: { x, y: y - h / 2 + t / 2, w, h: t },
    west: { x: x + w / 2 - t / 2, y, w: t, h },
    east: { x: x - w / 2 + t / 2, y, w: t, h },
  }[side]
  scene.add.rectangle(edge.x, edge.y, edge.w, edge.h, env.pal.wallEdge, 0.6).setDepth(DEPTH.decor)
}

/**
 * Bloc taillé aux couleurs de la strate (appareil + biseau + ombre portée) —
 * ou l'asset `env-<id>-obstacle` s'il est fourni. Renvoie le CORPS physique
 * (rectangle 64×64 inchangé) dans les deux cas.
 */
export function dressObstacle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  env: EnvSkin,
  size = 64,
): Phaser.GameObjects.Rectangle {
  const assetKey = `env-${env.id}-obstacle`
  if (scene.textures.exists(assetKey)) {
    // Skin d'asset : image visible + corps physique invisible (même hitbox).
    scene.add.rectangle(x + 6, y + 8, size, size, COLORS.ink, SHADOW_ALPHA).setDepth(DEPTH.decor)
    scene.add.image(x, y, assetKey).setDisplaySize(size, size).setDepth(DEPTH.decor)
    return scene.add.rectangle(x, y, size, size, 0x000000, 0)
  }
  scene.add.rectangle(x + 6, y + 8, size, size, COLORS.ink, SHADOW_ALPHA).setDepth(DEPTH.decor)
  const r = scene.add.rectangle(x, y, size, size, env.pal.obstacle, 1)
  r.setStrokeStyle(3, COLORS.ink, 1)
  r.setDepth(DEPTH.decor)
  masonry(scene, x, y, size, size)
  const g = scene.add.graphics().setDepth(DEPTH.decor)
  g.fillStyle(0xffffff, 0.07)
  g.fillRect(x - size / 2 + 3, y - size / 2 + 3, size - 6, 3)
  g.fillRect(x - size / 2 + 3, y - size / 2 + 3, 3, size - 6)
  g.fillStyle(COLORS.ink, 0.32)
  g.fillRect(x - size / 2 + 3, y + size / 2 - 6, size - 6, 3)
  g.fillRect(x + size / 2 - 6, y - size / 2 + 3, 3, size - 6)
  return r
}

/**
 * Applique murale : support d'encre, flamme (corps + cœur clair) et HALO chaud
 * additif, tous deux VACILLANT en boucle — aux couleurs de la strate.
 */
export function addTorch(scene: Phaser.Scene, x: number, y: number, env: EnvSkin): void {
  // Halo (additif) qui respire.
  const glow = scene.add
    .circle(x, y + 2, 40, env.pal.torch, 0.14)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.fxUnder)
  scene.tweens.add({
    targets: glow, scale: 1.18, alpha: 0.2, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  })
  // Applique (support sombre).
  const g = scene.add.graphics().setDepth(DEPTH.vignette + 1)
  g.fillStyle(COLORS.ink, 1)
  g.fillRect(x - 2, y, 4, 9)
  g.fillStyle(env.pal.wallEdge, 1)
  g.fillRect(x - 5, y + 7, 10, 3)
  // Flamme (au-dessus de la vignette → nette).
  const flame = scene.add.ellipse(x, y - 3, 8, 12, env.pal.torch, 0.95).setDepth(DEPTH.vignette + 1)
  const core = scene.add.ellipse(x, y - 4, 4, 7, env.pal.torchCore, 1).setDepth(DEPTH.vignette + 1)
  scene.tweens.add({
    targets: [flame, core], scaleY: 1.35, scaleX: 0.85, y: '-=2',
    duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  })
}

/** Pose des torches sur les murs latéraux (hors gouttières de portes centrales). */
export function addTorches(scene: Phaser.Scene, env: EnvSkin): void {
  const m = 40
  for (const ty of [GAME_HEIGHT / 3, (GAME_HEIGHT * 2) / 3]) {
    addTorch(scene, m, ty, env)
    addTorch(scene, GAME_WIDTH - m, ty, env)
  }
}
