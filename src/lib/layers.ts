export interface Layer {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
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
  }))
}

export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  if (layers && layers.length > 0) return layers
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
