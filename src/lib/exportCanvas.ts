import type { Layer } from './layers'

// Matches this app's real on-screen CSS font stack (Tailwind's default
// sans stack — confirmed live via getComputedStyle on an actual layer
// box), not the generic 'sans-serif' keyword. Different fallback fonts
// have different glyph metrics, which shifts both word-wrap points and
// text width/positioning.
const FONT_FAMILY = '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif'

// Tailwind's Preflight sets line-height: 1.5 globally, and the on-screen
// layer box never overrides it — confirmed live via getComputedStyle
// (measured 16.86px line-height / 11.24px font-size ≈ 1.5 exactly). This
// is a precise, deterministic CSS value, not a font-metric-dependent
// guess, so multi-line captions no longer drift further apart with each
// line the way the earlier 1.2 estimate did.
const LINE_HEIGHT_RATIO = 1.5
const STROKE_RATIO = 0.24
// The on-screen box has a fixed 4px (Tailwind's p-1) padding — unlike
// font-size and position, this does NOT scale with the container-query
// units that keep everything else WYSIWYG at any zoom level. Scaled by
// the real-resolution-vs-displayed-size ratio in drawLayer below so the
// exported padding matches what's actually shown, not a flat guess.
const CSS_PADDING_PX = 4

interface TemplateSize {
  image_width: number
  image_height: number
}

// Narrower than Pick<CanvasRenderingContext2D, 'measureText'> on purpose —
// that would force a test's fake context to return a full TextMetrics
// object (a dozen properties this function never reads) just to satisfy
// the type checker. A real CanvasRenderingContext2D still structurally
// satisfies this, since it returns more than enough.
interface TextMeasurer {
  measureText(text: string): { width: number }
}

// Canvas has no built-in word-wrap — greedily fills each line up to
// maxWidth, approximating (not guaranteeing pixel-identical to) the
// browser's own text wrapping in the live DOM editor.
export function wrapTextLines(ctx: TextMeasurer, text: string, maxWidth: number): string[] {
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
// see EditorPage.tsx's layer box className. `scale` is the real-resolution-
// to-displayed-size ratio (see renderCreationToBlob) — only the fixed CSS
// padding needs it; everything else is already in real-pixel units.
function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, scale: number) {
  ctx.font = `bold ${layer.fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineWidth = layer.fontSize * STROKE_RATIO
  ctx.strokeStyle = 'black'
  ctx.fillStyle = 'white'

  const padding = CSS_PADDING_PX * scale
  const lines = wrapTextLines(ctx, layer.label, layer.width - padding * 2)
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO
  const centerX = layer.x + layer.width / 2

  lines.forEach((line, i) => {
    const lineTop = layer.y + padding + i * lineHeight
    // Canvas's textBaseline positions the glyph's own baseline, not the
    // top of its line box the way CSS line-height does — CSS instead
    // centers the glyph within the line box (font ascent/descent) and
    // pads the rest as "half-leading" above and below it. Reproducing
    // that placement (rather than just pinning the glyph to the very top
    // of the line, which sits visibly higher than the CSS original) needs
    // the font's actual measured ascent/descent for this exact font/size
    // — falls back to a reasonable fixed ratio on the rare browser that
    // doesn't support these TextMetrics fields.
    const metrics = ctx.measureText(line)
    const ascent = metrics.fontBoundingBoxAscent ?? layer.fontSize * 0.8
    const descent = metrics.fontBoundingBoxDescent ?? layer.fontSize * 0.2
    const halfLeading = Math.max(0, (lineHeight - (ascent + descent)) / 2)
    const baselineY = lineTop + halfLeading + ascent
    ctx.strokeText(line, centerX, baselineY)
    ctx.fillText(line, centerX, baselineY)
  })
}

// Renders a creation onto an off-screen canvas at the template's real pixel
// resolution (not the on-screen display size) and resolves a PNG Blob.
// Layer x/y/width/height/fontSize are already stored in that same
// real-pixel coordinate space (see layers.ts), so no scaling math is
// needed for those — only the fixed-px CSS padding needs to know the
// display-to-real ratio, computed here.
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
  // image.width is the on-screen rendered size in CSS px (not the source
  // file's intrinsic resolution) when no width/height attribute overrides
  // it — the same value EditorPage.tsx's own drag/resize math already
  // uses as "displayScale". Falls back to no scaling (1) when that's
  // unavailable (e.g. an image never attached to the DOM, as in this
  // file's own tests).
  const scale = image.width > 0 ? templateRow.image_width / image.width : 1
  for (const layer of layers) {
    drawLayer(ctx, layer, scale)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}
