/**
 * SoundManager — audio 100 % procédural (Web Audio API), sans aucun fichier.
 *
 * Génère à la volée les bruitages (synthèse d'oscillateurs + bruit filtré) et
 * une musique d'ambiance de donjon en boucle. C'est le choix adapté à un
 * prototype hors-ligne : rien à charger, tout est synthétisé.
 *
 * Le navigateur exige un geste utilisateur avant de démarrer l'audio :
 * `resume()` est appelé au premier clic / à la première touche (et au lancement
 * d'une run, qui suit toujours un clic sur « Jouer »). Tout est protégé : si
 * l'AudioContext est indisponible, les méthodes deviennent de simples no-op.
 */

interface ToneOpts {
  freq: number
  type?: OscillatorType
  dur: number
  gain?: number
  slideTo?: number
  attack?: number
}

interface NoiseOpts {
  dur: number
  gain?: number
  filterFreq?: number
}

const MASTER_VOLUME = 0.5
const MUSIC_STEP_MS = 460

class SoundManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private musicStep = 0

  /** Crée (paresseusement) l'AudioContext. Renvoie null si indisponible. */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME
      this.master.connect(this.ctx.destination)
    } catch {
      this.ctx = null
    }
    return this.ctx
  }

  /** Reprend l'audio — à appeler sur un geste utilisateur (clic / touche). */
  resume(): void {
    const ctx = this.ensure()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  /** État interne (debug / tests). */
  debugState(): { ctxState: string; musicPlaying: boolean; muted: boolean } {
    return {
      ctxState: this.ctx?.state ?? 'none',
      musicPlaying: this.musicTimer !== null,
      muted: this.muted,
    }
  }

  /** Coupe / rétablit le son. Renvoie le nouvel état « muet ». */
  toggleMute(): boolean {
    return this.setMuted(!this.muted)
  }

  /** Force l'état muet (ex. depuis les préférences sauvegardées). */
  setMuted(muted: boolean): boolean {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME
    return this.muted
  }

  /** État muet courant. */
  isMuted(): boolean {
    return this.muted
  }

  /* ────────────────────────── Bruitages ────────────────────────── */

  /** Tir du joueur (blip descendant). */
  shoot(): void {
    this.tone({ freq: 680, slideTo: 220, type: 'square', dur: 0.09, gain: 0.13 })
  }

  /** Ennemi touché (petit clic mat). */
  enemyHit(): void {
    this.tone({ freq: 300, slideTo: 170, type: 'square', dur: 0.05, gain: 0.11 })
  }

  /** Dégâts subis par le joueur (buzz grave + bruit). */
  playerHurt(): void {
    this.tone({ freq: 180, slideTo: 70, type: 'sawtooth', dur: 0.22, gain: 0.22 })
    this.noise({ dur: 0.16, gain: 0.12, filterFreq: 900 })
  }

  /** Ouverture de coffre / prise d'objet (arpège ascendant). */
  chestOpen(): void {
    const notes = [523, 659, 784, 1047] // Do-Mi-Sol-Do (majeur, gratifiant)
    notes.forEach((freq, i) => {
      this.schedule(i * 0.08, () => this.tone({ freq, type: 'triangle', dur: 0.2, gain: 0.15 }))
    })
  }

  /** Mort (explosion : chute de ton + bruit). */
  death(): void {
    this.tone({ freq: 400, slideTo: 55, type: 'sawtooth', dur: 0.34, gain: 0.2 })
    this.noise({ dur: 0.3, gain: 0.18, filterFreq: 1100 })
  }

  /* ────────────────────────── Musique de donjon ────────────────────────── */

  /** Démarre (ou redémarre) la boucle de musique d'ambiance. */
  startMusic(): void {
    this.resume()
    if (this.musicTimer !== null) return
    this.musicStep = 0
    this.musicTimer = setInterval(() => this.musicTick(), MUSIC_STEP_MS)
  }

  /** Arrête la musique (retour menu / fin de run). */
  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }

  /** Gèle la musique sans réinitialiser la mélodie (pause). */
  pauseMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }

  /** Reprend la musique là où elle en était. */
  resumeMusic(): void {
    if (this.musicTimer === null) {
      this.resume()
      this.musicTimer = setInterval(() => this.musicTick(), MUSIC_STEP_MS)
    }
  }

  /** Un pas de la boucle : basse lente (minor) + mélodie éparse et grave. */
  private musicTick(): void {
    const bass = [55, 55, 62, 49] // A1 A1 B1 G1
    const melody = [220, 262, 0, 196, 0, 165, 0, 0]
    const step = this.musicStep
    if (step % 4 === 0) {
      this.tone({ freq: bass[(step / 4) % bass.length], type: 'triangle', dur: 0.9, gain: 0.08 })
    }
    const m = melody[step % melody.length]
    if (m) this.tone({ freq: m, type: 'sine', dur: 0.4, gain: 0.05 })
    this.musicStep = (step + 1) % 64
  }

  /* ────────────────────────── Primitives de synthèse ────────────────────── */

  private tone(opts: ToneOpts): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = opts.type ?? 'square'
    osc.frequency.setValueAtTime(opts.freq, t)
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t + opts.dur)
    }
    const peak = opts.gain ?? 0.2
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.005))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + opts.dur + 0.02)
  }

  private noise(opts: NoiseOpts): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const len = Math.max(1, Math.floor(ctx.sampleRate * opts.dur))
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = opts.filterFreq ?? 1200
    const gain = ctx.createGain()
    const peak = opts.gain ?? 0.2
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + opts.dur)
  }

  /** Planifie un effet un peu plus tard (arpèges), sans bloquer. */
  private schedule(delaySec: number, fn: () => void): void {
    setTimeout(fn, Math.round(delaySec * 1000))
  }
}

/** Singleton partagé par tout le jeu. */
export const sound = new SoundManager()
