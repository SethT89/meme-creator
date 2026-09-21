import { OUTLINE_WIDTH_EM, getCropRect, resolveTextStyle } from './layers'
import type { ImageLayer, Layer, ResolvedTextStyle, TextLayer } from './layers'

// Tailwind's Preflight sets line-height: 1.5 globally, and the on-screen
// layer box never overrides it — confirmed live via getComputedStyle
// (measured 16.86px line-height / 11.24px font-size ≈ 1.5 exactly). This
// is a precise, deterministic CSS value, not a font-metric-dependent
// guess, so multi-line captions no longer drift further apart with each
// line the way the earlier 1.2 estimate did.
const LINE_HEIGHT_RATIO = 1.5
// The on-screen box has a fixed 4px (Tailwind's p-1) padding — unlike
// font-size and position, this does NOT scale with the container-query
// units that keep everything else WYSIWYG at any zoom level. Scaled by
// the real-resolution-vs-displayed-size ratio in drawLayer below so the
// exported padding matches what's actually shown, not a flat guess.
const CSS_PADDING_PX = 4

// Real-pixel size of the output. Named after the templates table's columns
// so a template row can be passed straight in; a freeform canvas passes its
// own canvasWidth/canvasHeight under the same two names.
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

// The canvas font shorthand for a resolved style — the same weight/size/
// family the on-screen box uses, so glyph metrics (and so word-wrap points)
// match. Also the string document.fonts.load() needs to know which face to fetch.
export function textFontShorthand(style: ResolvedTextStyle, fontSize: number): string {
  return `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
}

// A canvas silently draws in the fallback font if a web font hasn't finished
// loading yet (the browser only fetches a face once something renders in it,
// and a picker preview or the on-screen box may not have). So before drawing,
// explicitly load each distinct web font the text layers use. A failed load
// must not block the export — the meme just comes out in the fallback font,
// which beats an export button that does nothing on a flaky connection.
async function ensureFontsLoaded(layers: Layer[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const textByFont = new Map<string, string>()
  for (const layer of layers) {
    if (layer.type !== 'text') continue
    const style = resolveTextStyle(layer)
    if (!style.fontId) continue // legacy system font: nothing to fetch
    // Size is irrelevant to which face loads; a fixed one dedupes the layers.
    const spec = textFontShorthand(style, 16)
    textByFont.set(spec, (textByFont.get(spec) ?? '') + layer.label)
  }
  await Promise.all([...textByFont].map(([spec, text]) => document.fonts.load(spec, text || ' ').catch(() => [])))
}

// Stroke before fill, mirroring the CSS `paint-order: stroke fill` the
// on-screen editor uses for its white-fill/black-outline meme-text look —
// see EditorPage.tsx's layer box className. `scale` is the real-resolution-
// to-displayed-size ratio (see renderCreationToBlob) — only the fixed CSS
// padding needs it; everything else is already in real-pixel units.
function drawLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, scale: number) {
  const style = resolveTextStyle(layer)
  ctx.font = textFontShorthand(style, layer.fontSize)
  ctx.textAlign = style.textAlign
  ctx.textBaseline = 'alphabetic'
  ctx.lineWidth = layer.fontSize * OUTLINE_WIDTH_EM
  // A canvas stroke joins corners with sharp miters by default. With an outline this thick
  // (0.24em) the sharp corners of letters like W, V, A, K, X then shoot out as black spikes that
  // the on-screen editor never shows. Rounded joins keep the outline hugging the letter.
  ctx.lineJoin = 'round'
  ctx.fillStyle = style.color
  if (style.strokeColor) ctx.strokeStyle = style.strokeColor

  const padding = CSS_PADDING_PX * scale
  const lines = wrapTextLines(ctx, layer.label, layer.width - padding * 2)
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO
  // CSS text-align positions text relative to the box's padding edges, so
  // left/right anchor at the padding, not the raw box edge.
  const anchorX =
    style.textAlign === 'left'
      ? layer.x + padding
      : style.textAlign === 'right'
        ? layer.x + layer.width - padding
        : layer.x + layer.width / 2

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
    if (style.strokeColor) ctx.strokeText(line, anchorX, baselineY)
    ctx.fillText(line, anchorX, baselineY)
  })
}

// crossOrigin is required, not cosmetic: without it a cross-origin image
// (Supabase storage) taints the canvas and toBlob() then throws.
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image layer: ${src}`))
    img.src = src
  })
}

// Mirrors the on-screen crop rendering: the crop fractions pick the source
// rectangle out of the full image, and the layer's own box is the dest.
function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, img: HTMLImageElement) {
  const crop = getCropRect(layer)
  ctx.drawImage(
    img,
    crop.x * layer.naturalWidth,
    crop.y * layer.naturalHeight,
    crop.width * layer.naturalWidth,
    crop.height * layer.naturalHeight,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
  )
}

export interface RenderOptions {
  // Shrink the output so its longer edge is at most this many pixels (never
  // enlarges). Omit for full resolution.
  maxEdge?: number
  // Default 'image/png' (lossless, transparent where nothing is drawn). A
  // JPEG is far smaller for photos but has no transparency, so it's rendered
  // onto a white background.
  type?: 'image/png' | 'image/jpeg'
  quality?: number // JPEG only, 0-1
  // A picture to draw underneath every layer — a template's image — at this
  // position and size, in the creation's real pixels. It may sit anywhere in
  // (or hang off) the canvas: enlarging a template's canvas leaves it off-center
  // with empty space around it, and shrinking the canvas below it crops it.
  background?: { image: HTMLImageElement; x: number; y: number; width: number; height: number }
  // How wide, in CSS px, the creation is assumed to have been shown on screen — the one thing the fixed
  // 4px text padding depends on. Normally measured from the on-screen element; only pass this when there
  // is no such element (rendering a saved meme from its data, e.g. the gallery's Download).
  displayWidth?: number
}

// Renders a creation onto an off-screen canvas at its real pixel
// resolution (not the on-screen display size) and resolves a Blob — a
// full-size PNG unless `options` say otherwise (see RenderOptions).
// `display` is the on-screen canvas element; it's only measured (for the
// display-to-real ratio the fixed CSS padding needs), never drawn. Canvas
// space not covered by the `background` or a layer stays transparent,
// matching the checkerboard shown on screen.
// Layer x/y/width/height/fontSize are already stored in that same
// real-pixel coordinate space (see layers.ts), so no scaling math is
// needed for those — only the fixed-px CSS padding needs to know the
// display-to-real ratio, computed here.
export async function renderCreationToBlob(
  display: HTMLElement,
  templateRow: TemplateSize,
  layers: Layer[],
  options: RenderOptions = {},
): Promise<Blob> {
  const { maxEdge, type = 'image/png', quality } = options
  const longEdge = Math.max(templateRow.image_width, templateRow.image_height)
  const outputScale = maxEdge && longEdge > maxEdge ? maxEdge / longEdge : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(templateRow.image_width * outputScale)
  canvas.height = Math.round(templateRow.image_height * outputScale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')

  await ensureFontsLoaded(layers)

  if (type === 'image/jpeg') {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, templateRow.image_width, templateRow.image_height)
  }
  // Everything below is drawn in the creation's real-pixel coordinates, so
  // one uniform scale shrinks the whole render (text included) to fit.
  if (outputScale !== 1) ctx.scale(outputScale, outputScale)

  // Loaded up front (in parallel) so the draw loop below can stay
  // synchronous and keep strict layer order.
  const loadedImages = new Map<string, HTMLImageElement>()
  await Promise.all(
    layers.map(async (layer) => {
      if (layer.type === 'image') loadedImages.set(layer.id, await loadImage(layer.src))
    }),
  )

  if (options.background) {
    const { image, x, y, width, height } = options.background
    ctx.drawImage(image, x, y, width, height)
  }
  // The element's on-screen rendered width in CSS px (not the source
  // file's intrinsic resolution) — the same value EditorPage.tsx's own
  // drag/resize math already uses as "displayScale". Falls back to no scaling
  // (1) when unavailable (e.g. an element never attached to the DOM, as in
  // this file's own tests).
  const displayWidth = options.displayWidth ?? display.getBoundingClientRect().width
  const scale = displayWidth > 0 ? templateRow.image_width / displayWidth : 1

  // Drawn in layer order so stacking matches the on-screen editor.
  for (const layer of layers) {
    if (layer.type === 'text') drawLayer(ctx, layer, scale)
    else drawImageLayer(ctx, layer, loadedImages.get(layer.id)!)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      },
      type,
      quality,
    )
  })
}
