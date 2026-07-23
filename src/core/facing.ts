/**
 * Choix de frame pour une **feuille de rotation** — logique pure, sans Phaser,
 * donc testable.
 *
 * Une « feuille de rotation » est une seule image (GIF/PNG) dont **chaque frame
 * représente une direction** (le héros tourné). Au lieu d'ANIMER la feuille, on
 * affiche UNE frame figée = la direction où le héros regarde. Cette fonction
 * traduit un angle de regard en index de frame.
 */

/**
 * @param angleRad   angle de regard en radians (0 = Est ; l'angle augmente dans
 *                   le sens horaire, car l'axe Y va vers le BAS à l'écran).
 * @param frameCount nombre de frames de la feuille (ex. 8 pour 8 directions).
 * @param offsetEighths quelle direction montre la **frame 0**, en HUITIÈMES de
 *                   tour : 0 = Est, 2 = Sud, 4 = Ouest, 6 = Nord.
 * @param clockwise  les frames suivantes tournent-elles dans le sens horaire ?
 * @returns index de frame dans [0, frameCount-1].
 */
export function turnFrameForAngle(
  angleRad: number,
  frameCount: number,
  offsetEighths = 0,
  clockwise = true,
): number {
  if (frameCount <= 1) return 0
  let turns = angleRad / (Math.PI * 2) // 0 = Est, +horaire (Y vers le bas)
  if (!clockwise) turns = -turns
  turns -= offsetEighths / 8 // aligne la frame 0 sur sa direction
  const idx = Math.round(turns * frameCount)
  return ((idx % frameCount) + frameCount) % frameCount // ramène dans [0, N-1]
}
