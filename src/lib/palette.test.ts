import { describe, it, expect } from 'vitest'
import { SWATCH_ROWS } from './palette'
import { DEFAULT_STROKE_COLOR, DEFAULT_TEXT_COLOR } from './layers'

describe('SWATCH_ROWS', () => {
  const all = SWATCH_ROWS.flat()

  it('is two rows: 11 saturated swatches over 10 tints (the 11th slot in row two is the custom-color wheel)', () => {
    expect(SWATCH_ROWS.map((row) => row.length)).toEqual([11, 10])
  })

  it('uses lowercase #rrggbb hex, with unique hexes and unique names', () => {
    for (const swatch of all) expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(all.map((s) => s.hex)).size).toBe(all.length)
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length)
  })

  it("includes today's default fill and outline colors, so they show as selected on an unstyled layer", () => {
    const hexes = all.map((s) => s.hex)
    expect(hexes).toContain(DEFAULT_TEXT_COLOR)
    expect(hexes).toContain(DEFAULT_STROKE_COLOR)
  })
})
