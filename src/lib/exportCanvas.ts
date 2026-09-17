import type { Layer } from './layers'

const LINE_HEIGHT_RATIO = 1.2
const STROKE_RATIO = 0.24
const TEXT_PADDING = 4

interface TemplateSize {
  image_width: number
  image_height: number
}

// Canvas has no built-in word-wrap — greedily fills each line up to
// maxWidth, approximating (not guaranteeing pixel-identical to) the
// browser's own text wrapping in the live DOM editor.
export function wrapTextLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let currentLine = words[0]

  for (const word of words.slice(1)) {
    const testLine = `${currentLine} ${word}`
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  lines.push(currentLine)
  return lines
}

// Stroke before fill, mirroring the CSS `paint-order: stroke fill` the
// on-screen editor uses for its white-fill/black-outline meme-text look —
// see EditorPage.tsx's layer box className.
function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  ctx.font = `bold ${layer.fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = layer.fontSize * STROKE_RATIO
  ctx.strokeStyle = 'black'
  ctx.fillStyle = 'white'

  const lines = wrapTextLines(ctx, layer.label, layer.width)
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO
  const centerX = layer.x + layer.width / 2

  lines.forEach((line, i) => {
    const y = layer.y + TEXT_PADDING + i * lineHeight
    ctx.strokeText(line, centerX, y)
    ctx.fillText(line, centerX, y)
  })
}

// Renders a creation onto an off-screen canvas at the template's real pixel
// resolution (not the on-screen display size) and resolves a PNG Blob.
// Layer x/y/width/height/fontSize are already stored in that same
// real-pixel coordinate space (see layers.ts), so no scaling math is
// needed here.
export function renderCreationToBlob(
  image: HTMLImageElement,
  templateRow: TemplateSize,
  layers: Layer[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = templateRow.image_width
  canvas.height = templateRow.image_height

  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas 2D context is not available'))

  ctx.drawImage(image, 0, 0, templateRow.image_width, templateRow.image_height)
  for (const layer of layers) {
    drawLayer(ctx, layer)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}
