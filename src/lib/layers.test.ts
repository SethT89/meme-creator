import { describe, it, expect } from 'vitest'
import {
  SIZE_PRESETS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  clampFontSize,
  sizeLabel,
  initialLayersFromFields,
  layersFromCanvasData,
} from './layers'

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

const mockFields = [
  { id: 'f1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22 },
  { id: 'f2', label: 'Caption 2', position_x: 310, position_y: 70, width: 220, height: 110, font_size: 22 },
]

describe('initialLayersFromFields', () => {
  it('maps template_fields rows into layers, preserving order and converting snake_case to camelCase', () => {
    expect(initialLayersFromFields(mockFields)).toEqual([
      { id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22 },
      { id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22 },
    ])
  })

  it('returns an empty array for no fields', () => {
    expect(initialLayersFromFields([])).toEqual([])
  })
})

describe('layersFromCanvasData', () => {
  const fallbackFields = mockFields

  it('returns the saved layers when canvas_data has a non-empty layers array', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('falls back to deriving from template fields when canvas_data has no layers key', () => {
    expect(layersFromCanvasData({}, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })

  it('falls back to deriving from template fields when canvas_data.layers is an empty array', () => {
    expect(layersFromCanvasData({ layers: [] }, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })
})
