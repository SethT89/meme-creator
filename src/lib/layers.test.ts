import { describe, it, expect } from 'vitest'
import { SIZE_PRESETS, MIN_FONT_SIZE, MAX_FONT_SIZE, clampFontSize, sizeLabel } from './layers'

describe('SIZE_PRESETS', () => {
  it('defines five presets in ascending px order', () => {
    expect(SIZE_PRESETS.map((p) => p.label)).toEqual(['Small', 'Medium', 'Large', 'Extra Large', 'Huge'])
    const pxValues = SIZE_PRESETS.map((p) => p.px)
    expect(pxValues).toEqual([...pxValues].sort((a, b) => a - b))
  })
})

describe('clampFontSize', () => {
  it('leaves an in-range integer value unchanged', () => {
    expect(clampFontSize(36)).toBe(36)
  })

  it('rounds a non-integer value', () => {
    expect(clampFontSize(36.6)).toBe(37)
  })

  it('clamps below the minimum up to MIN_FONT_SIZE', () => {
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE)
  })

  it('clamps above the maximum down to MAX_FONT_SIZE', () => {
    expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE)
  })
})

describe('sizeLabel', () => {
  it('returns the preset name when the value matches one exactly', () => {
    expect(sizeLabel(36)).toBe('Medium')
  })

  it('returns a raw px label when the value matches no preset', () => {
    expect(sizeLabel(22)).toBe('22px')
  })
})
