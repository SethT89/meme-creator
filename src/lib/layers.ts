interface BaseLayer {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  label: string
  fontSize: number
  // true (the default): height isn't rendered as a fixed box dimension —
  // the box grows to fit wrapped text instead, so a bigger font or more
  // text never gets silently clipped. Becomes false the moment a user
  // drags the resize handle, at which point their chosen height is fixed
  // and text wraps/clips within it like any ordinary text box.
  heightAuto: boolean
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string
}

export type Layer = TextLayer | ImageLayer

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
    type: 'text',
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
export function createBlankTextLayer(imageWidth: number, imageHeight: number): TextLayer {
  const fontSize = 36
  const width = imageWidth * 0.4
  const height = fontSize * 1.5
  return {
    type: 'text',
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

// Upload Image's layer factory. With no canvas yet (the very first image on
// a blank creation — this call is what establishes canvasWidth/canvasHeight
// a moment later), the image lands at the origin at its own native size, so
// it becomes the canvas's full extent. Landing on an existing canvas instead
// scales the image down to fit within 60% of the canvas's smaller dimension
// (never up — a small image stays native size) and centers it, the same
// "don't drop in bigger than the surface it's landing on" idea
// createBlankTextLayer already applies to text boxes.
export function createImageLayer(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  canvas?: { width: number; height: number },
): ImageLayer {
  if (!canvas) {
    return { type: 'image', id: crypto.randomUUID(), src, x: 0, y: 0, width: naturalWidth, height: naturalHeight }
  }
  const scale = Math.min(1, (canvas.width * 0.6) / naturalWidth, (canvas.height * 0.6) / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    type: 'image',
    id: crypto.randomUUID(),
    src,
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  if (layers && layers.length > 0) {
    // Saved before heightAuto/type existed: default heightAuto to true and
    // type to 'text' — every layer saved before this feature shipped was a
    // text layer, so this is an unambiguous migration with no schema change.
    return layers.map((l) => (l.type === 'image' ? l : { ...l, type: 'text' as const, heightAuto: l.heightAuto ?? true }))
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

// Floor for a freeform canvas's own width/height when the user drags a
// canvas-resize handle — mirrors MIN_LAYER_SIZE's role for an ordinary
// layer, just for the canvas itself.
export const MIN_CANVAS_SIZE = 100

// Which edge(s) a resize handle controls. +1 = right/bottom edge (growing
// moves that edge further out, opposite edge fixed). -1 = left/top edge
// (growing moves that edge further out the other way, opposite edge fixed).
// 0 = that axis isn't controlled by this handle (midpoints only control one
// axis; corners control both).
export type ResizeSign = -1 | 0 | 1

export function applyResizeDelta<T extends Layer>(
  layer: T,
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  xSign: ResizeSign,
  ySign: ResizeSign,
): T {
  const deltaX = deltaXPx / displayScale
  const deltaY = deltaYPx / displayScale

  let x = layer.x
  let y = layer.y
  let width = layer.width
  let height = layer.height
  // heightAuto only exists on a TextLayer — an ImageLayer always has an
  // explicit height, so there's nothing to track here for one.
  let heightAuto = layer.type === 'text' ? layer.heightAuto : undefined

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

  return (layer.type === 'text' ? { ...layer, x, y, width, height, heightAuto: heightAuto ?? true } : { ...layer, x, y, width, height }) as T
}
