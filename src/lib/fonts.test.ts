import { describe, it, expect } from 'vitest'
import fontImports from '../fonts.ts?raw'
import { DEFAULT_FONT_ID, FONT_OPTIONS, SYSTEM_FONT_STACK, fontFamilyCss, getFontOption } from './fonts'

describe('font registry', () => {
  it('offers the eight approved fonts, Anton first', () => {
    expect(FONT_OPTIONS.map((f) => f.label)).toEqual([
      'Anton',
      'Bebas Neue',
      'Archivo Black',
      'Inter',
      'Permanent Marker',
      'Bangers',
      'Special Elite',
      'Playfair Display',
    ])
  })

  it('has unique ids, and the default font is one of them', () => {
    const ids = FONT_OPTIONS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_FONT_ID)
    expect(DEFAULT_FONT_ID).toBe('anton')
  })

  it('looks a font up by id, and returns undefined for an unknown or missing id', () => {
    expect(getFontOption('bangers')?.family).toBe('Bangers')
    expect(getFontOption('nope')).toBeUndefined()
    expect(getFontOption(undefined)).toBeUndefined()
  })

  it('builds a CSS font-family with the system stack as fallback, or just the stack for no font', () => {
    expect(fontFamilyCss(getFontOption('anton'))).toBe(`"Anton", ${SYSTEM_FONT_STACK}`)
    expect(fontFamilyCss(undefined)).toBe(SYSTEM_FONT_STACK)
  })

  // Guards the wiring, not just the data: a font that is in the registry but
  // whose stylesheet was never imported would silently render in the fallback
  // font. (A stylesheet that doesn't exist can't slip through — the import in
  // src/fonts.ts would fail the build.)
  it.each(FONT_OPTIONS.map((f) => [f.id, f.weight] as const))(
    'imports the latin-%s stylesheet for weight %s in src/fonts.ts',
    (id, weight) => {
      expect(fontImports).toContain(`import '@fontsource/${id}/latin-${weight}.css'`)
    },
  )
})
