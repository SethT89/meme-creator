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
  applyAspectLockedResizeDelta,
  createBlankTextLayer,
  createImageLayer,
  getCropRect,
  applyCropToLayer,
  MIN_LAYER_SIZE,
} from './layers'
import type { Layer, ImageLayer } from './layers'

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
      { type: 'text', id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true },
      { type: 'text', id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22, heightAuto: true },
    ])
  })

  it('returns an empty array for no fields', () => {
    expect(initialLayersFromFields([])).toEqual([])
  })
})

describe('createBlankTextLayer', () => {
  it('creates a blank, centered, auto-height layer sized relative to the image', () => {
    const layer = createBlankTextLayer(600, 908)
    expect(layer.type).toBe('text')
    expect(layer.label).toBe('')
    expect(layer.fontSize).toBe(36)
    expect(layer.heightAuto).toBe(true)
    expect(layer.width).toBe(240) // 40% of image width
    expect(layer.x).toBe((600 - layer.width) / 2) // horizontally centered
    expect(layer.y).toBe((908 - layer.height) / 2) // vertically centered
  })

  it('gives each call a unique id', () => {
    const a = createBlankTextLayer(600, 908)
    const b = createBlankTextLayer(600, 908)
    expect(a.id).not.toBe(b.id)
  })
})

describe('createImageLayer', () => {
  it('with no canvas given, places the image at the origin at its native size — it is about to define the canvas', () => {
    const layer = createImageLayer('https://example.com/a.png', 800, 600)
    expect(layer).toEqual({
      type: 'image',
      id: layer.id,
      src: 'https://example.com/a.png',
      naturalWidth: 800,
      naturalHeight: 600,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })
  })

  it('with a canvas given, scales the image down to fit within 60% of the canvas and centers it', () => {
    // Canvas 1000x1000, image 800x600 (wider than tall) — width is the
    // binding constraint: 800 * scale = 600 (60% of 1000) => scale = 0.75
    const layer = createImageLayer('https://example.com/a.png', 800, 600, { width: 1000, height: 1000 })
    expect(layer.width).toBe(600)
    expect(layer.height).toBe(450)
    expect(layer.x).toBe((1000 - 600) / 2)
    expect(layer.y).toBe((1000 - 450) / 2)
  })

  it('never scales a smaller image up to fill the 60% target', () => {
    // Image already well under 60% of a huge canvas — scale factor would be
    // >1, which must clamp to 1 (native size), not enlarge it.
    const layer = createImageLayer('https://example.com/a.png', 100, 50, { width: 2000, height: 2000 })
    expect(layer.width).toBe(100)
    expect(layer.height).toBe(50)
  })

  it('gives each call a unique id', () => {
    const a = createImageLayer('https://example.com/a.png', 100, 100)
    const b = createImageLayer('https://example.com/a.png', 100, 100)
    expect(a.id).not.toBe(b.id)
  })
})

describe('layersFromCanvasData', () => {
  const fallbackFields = mockFields

  it('returns the saved layers when canvas_data has a non-empty layers array', () => {
    const saved = { layers: [{ type: 'text', id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5, heightAuto: false }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('defaults heightAuto and type to their text-layer defaults for saved layers from before those fields existed', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] }
    const [layer] = layersFromCanvasData(saved, fallbackFields)
    expect(layer.type).toBe('text')
    expect((layer as { heightAuto: boolean }).heightAuto).toBe(true)
  })

  it('leaves an already-saved image layer alone — no text defaults forced onto it', () => {
    const saved = { layers: [{ type: 'image', id: 'img1', src: 'https://example.com/photo.png', x: 0, y: 0, width: 100, height: 100 }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('falls back to deriving from template fields when canvas_data has no layers key', () => {
    expect(layersFromCanvasData({}, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })

  it('falls back to deriving from template fields when canvas_data.layers is an empty array', () => {
    expect(layersFromCanvasData({ layers: [] }, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })
})

describe('applyDragDelta', () => {
  const layer: Layer = { type: 'text', id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }

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

  it('also moves an ImageLayer — the delta math only touches x/y/width/height, not the layer kind', () => {
    const imageLayer: Layer = { type: 'image', id: 'img1', src: 'https://example.com/a.png', naturalWidth: 200, naturalHeight: 100, x: 100, y: 100, width: 200, height: 100 }
    const moved = applyDragDelta(imageLayer, 50, 0, 0.5, 1000, 1000)
    expect(moved).toEqual({ ...imageLayer, x: 200 })
  })
})

describe('applyResizeDelta', () => {
  const layer: Layer = { type: 'text', id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }

  it('bottom-right (xSign 1, ySign 1) grows width and height, keeps position, turns off heightAuto', () => {
    const resized = applyResizeDelta(layer, 50, 20, 0.5, 1, 1)
    expect(resized.width).toBe(300) // 200 + 50/0.5
    expect(resized.height).toBe(140) // 100 + 20/0.5
    expect(resized.x).toBe(100)
    expect(resized.y).toBe(100)
    expect(resized.heightAuto).toBe(false)
  })

  it('top-left (xSign -1, ySign -1) grows width/height while anchoring the opposite corner', () => {
    const resized = applyResizeDelta(layer, -50, -20, 1, -1, -1)
    expect(resized.width).toBe(250) // 200 - (-50)
    expect(resized.height).toBe(120) // 100 - (-20)
    expect(resized.x).toBe(50) // (100+200) - 250, right edge stays at 300
    expect(resized.y).toBe(80) // (100+100) - 120, bottom edge stays at 200
    expect(resized.heightAuto).toBe(false)
  })

  it('right-mid (xSign 1, ySign 0) only changes width — height/y/heightAuto untouched', () => {
    const resized = applyResizeDelta(layer, 40, 999, 1, 1, 0)
    expect(resized.width).toBe(240)
    expect(resized.height).toBe(layer.height)
    expect(resized.y).toBe(layer.y)
    expect(resized.heightAuto).toBe(true) // only width changed, so auto-height is untouched
  })

  it('left-mid (xSign -1, ySign 0) changes width and x, anchored on the right edge', () => {
    const resized = applyResizeDelta(layer, -40, 999, 1, -1, 0)
    expect(resized.width).toBe(240) // 200 - (-40)
    expect(resized.x).toBe(60) // (100+200) - 240
    expect(resized.height).toBe(layer.height)
  })

  it('bottom-mid (xSign 0, ySign 1) only changes height — width/x untouched, turns off heightAuto', () => {
    const resized = applyResizeDelta(layer, 999, 30, 1, 0, 1)
    expect(resized.height).toBe(130)
    expect(resized.width).toBe(layer.width)
    expect(resized.x).toBe(layer.x)
    expect(resized.heightAuto).toBe(false)
  })

  it('top-mid (xSign 0, ySign -1) changes height and y, anchored on the bottom edge', () => {
    const resized = applyResizeDelta(layer, 999, -30, 1, 0, -1)
    expect(resized.height).toBe(130) // 100 - (-30)
    expect(resized.y).toBe(70) // (100+100) - 130
  })

  it('clamps width to MIN_LAYER_SIZE when shrinking past the minimum from the right edge', () => {
    const resized = applyResizeDelta(layer, -10000, 0, 1, 1, 0)
    expect(resized.width).toBe(MIN_LAYER_SIZE)
  })

  it('clamps width to MIN_LAYER_SIZE when shrinking past the minimum from the left edge, still anchored on the right', () => {
    const resized = applyResizeDelta(layer, 10000, 0, 1, -1, 0)
    expect(resized.width).toBe(MIN_LAYER_SIZE)
    expect(resized.x).toBe(layer.x + layer.width - MIN_LAYER_SIZE)
  })

  it('clamps height to MIN_LAYER_SIZE when shrinking past the minimum from the bottom edge', () => {
    const resized = applyResizeDelta(layer, 0, -10000, 1, 0, 1)
    expect(resized.height).toBe(MIN_LAYER_SIZE)
  })
})

describe('applyAspectLockedResizeDelta', () => {
  // 2:1 aspect ratio — every assertion below checks this ratio is preserved.
  const imageLayer: ImageLayer = { type: 'image', id: 'img1', src: 'https://example.com/a.png', naturalWidth: 200, naturalHeight: 100, x: 100, y: 100, width: 200, height: 100 }

  it('bottom-right: scales both dimensions by whichever axis moved further (here, width), anchored on the opposite corner', () => {
    const resized = applyAspectLockedResizeDelta(imageLayer, 100, 10, 1, 1, 1)
    expect(resized.width).toBe(300) // scale 1.5, driven by width's bigger proportional change
    expect(resized.height).toBe(150)
    expect(resized.x).toBe(100)
    expect(resized.y).toBe(100)
  })

  it('top-left: scales both dimensions together, anchored on the bottom-right corner', () => {
    const resized = applyAspectLockedResizeDelta(imageLayer, -50, -20, 1, -1, -1)
    expect(resized.width).toBe(250) // scale 1.25
    expect(resized.height).toBe(125)
    expect(resized.x).toBe(50) // (100+200) - 250, right edge stays at 300
    expect(resized.y).toBe(75) // (100+100) - 125, bottom edge stays at 200
  })

  it('never distorts the aspect ratio, regardless of how disproportionate the drag is', () => {
    const resized = applyAspectLockedResizeDelta(imageLayer, 10, 500, 1, 1, 1)
    expect(resized.width / resized.height).toBeCloseTo(imageLayer.width / imageLayer.height)
  })

  it('clamps scaling down so neither dimension shrinks past MIN_LAYER_SIZE', () => {
    const resized = applyAspectLockedResizeDelta(imageLayer, -10000, 0, 1, 1, 1)
    // Height (the smaller dimension at this 2:1 ratio) hits the floor first.
    expect(resized.height).toBe(MIN_LAYER_SIZE)
    expect(resized.width).toBeGreaterThanOrEqual(MIN_LAYER_SIZE)
  })
})

describe('getCropRect', () => {
  it('defaults to the whole image when no crop fields are set', () => {
    const layer: ImageLayer = { type: 'image', id: 'img1', src: 'https://example.com/a.png', naturalWidth: 800, naturalHeight: 600, x: 0, y: 0, width: 800, height: 600 }
    expect(getCropRect(layer)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('returns the crop fields already set on the layer', () => {
    const layer: ImageLayer = {
      type: 'image',
      id: 'img1',
      src: 'https://example.com/a.png',
      naturalWidth: 800,
      naturalHeight: 600,
      x: 0,
      y: 0,
      width: 400,
      height: 600,
      cropX: 0.25,
      cropY: 0.1,
      cropWidth: 0.5,
      cropHeight: 0.8,
    }
    expect(getCropRect(layer)).toEqual({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 })
  })
})

describe('applyCropToLayer', () => {
  // 800x600 source image, current on-canvas box 400x300 (also 4:3, matching
  // the uncropped image — a layer's box always starts in that ratio).
  const layer: ImageLayer = { type: 'image', id: 'img1', src: 'https://example.com/a.png', naturalWidth: 800, naturalHeight: 600, x: 50, y: 50, width: 400, height: 300 }

  it('stores the new crop fractions on the layer', () => {
    const cropped = applyCropToLayer(layer, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(cropped.cropX).toBe(0.25)
    expect(cropped.cropY).toBe(0.25)
    expect(cropped.cropWidth).toBe(0.5)
    expect(cropped.cropHeight).toBe(0.5)
  })

  it('keeps the box width unchanged and recomputes height to match the new crop aspect ratio', () => {
    // Crop selects a square region (300x300px of the 800x600 source:
    // 0.375*800=300, 0.5*600=300) — 1:1 aspect, versus the original 4:3 —
    // so at the same 400px width, height must become 400px too.
    const cropped = applyCropToLayer(layer, { x: 0, y: 0, width: 0.375, height: 0.5 })
    expect(cropped.width).toBe(400)
    expect(cropped.height).toBe(400)
  })

  it('recenters vertically on the previous center rather than jumping to hug the top edge', () => {
    // Same square crop as above — height actually changes (300 -> 400),
    // so this genuinely exercises recentering rather than a no-op.
    const cropped = applyCropToLayer(layer, { x: 0, y: 0, width: 0.375, height: 0.5 })
    const previousCenterY = layer.y + layer.height / 2
    expect(cropped.y + cropped.height / 2).toBeCloseTo(previousCenterY)
  })

  it('leaves x unchanged', () => {
    const cropped = applyCropToLayer(layer, { x: 0.1, y: 0.1, width: 0.3, height: 0.6 })
    expect(cropped.x).toBe(layer.x)
  })
})
