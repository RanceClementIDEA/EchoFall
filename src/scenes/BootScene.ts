import Phaser from 'phaser'
import { GameState } from '../state/GameState'
import { gameFlow } from '../state/GameFlow'

/**
 * Assets du héros/ennemis découverts AU BUILD par Vite (`import.meta.glob`) et
 * inlinés (data-URI) dans le build single-file — aucune requête réseau. Deux
 * formats acceptés, même convention de nommage (`hero-run-est`, `foe-…`) :
 *   • **PNG** : bande horizontale de frames carrées (ou 1 image = statique) ;
 *   • **GIF animé** : décodé frame par frame en spritesheet (cf. decodeGifs).
 * Aucun fichier → objets vides → le jeu garde ses textures procédurales.
 */
const PNGS: Record<string, string> = {
  ...import.meta.glob('../assets/hero/hero-*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/foes/foe-*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/echo/echo-*.png', { eager: true, query: '?url', import: 'default' }),
}
const GIFS: Record<string, string> = {
  ...import.meta.glob('../assets/hero/hero-*.gif', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/foes/foe-*.gif', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/echo/echo-*.gif', { eager: true, query: '?url', import: 'default' }),
}
/**
 * Textures d'ENVIRONNEMENT par strate (`src/assets/env/`, cf. README) :
 * chargées telles quelles (JAMAIS découpées en frames) — `env-<id>-floor` est
 * répétée en tuile par le sol, `env-<id>-obstacle` habille les blocs.
 */
const ENV_PNGS: Record<string, string> = {
  ...import.meta.glob('../assets/env/env-*.png', { eager: true, query: '?url', import: 'default' }),
}

/** '../assets/hero/hero-run-est.png' → 'hero-run-est' (PNG comme GIF). */
const keyOf = (path: string): string => path.split('/').pop()!.replace(/\.(png|gif)$/, '')
/** Anims « une fois » (les autres bouclent). */
const ONCE = (key: string) => /aim|hurt|fire/.test(key)

export class BootScene extends Phaser.Scene {
  constructor() {
    super(GameState.Boot)
  }

  preload(): void {
    // Les PNG sont chargés comme images (taille de frame déduite ensuite).
    // Les GIF sont récupérés/décodés en `create` (fetch + ImageDecoder natif).
    for (const [path, url] of Object.entries(PNGS)) {
      this.load.image(`raw:${keyOf(path)}`, url)
    }
    // Textures d'environnement : images directes, jamais découpées en frames.
    for (const [path, url] of Object.entries(ENV_PNGS)) {
      this.load.image(keyOf(path), url)
    }
  }

  create(): void {
    this.sliceSheets()
    // Les GIF sont décodés en asynchrone ; on n'entre au menu qu'ensuite (mais
    // TOUJOURS, même en cas d'échec — `finally`).
    void this.decodeGifs().finally(() => gameFlow.toMenu(this))
  }

  /**
   * Convertit chaque PNG chargé en **spritesheet à frames CARRÉES** (côté =
   * hauteur de la bande). 32×32, 48×48 — ou toute taille — sans convention ;
   * une image carrée = 1 frame (héros statique). Tailles mélangeables entre
   * personnages ; une seule taille par personnage (la hurtbox se centre).
   */
  private sliceSheets(): void {
    for (const path of Object.keys(PNGS)) {
      const key = keyOf(path)
      const rawKey = `raw:${key}`
      if (!this.textures.exists(rawKey) || this.textures.exists(key)) continue
      const img = this.textures.get(rawKey).getSourceImage() as HTMLImageElement
      const size = img.height
      if (size > 0 && img.width >= size && img.width % size === 0) {
        this.textures.addSpriteSheet(key, img, { frameWidth: size, frameHeight: size })
      } else if (img.width > 0 && img.height > 0) {
        this.textures.addSpriteSheet(key, img, { frameWidth: img.width, frameHeight: img.height })
      }
    }
  }

  /**
   * Décode les **GIF animés** frame par frame via l'API native `ImageDecoder`
   * (WebCodecs) et les monte en spritesheet + animation. Chaque frame est
   * dessinée côte à côte sur un canvas (transparence conservée) ; la cadence
   * vient des délais du GIF. Un GIF **remplace** le PNG de même clé.
   *
   * `ImageDecoder` est disponible sur les navigateurs récents (Chrome/Edge/
   * Opera, Firefox ≥ 133, Safari ≥ 16.4). Absent/erreur → on ignore le GIF
   * (repli sur PNG/procédural), le jeu reste jouable.
   */
  private async decodeGifs(): Promise<void> {
    const entries = Object.entries(GIFS)
    if (entries.length === 0) return
    const ID = (globalThis as unknown as { ImageDecoder?: unknown }).ImageDecoder as
      | (new (init: { data: ArrayBuffer; type: string }) => {
          tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } }
          decode: (o: { frameIndex: number }) => Promise<{ image: CanvasImageSource & { displayWidth: number; displayHeight: number; duration?: number; close: () => void } }>
          close: () => void
        })
      | undefined
    if (!ID) {
      console.warn('[Echofall] ImageDecoder indisponible : GIF ignorés (repli PNG/procédural).')
      return
    }

    for (const [path, url] of entries) {
      const key = keyOf(path)
      try {
        const data = await (await fetch(url)).arrayBuffer()
        const dec = new ID({ data, type: 'image/gif' })
        await dec.tracks.ready
        const n = dec.tracks.selectedTrack?.frameCount ?? 0
        if (n === 0) { dec.close(); continue }

        const first = await dec.decode({ frameIndex: 0 })
        const w = first.image.displayWidth
        const h = first.image.displayHeight
        const strip = document.createElement('canvas')
        strip.width = w * n
        strip.height = h
        const ctx = strip.getContext('2d')!
        let totalUs = 0
        ctx.drawImage(first.image, 0, 0)
        totalUs += first.image.duration ?? 100000
        first.image.close()
        for (let i = 1; i < n; i++) {
          const { image } = await dec.decode({ frameIndex: i })
          ctx.drawImage(image, i * w, 0)
          totalUs += image.duration ?? 100000
          image.close()
        }
        dec.close()

        // Un GIF prime sur un PNG de même clé (on remplace).
        if (this.textures.exists(key)) this.textures.remove(key)
        if (this.anims.exists(key)) this.anims.remove(key)

        const tex = this.textures.addCanvas(key, strip)
        if (!tex) continue
        for (let i = 0; i < n; i++) tex.add(i, 0, i * w, 0, w, h)
        const fps = Phaser.Math.Clamp(Math.round(n / (totalUs / 1e6)), 1, 30)
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: n - 1 }),
          frameRate: fps,
          repeat: ONCE(key) ? 0 : -1,
        })
      } catch (e) {
        console.warn(`[Echofall] GIF « ${key} » non décodé :`, e)
      }
    }
  }
}
