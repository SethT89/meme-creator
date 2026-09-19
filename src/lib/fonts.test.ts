import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('preloadFonts', () => {
  // The fonts are downloaded on demand, so without this the first time the font menu
  // opens, all 8 start downloading at once and each name visibly restyles as it arrives.
  // Loading them as soon as a text layer is selected gets them in before the menu opens.
  let load: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules() // preloadFonts remembers it already ran; start each test fresh
    load = vi.fn(() => Promise.resolve([]))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })
  })
  afterEach(() => Reflect.deleteProperty(document, 'fonts'))

  const importPreload = async () => (await import('./fonts')).preloadFonts

  it('asks the browser to load every font, at each one\'s real weight', async () => {
    const preloadFonts = await importPreload()
    preloadFonts()
    expect(load).toHaveBeenCalledTimes(8)
    expect(load).toHaveBeenCalledWith('400 16px "Anton"', expect.any(String))
    expect(load).toHaveBeenCalledWith('700 16px "Inter"', expect.any(String))
    expect(load).toHaveBeenCalledWith('700 16px "Playfair Display"', expect.any(String))
  })

  it('does it once, however many times it is called (every text-layer selection calls it)', async () => {
    const preloadFonts = await importPreload()
    preloadFonts()
    preloadFonts()
    preloadFonts()
    expect(load).toHaveBeenCalledTimes(8)
  })

  it('tries again next time if the download failed (e.g. offline), instead of giving up for good', async () => {
    load.mockRejectedValue(new Error('offline'))
    const preloadFonts = await importPreload()
    preloadFonts()
    await Promise.resolve() // let the rejection be handled
    await Promise.resolve()
    load.mockResolvedValue([])
    preloadFonts()
    expect(load.mock.calls.length).toBeGreaterThan(8)
  })

  it('does nothing where the browser has no font loading API', async () => {
    Reflect.deleteProperty(document, 'fonts')
    const preloadFonts = await importPreload()
    expect(() => preloadFonts()).not.toThrow()
  })
})

