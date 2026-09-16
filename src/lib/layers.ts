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
