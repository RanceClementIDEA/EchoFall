import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadMeta,
  addFragments,
  buyHeart,
  heartCost,
  unlockItem,
  savePrefs,
  loadPrefs,
} from '../src/core/meta'

const KEY = 'echofall.save.v1'

// localStorage en mémoire (le node de Vitest n'en fournit pas).
beforeEach(() => {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  ;(globalThis as { localStorage: Storage }).localStorage = mock as unknown as Storage
})

describe('sauvegarde méta — persistance entre sessions', () => {
  it('démarre sur des valeurs par défaut', () => {
    const m = loadMeta()
    expect(m.fragments).toBe(0)
    expect(m.bonusHp).toBe(0)
    expect(m.unlockedItems).toEqual([])
    expect(m.prefs.muted).toBe(false)
  })

  it('persiste les pièces (Fragments)', () => {
    addFragments(120)
    expect(loadMeta().fragments).toBe(120)
    addFragments(30)
    expect(loadMeta().fragments).toBe(150)
  })

  it('+1 PV max : déduit et incrémente, ou échoue si trop cher', () => {
    expect(buyHeart()).toBeNull() // 0 fragment
    addFragments(200)
    const cost = heartCost(loadMeta())
    const after = buyHeart()!
    expect(after.bonusHp).toBe(1)
    expect(after.fragments).toBe(200 - cost)
  })

  it('débloque un objet : déduit, enregistre l’id, persiste', () => {
    expect(unlockItem('split-shot', 60)).toBeNull() // pas assez
    addFragments(100)
    const after = unlockItem('split-shot', 60)!
    expect(after.fragments).toBe(40)
    expect(after.unlockedItems).toContain('split-shot')
    // relecture après « redémarrage »
    expect(loadMeta().unlockedItems).toContain('split-shot')
    // déjà débloqué → refus (pas de double débit)
    expect(unlockItem('split-shot', 60)).toBeNull()
    expect(loadMeta().fragments).toBe(40)
  })

  it('persiste les préférences (audio)', () => {
    savePrefs({ muted: true })
    expect(loadPrefs().muted).toBe(true)
    savePrefs({ muted: false })
    expect(loadPrefs().muted).toBe(false)
  })

  it('tolère une sauvegarde corrompue (repart des défauts)', () => {
    localStorage.setItem(KEY, '{ pas du json')
    const m = loadMeta()
    expect(m.fragments).toBe(0)
    expect(m.unlockedItems).toEqual([])
  })

  it('lit une sauvegarde partielle : champs manquants → défauts', () => {
    localStorage.setItem(KEY, JSON.stringify({ fragments: 42 }))
    const m = loadMeta()
    expect(m.fragments).toBe(42)
    expect(m.bonusHp).toBe(0)
    expect(m.unlockedItems).toEqual([])
    expect(m.prefs.muted).toBe(false)
  })
})
