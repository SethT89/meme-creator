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

export function applyResizeDelta(layer: Layer, deltaXPx: number, deltaYPx: number, displayScale: number): Layer {
  const width = Math.max(MIN_LAYER_SIZE, layer.width + deltaXPx / displayScale)
  const height = Math.max(MIN_LAYER_SIZE, layer.height + deltaYPx / displayScale)
  return { ...layer, width, height, heightAuto: false }
}
