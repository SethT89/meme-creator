export interface Layer {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  // true (the default): height isn't rendered as a fixed box dimension —
  // the box grows to fit wrapped text instead, so a bigger font or more
  // text never gets silently clipped. Becomes false the moment a user
  // drags the resize handle, at which point their chosen height is fixed
  // and text wraps/clips within it like any ordinary text box.
  heightAuto: boolean
}

export const SIZE_PRESETS: { label: string; px: number }[] = [
  { label: 'Small', px: 24 },
  { label: 'Medium', px: 36 },
  { label: 'Large', px: 48 },
  { label: 'Extra Large', px: 64 },
  { label: 'Huge', px: 88 },
]

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 300

export function clampFontSize(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)))
}

export function sizeLabel(fontSize: number): string {
  const preset = SIZE_PRESETS.find((p) => p.px === fontSize)
  return preset ? preset.label : `${fontSize}px`
}

interface TemplateFieldRow {
  id: string
  label: string
  position_x: number
  position_y: number
  width: number
  height: number
  font_size: number
}

export function initialLayersFromFields(fields: TemplateFieldRow[]): Layer[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    x: f.position_x,
    y: f.position_y,
    width: f.width,
    height: f.height,
    fontSize: f.font_size,
    heightAuto: true,
  }))
}

// A freeform layer from CanvasFab's "Add Text" action — not derived from any
// template_fields row, just an ordinary blank Layer dropped in the middle of
// the image. Sized relative to the image so it looks reasonable regardless
// of the template's own dimensions; heightAuto (like every other layer)
// means the fixed starting height below only matters for the initial
// drag-centering math, not for clipping.
export function createBlankTextLayer(imageWidth: number, imageHeight: number): Layer {
  const fontSize = 36
  const width = imageWidth * 0.4
  const height = fontSize * 1.5
  return {
    id: crypto.randomUUID(),
    label: '',
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height,
    fontSize,
    heightAuto: true,
  }
}

export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  if (layers && layers.length > 0) {
    // Saved before heightAuto existed: default it to true rather than
    // leaving it undefined, so every in-memory Layer is fully populated.
    return layers.map((l) => ({ ...l, heightAuto: l.heightAuto ?? true }))
  }
  return initialLayersFromFields(fallbackFields)
}

export function applyDragDelta(
  layer: Layer,
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  imageWidth: number,
  imageHeight: number,
): Layer {
  const deltaX = deltaXPx / displayScale
  const deltaY = deltaYPx / displayScale
  const centerX = Math.min(imageWidth, Math.max(0, layer.x + layer.width / 2 + deltaX))
  const centerY = Math.min(imageHeight, Math.max(0, layer.y + layer.height / 2 + deltaY))
  return { ...layer, x: centerX - layer.width / 2, y: centerY - layer.height / 2 }
}

export const MIN_LAYER_SIZE = 20

// Which edge(s) a resize handle controls. +1 = right/bottom edge (growing
// moves that edge further out, opposite edge fixed). -1 = left/top edge
// (growing moves that edge further out the other way, opposite edge fixed).
// 0 = that axis isn't controlled by this handle (midpoints only control one
// axis; corners control both).
export type ResizeSign = -1 | 0 | 1

export function applyResizeDelta(
  layer: Layer,
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  xSign: ResizeSign,
  ySign: ResizeSign,
): Layer {
  const deltaX = deltaXPx / displayScale
  const deltaY = deltaYPx / displayScale

  let x = layer.x
  let y = layer.y
  let width = layer.width
  let height = layer.height
  let heightAuto = layer.heightAuto

  if (xSign === 1) {
    width = Math.max(MIN_LAYER_SIZE, layer.width + deltaX)
  } else if (xSign === -1) {
    const rightEdge = layer.x + layer.width
    width = Math.max(MIN_LAYER_SIZE, layer.width - deltaX)
    x = rightEdge - width
  }

  if (ySign === 1) {
    height = Math.max(MIN_LAYER_SIZE, layer.height + deltaY)
    heightAuto = false
  } else if (ySign === -1) {
    const bottomEdge = layer.y + layer.height
    height = Math.max(MIN_LAYER_SIZE, layer.height - deltaY)
    y = bottomEdge - height
    heightAuto = false
  }

  return { ...layer, x, y, width, height, heightAuto }
}
