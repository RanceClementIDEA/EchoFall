import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../theme'
import { GameState, type ResultData, type RunSummary } from '../state/GameState'
import { gameFlow } from '../state/GameFlow'
import { formatDuration } from '../core/format'
import { paintAbyss } from '../ui/background'
import { createButton } from '../ui/Button'

/**
 * ResultScene — écran de fin de run, à deux visages :
 *  • VICTOIRE de fin de donjon (le Gardien est tombé),
 *  • GAME OVER (permadeath),
 * tous deux avec le **bilan de la run** : ennemis vaincus, temps passé,
 * étage atteint, salles, éclats, Fragments gagnés (calculés une seule fois
 * par RunState.finishRun, reçus ici en données).
 */
export class ResultScene extends Phaser.Scene {
  private summary: RunSummary | null = null

  constructor() {
    super(GameState.Result)
  }

  init(data: Partial<ResultData>): void {
    this.summary = data.summary ?? null
  }

  create(): void {
    paintAbyss(this)
    this.cameras.main.fadeIn(260, 5, 7, 13) // fondu d'arrivée
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.4).setOrigin(0)

    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2
    const isWin = this.summary?.outcome === 'victory'

    // Titre : entrée en tombant + fondu (dramatique mais bref).
    const title = this.add
      .text(cx, cy - 168, isWin ? 'DONJON VAINCU' : 'GAME OVER', {
        fontFamily: 'Georgia, serif',
        fontSize: '56px',
        color: isWin ? COLORS.victory : COLORS.danger,
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#05070d', 8)
      .setScale(1.25)
      .setAlpha(0)
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' })

    this.add
      .text(
        cx,
        cy - 122,
        isWin
          ? "Le dernier Gardien est tombé — l'Abîme est purgé de bout en bout. Ashport respire."
          : "L'Abîme garde votre écho. Il vous attendra, là où vous êtes tombé·e.",
        { fontFamily: 'Georgia, serif', fontSize: '15px', color: COLORS.textDim },
      )
      .setOrigin(0.5)

    // ── Panneau de bilan ──
    if (this.summary) this.buildStatsPanel(cx, cy - 24, this.summary)

    // ── Boutons (sous le panneau, qui peut compter jusqu'à 8 lignes) ──
    createButton(this, cx, cy + 104, 'Recommencer', () => gameFlow.restart(this))
    createButton(this, cx, cy + 162, 'Retour à la Citadelle', () => gameFlow.toMenu(this))

    this.add
      .text(cx, GAME_HEIGHT - 24, 'Entrée : recommencer   ·   Échap : Citadelle', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5)

    this.input.keyboard?.on('keydown-ENTER', () => gameFlow.restart(this))
    this.input.keyboard?.on('keydown-ESC', () => gameFlow.toMenu(this))
  }

  /** Tableau de statistiques encadré (deux colonnes label / valeur). */
  private buildStatsPanel(cx: number, cy: number, s: RunSummary): void {
    const rows: [string, string][] = [
      ['Ennemis vaincus', String(s.enemiesKilled)],
      ['Temps de la run', formatDuration(s.durationMs)],
      ['Strate atteinte', `${s.floorReached} / ${s.totalStrata} — ${s.stratumName}`],
      ['Salles explorées', `${s.roomsExplored} / ${s.totalRooms}`],
      ['Éclats de Lumen', String(s.shards)],
    ]
    // Lignes conditionnelles (bilan sobre quand il n'y a rien à dire).
    if (s.bossesDefeated > 0) rows.push(['Gardiens vaincus', String(s.bossesDefeated)])
    if (s.echoesBanished > 0) rows.push(['Échos apaisés', String(s.echoesBanished)])
    rows.push(['Fragments gagnés', `+${s.fragmentsEarned}  (total ${s.fragmentsTotal})`])

    const w = 430
    const rowH = 22
    const h = rows.length * rowH + 24
    const top = cy - h / 2

    this.add.rectangle(cx, cy, w, h, COLORS.panel, 0.55).setStrokeStyle(2, COLORS.stroke)

    rows.forEach(([label, value], i) => {
      const y = top + 12 + i * rowH + rowH / 2
      this.add
        .text(cx - w / 2 + 20, y, label, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: COLORS.textDim,
        })
        .setOrigin(0, 0.5)
      this.add
        .text(cx + w / 2 - 20, y, value, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: COLORS.text,
        })
        .setOrigin(1, 0.5)
    })
  }
}
