/**
 * Constantes visuelles partagées.
 * Ce module n'importe RIEN : il est importé par la config, les scènes et l'UI,
 * ce qui évite tout cycle d'import.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DIRECTION ARTISTIQUE — « Retro-Cartoon Punchy » (Dark Comic)
 * ─────────────────────────────────────────────────────────────────────────
 * Charte à respecter par TOUTES les entités et TOUS les décors :
 *  • FONDS  — sombres et terreux : gris ardoise & pourpre profond (froids,
 *    désaturés, jamais bleu électrique). Ils reculent, ne captent pas l'œil.
 *  • ENTITÉS & TIRS — ultra-saturés, vibrants, contrastés : orange feu
 *    (joueur/tirs alliés), violet électrique (charger), jaune solaire
 *    (shooter/fragments), + rouge feu (boss) et magenta hostile (tirs ennemis).
 *  • ENCRE  — chaque entité est cernée d'un trait quasi-noir (`ink`), signature
 *    « comic », pour se détacher nettement du fond quelle que soit la dalle.
 * Le contraste fond terreux ↔ couleurs pétantes assure la lisibilité immédiate
 * du combat et le cachet cartoon.
 */

export const GAME_WIDTH = 960
export const GAME_HEIGHT = 540

/** Profondeurs de rendu normalisées (évite les chevauchements accidentels). */
export const DEPTH = {
  floor: 0,
  decor: 1,
  fxUnder: 2, // halo, poussière
  entities: 5,
  fxOver: 8, // éclats, étincelles
  vignette: 30,
  screenFx: 90, // flash de dégâts plein écran
  ui: 100,
  wipe: 10_000, // voile de transition
} as const

export const COLORS = {
  // ── FONDS — l'Abîme : sombres & terreux (pourpre profond → ardoise) ──
  abyssTop: 0x181320, // nuit pourpre (haut du dégradé)
  abyssBottom: 0x2b2838, // gris ardoise violacé (bas)
  // ── DÉCOR du donjon — ardoise & pourpre sombres, mats ──
  floor: 0x221c30,
  floorAlt: 0x29233a, // damier subtil
  wall: 0x3a3152,
  wallEdge: 0x8257cf, // liseré de relief — pourpre électrique atténué
  obstacle: 0x322a46,
  // ── ENCRE — cerne « comic » quasi-noir de toutes les entités ──
  ink: 0x120b1c,
  // ── LUMEN — chaleur amicale = ORANGE FEU (joueur, halo, tirs alliés) ──
  lumen: 0xff6a1e, // orange feu : corps du joueur, étincelle des bombes
  lumenGlow: 0xffc24a, // halo/traînée/projectiles alliés (orange clair vif)
  // ── ENTITÉS & TIRS — ultra-saturés, vibrants ──
  door: 0x36c9ff, // portes ouvertes : cyan vif (passage sûr)
  doorLocked: 0xff3b57, // portes verrouillées : rouge alarme
  enemy: 0xa93aff, // charger — violet électrique
  shooter: 0xffd21e, // shooter — jaune solaire
  orbiter: 0x38d8ff, // rôdeur — cyan électrique (orbite + ruée)
  splitter: 0x8cf03c, // gélif — vert acide (se scinde à la mort)
  bomber: 0xff8c1a, // sapeur — orange brûlé (explose au contact)
  sentinel: 0xd8a2ff, // sentinelle — lavande vive (tourelle radiale)
  enemyBullet: 0xff3ea5, // projectiles ennemis — magenta hostile
  boss: 0xff2e46, // gardien — rouge feu
  echo: 0xb9a8ff, // Écho (revenant) — spectral froid : violet pâle blafard
  echoGlow: 0xe0d6ff, // halo / éclats / sigil de l'Écho — spectral clair
  shard: 0xffd42e, // fragments — jaune solaire
  treasure: 0x28e6a8, // trésor — vert menthe vif
  // ── UI — panneaux / boutons (ardoise-pourpre sombre) ──
  panel: 0x201a2e,
  panelHover: 0x2e2542,
  stroke: 0x5b4a86,
  // ── Texte (chaînes CSS pour les objets Text) ──
  text: '#f6f0ff',
  textDim: '#9a8ec2',
  victory: '#ffd23e', // jaune solaire
  danger: '#ff5470',
  echoText: '#c7b8ff', // spectral clair (annonces/invites d'Écho)
} as const

/** Familles de polices unifiées (fontes système, cohérentes partout). */
export const FONTS = {
  title: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", Courier, monospace',
  /** Police « comics » des pop-ups d'impact (POW!, dégâts) — fontes système
   *  condensées et massives, façon onomatopées de BD. */
  comic: 'Impact, "Arial Black", "Franklin Gothic Bold", sans-serif',
} as const
