import Phaser from 'phaser'
import { COLORS, FONTS } from '../theme'

const WIDTH = 300
const HEIGHT = 52

/**
 * Crée un bouton cliquable (rectangle + libellé) avec états animés :
 * survol (montée en échelle douce + fond éclairci + liseré lumineux),
 * appui (enfoncement), relâchement (retour élastique).
 * Renvoie le Container, positionné en (x, y) et centré.
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, WIDTH, HEIGHT, COLORS.panel, 1)
    .setStrokeStyle(1, COLORS.stroke)

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONTS.title,
      fontSize: '20px',
      color: COLORS.text,
    })
    .setOrigin(0.5)
    .setShadow(0, 2, '#05070d', 3)

  const button = scene.add.container(x, y, [bg, text])
  button.setSize(WIDTH, HEIGHT)
  button.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  })

  const tweenScale = (scale: number, duration = 110) => {
    scene.tweens.add({ targets: button, scale, duration, ease: 'Quad.easeOut' })
  }

  button.on('pointerover', () => {
    bg.setFillStyle(COLORS.panelHover, 1)
    bg.setStrokeStyle(1.5, COLORS.lumenGlow)
    tweenScale(1.04)
  })
  button.on('pointerout', () => {
    bg.setFillStyle(COLORS.panel, 1)
    bg.setStrokeStyle(1, COLORS.stroke)
    tweenScale(1)
  })
  button.on('pointerdown', () => tweenScale(0.96, 70))
  button.on('pointerup', () => {
    tweenScale(1.04, 90)
    onClick()
  })

  return button
}
