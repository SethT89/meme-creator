import { describe, it, expect } from 'vitest'
import {
  SIZE_PRESETS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  clampFontSize,
  sizeLabel,
  initialLayersFromFields,
  layersFromCanvasData,
  applyDragDelta,
  applyResizeDelta,
  MIN_LAYER_SIZE,
} from './layers'
import type { Layer } from './layers'

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
  it('maps template_fields rows into layers, preserving order, converting snake_case to camelCase, and defaulting heightAuto to true', () => {
    expect(initialLayersFromFields(mockFields)).toEqual([
      { id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true },
      { id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22, heightAuto: true },
    ])
  })

  it('returns an empty array for no fields', () => {
    expect(initialLayersFromFields([])).toEqual([])
  })
})

describe('layersFromCanvasData', () => {
  const fallbackFields = mockFields

  it('returns the saved layers when canvas_data has a non-empty layers array', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5, heightAuto: false }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('defaults heightAuto to true for saved layers from before that field existed', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] }
    const [layer] = layersFromCanvasData(saved, fallbackFields)
    expect(layer.heightAuto).toBe(true)
  })

  it('falls back to deriving from template fields when canvas_data has no layers key', () => {
    expect(layersFromCanvasData({}, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })

  it('falls back to deriving from template fields when canvas_data.layers is an empty array', () => {
    expect(layersFromCanvasData({ layers: [] }, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })
})

describe('applyDragDelta', () => {
  const layer: Layer = { id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }

  it('moves the layer by the screen delta divided by the display scale', () => {
    const moved = applyDragDelta(layer, 50, 0, 0.5, 1000, 1000)
    expect(moved.x).toBe(200)
    expect(moved.y).toBe(100)
    expect(moved.width).toBe(200)
    expect(moved.height).toBe(100)
  })

  it('clamps so the box center cannot move left of the image', () => {
    const moved = applyDragDelta(layer, -10000, 0, 1, 1000, 1000)
    expect(moved.x).toBe(0 - layer.width / 2)
  })

  it('clamps so the box center cannot move above the image', () => {
    const moved = applyDragDelta(layer, 0, -10000, 1, 1000, 1000)
    expect(moved.y).toBe(0 - layer.height / 2)
  })

  it('clamps so the box center cannot move right of the image', () => {
    const moved = applyDragDelta(layer, 10000, 0, 1, 1000, 1000)
    expect(moved.x).toBe(1000 - layer.width / 2)
  })

  it('clamps so the box center cannot move below the image', () => {
    const moved = applyDragDelta(layer, 0, 10000, 1, 1000, 1000)
    expect(moved.y).toBe(1000 - layer.height / 2)
  })
})

describe('applyResizeDelta', () => {
  const layer: Layer = { id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }

  it('grows width and height by the screen delta divided by the display scale, and turns off heightAuto', () => {
    const resized = applyResizeDelta(layer, 50, 20, 0.5)
    expect(resized.width).toBe(300) // 200 + 50/0.5
    expect(resized.height).toBe(140) // 100 + 20/0.5
    expect(resized.heightAuto).toBe(false)
    expect(resized.x).toBe(100) // position unchanged
    expect(resized.y).toBe(100)
  })

  it('shrinks width and height for a negative delta', () => {
    const resized = applyResizeDelta(layer, -50, -20, 1)
    expect(resized.width).toBe(150)
    expect(resized.height).toBe(80)
  })

  it('clamps width to MIN_LAYER_SIZE instead of going smaller or negative', () => {
    const resized = applyResizeDelta(layer, -10000, 0, 1)
    expect(resized.width).toBe(MIN_LAYER_SIZE)
  })

  it('clamps height to MIN_LAYER_SIZE instead of going smaller or negative', () => {
    const resized = applyResizeDelta(layer, 0, -10000, 1)
    expect(resized.height).toBe(MIN_LAYER_SIZE)
  })
})
