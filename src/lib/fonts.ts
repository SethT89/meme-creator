// The typefaces a text layer can use. Ids double as the @fontsource package
// slug (`@fontsource/<id>`), which is what the guard test in fonts.test.ts
// relies on. Each font has ONE fixed weight — whatever looks right for memes —
// so there's no bold toggle; Inter and Playfair Display use 700 because their
// 400 is too light to read over a busy image.
export type FontId =
  | 'anton'
  | 'bebas-neue'
  | 'archivo-black'
  | 'inter'
  | 'permanent-marker'
  | 'bangers'
  | 'special-elite'
  | 'playfair-display'

export interface FontOption {
  id: FontId
  label: string
  // The exact `font-family` name declared by the font's @font-face rule.
  family: string
  weight: number
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'anton', label: 'Anton', family: 'Anton', weight: 400 },
  { id: 'bebas-neue', label: 'Bebas Neue', family: 'Bebas Neue', weight: 400 },
  { id: 'archivo-black', label: 'Archivo Black', family: 'Archivo Black', weight: 400 },
  { id: 'inter', label: 'Inter', family: 'Inter', weight: 700 },
  { id: 'permanent-marker', label: 'Permanent Marker', family: 'Permanent Marker', weight: 400 },
  { id: 'bangers', label: 'Bangers', family: 'Bangers', weight: 400 },
  { id: 'special-elite', label: 'Special Elite', family: 'Special Elite', weight: 400 },
  { id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display', weight: 700 },
]

// What every newly created text layer gets, so new text looks like a meme
// out of the box. Layers saved before fonts existed have no fontFamily and
// resolve to the system font instead (see resolveTextStyle in layers.ts).
export const DEFAULT_FONT_ID: FontId = 'anton'

// The stack the app has always used for layer text (Tailwind's default sans
// stack). Also the fallback behind every web font, and the whole font for
// legacy layers with no fontFamily.
export const SYSTEM_FONT_STACK = '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif'
export const SYSTEM_FONT_WEIGHT = 700

// Takes a string, not a FontId: saved canvas_data is untyped JSON, so an id
// from an older/newer build may not exist here. Unknown behaves like "none".
export function getFontOption(id: string | undefined): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.id === id)
}

export function fontFamilyCss(font: FontOption | undefined): string {
  return font ? `"${font.family}", ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK
}
