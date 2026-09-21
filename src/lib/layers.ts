import { DEFAULT_FONT_ID, SYSTEM_FONT_WEIGHT, fontFamilyCss, getFontOption } from './fonts'
import type { FontId } from './fonts'

interface BaseLayer {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type TextAlign = 'left' | 'center' | 'right'

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
  // The four style fields below are all optional so that every creation
  // saved before they existed still loads and renders exactly as it did:
  // read them ONLY through resolveTextStyle, which owns the defaults.
  fontFamily?: FontId
  // Fill color, '#rrggbb'.
  color?: string
  // Outline color, '#rrggbb'. null means no outline; undefined means "never
  // set", which resolves to black (the original look) — the two differ.
  strokeColor?: string | null
  textAlign?: TextAlign
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string
  // The source image's real pixel dimensions — set once from the upload
  // (or, for the very first canvas-establishing image, equal to width/
  // height above). Needed to lay out the crop overlay in real image
  // pixels; cropX/Y/Width/Height below are fractions of these, not of
  // this layer's own on-canvas width/height.
  naturalWidth: number
  naturalHeight: number
  // Crop rectangle, as fractions (0-1) of naturalWidth/naturalHeight.
  // Undefined means "the whole image" — every image layer starts this way
  // (see getCropRect below); only set once the user crops via
  // double-click (see the crop-mode functions below).
  cropX?: number
  cropY?: number
  cropWidth?: number
  cropHeight?: number
}

export type Layer = TextLayer | ImageLayer

export const DEFAULT_TEXT_COLOR = '#ffffff'
export const DEFAULT_STROKE_COLOR = '#000000'
// Outline thickness as a fraction of the font size. In `em` on screen (so it
// scales with the container-query font size) and multiplied by the font size
// in the canvas exporter, so both draw the same stroke.
export const OUTLINE_WIDTH_EM = 0.24

export interface ResolvedTextStyle {
  // null = legacy system font (no/unknown fontFamily on the layer).
  fontId: FontId | null
  // A ready-to-use CSS font-family value, fallback stack included.
  fontFamily: string
  fontWeight: number
  color: string
  strokeColor: string | null
  textAlign: TextAlign
}

export type TextStylePatch = Partial<Pick<TextLayer, 'fontFamily' | 'color' | 'strokeColor' | 'textAlign'>>

// The single place text-style defaults live. The on-screen box, the canvas
// exporter and the toolbar all read a layer through this, so they cannot
// disagree about what an unstyled (legacy) layer looks like.
export function resolveTextStyle(layer: TextLayer): ResolvedTextStyle {
  const font = getFontOption(layer.fontFamily)
  return {
    fontId: font?.id ?? null,
    fontFamily: fontFamilyCss(font),
    fontWeight: font?.weight ?? SYSTEM_FONT_WEIGHT,
    color: layer.color ?? DEFAULT_TEXT_COLOR,
    strokeColor: layer.strokeColor === undefined ? DEFAULT_STROKE_COLOR : layer.strokeColor,
    textAlign: layer.textAlign ?? 'center',
  }
}

// Inline CSS for a text layer's on-screen box. paint-order (stroke behind
// fill, so the outline doesn't thin the letterforms) stays a class in
// EditorPage since it never varies.
export function textLayerCssStyle(layer: TextLayer) {
  const style = resolveTextStyle(layer)
  return {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    color: style.color,
    textAlign: style.textAlign,
    WebkitTextStroke: style.strokeColor ? `${OUTLINE_WIDTH_EM}em ${style.strokeColor}` : '0',
  }
}

// Effective crop rectangle for a layer, as fractions of its natural size —
// resolves the "undefined means the whole image" default described above so
// every call site gets concrete numbers rather than re-deriving them.
export function getCropRect(layer: ImageLayer): { x: number; y: number; width: number; height: number } {
  return {
    x: layer.cropX ?? 0,
    y: layer.cropY ?? 0,
    width: layer.cropWidth ?? 1,
    height: layer.cropHeight ?? 1,
  }
}

// --- Crop mode (double-click an image layer) ---
//
// Entering crop mode changes nothing about the layer — it stays exactly
// where/how it already is (this is the whole point: adjusting a crop
// in-place at the canvas's own real scale, not in some separately-scaled
// overlay, is what makes it feel precise). What crop mode needs is a fixed
// reference point for the *entire* source image's own on-canvas rect (most
// of which isn't currently visible, if anything's cropped already) — that's
// getFullImageBounds below, computed once when a crop session starts and
// then held constant (see EditorPage.tsx's cropSession ref) while the user
// pans the image or resizes the frame around it.

export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

// The full source image's own on-canvas rect at its current effective scale
// — i.e. where/how big the ENTIRE image would be if none of it were
// cropped out. Derived from the layer's current frame (x/y/width/height)
// and crop fraction; call once, at the moment a crop session begins.
export function getFullImageBounds(layer: ImageLayer): ImageBounds {
  const crop = getCropRect(layer)
  const width = layer.width / crop.width
  const height = layer.height / crop.height
  return { x: layer.x - crop.x * width, y: layer.y - crop.y * height, width, height }
}

// Converts a frame rect (the layer's own x/y/width/height — i.e. what's
// currently visible) back into a crop fraction, given the session's fixed
// image bounds. Used after both panning (frame unchanged, imageBounds.x/y
// moved) and resizing (imageBounds unchanged, frame moved/resized).
export function frameToCropFraction(
  frame: { x: number; y: number; width: number; height: number },
  imageBounds: ImageBounds,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (frame.x - imageBounds.x) / imageBounds.width,
    y: (frame.y - imageBounds.y) / imageBounds.height,
    width: frame.width / imageBounds.width,
    height: frame.height / imageBounds.height,
  }
}

// Dragging the image itself while cropping: pans the image under a
// fixed-size frame, clamped so the frame can never end up showing past the
// image's own edges (its own size, imageSize, never changes from a pan).
export function clampImagePan(
  desired: { x: number; y: number },
  frame: { x: number; y: number; width: number; height: number },
  imageSize: { width: number; height: number },
): { x: number; y: number } {
  const minX = frame.x + frame.width - imageSize.width
  const maxX = frame.x
  const minY = frame.y + frame.height - imageSize.height
  const maxY = frame.y
  return { x: Math.min(maxX, Math.max(minX, desired.x)), y: Math.min(maxY, Math.max(minY, desired.y)) }
}

// Dragging one of the frame's own 8 handles while cropping: a free resize
// (all 8 make sense here, unlike an ordinary image resize — a crop is
// meant to select an arbitrary rectangle, not preserve any particular
// ratio), clamped so the frame can never grow past the image's own fixed
// edges. The image itself never moves or rescales from a resize — only the
// visible window (the frame) does.
export function applyCropFrameResizeDelta(
  frame: { x: number; y: number; width: number; height: number },
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  xSign: ResizeSign,
  ySign: ResizeSign,
  imageBounds: ImageBounds,
): { x: number; y: number; width: number; height: number } {
  const deltaX = deltaXPx / displayScale
  const deltaY = deltaYPx / displayScale

  let x = frame.x
  let y = frame.y
  let width = frame.width
  let height = frame.height

  if (xSign === 1) {
    const maxRight = imageBounds.x + imageBounds.width
    width = Math.min(maxRight - x, Math.max(MIN_LAYER_SIZE, frame.width + deltaX))
  } else if (xSign === -1) {
    const rightEdge = frame.x + frame.width
    width = Math.max(MIN_LAYER_SIZE, frame.width - deltaX)
    x = Math.max(imageBounds.x, rightEdge - width)
    width = rightEdge - x
  }

  if (ySign === 1) {
    const maxBottom = imageBounds.y + imageBounds.height
    height = Math.min(maxBottom - y, Math.max(MIN_LAYER_SIZE, frame.height + deltaY))
  } else if (ySign === -1) {
    const bottomEdge = frame.y + frame.height
    height = Math.max(MIN_LAYER_SIZE, frame.height - deltaY)
    y = Math.max(imageBounds.y, bottomEdge - height)
    height = bottomEdge - y
  }

  return { x, y, width, height }
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

export interface TemplateFieldRow {
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
    fontFamily: DEFAULT_FONT_ID,
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
    fontFamily: DEFAULT_FONT_ID,
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
    return { type: 'image', id: crypto.randomUUID(), src, naturalWidth, naturalHeight, x: 0, y: 0, width: naturalWidth, height: naturalHeight }
  }
  const scale = Math.min(1, (canvas.width * 0.6) / naturalWidth, (canvas.height * 0.6) / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    type: 'image',
    id: crypto.randomUUID(),
    src,
    naturalWidth,
    naturalHeight,
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

export type ReorderAction = 'forward' | 'backward' | 'front' | 'back'

// Stacking order is just array order — later entries paint on top of
// earlier ones, on screen and in export alike (both iterate the array in
// order) — so changing a layer's z-order means moving it within the array.
// Returns the very same array (not a copy) when the move would change
// nothing, so a caller's setState bails out instead of re-rendering.
export function reorderLayer(layers: Layer[], id: string, action: ReorderAction): Layer[] {
  const from = layers.findIndex((l) => l.id === id)
  if (from === -1) return layers
  const last = layers.length - 1
  const to = action === 'forward' ? Math.min(from + 1, last) : action === 'backward' ? Math.max(from - 1, 0) : action === 'front' ? last : 0
  if (to === from) return layers
  const next = [...layers]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  // A saved layers array is the truth even when it's empty: it means every
  // layer was deleted, and reopening must not bring the template's default
  // captions back. Only a creation with no layers data at all (an older row,
  // or none saved) derives them from the template's fields.
  if (Array.isArray(layers)) {
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

// Resizes a canvas by dragging one of its 8 handles. `deltaX/deltaY` are how
// far the pointer moved, in canvas pixels, since the drag began; the sign says
// which edge that handle owns (see ResizeSign below).
//
// The right/bottom edges are easy: the origin doesn't move, so only the size
// changes. The LEFT/TOP edges move the origin — the canvas's own (0,0) is now
// somewhere else — so everything on it must shift by the same amount to stay
// visually put. That shift is returned as offsetX/offsetY, to be ADDED to every
// layer's position as it was when the drag began (not to their current position,
// so a long drag never accumulates rounding or clamping drift). When the size
// hits MIN_CANVAS_SIZE the edge stops moving, and so does the shift: it is the
// distance the edge really travelled, not the distance the pointer did.
export function resizeCanvas(
  start: { width: number; height: number },
  deltaX: number,
  deltaY: number,
  xSign: ResizeSign,
  ySign: ResizeSign,
): { width: number; height: number; offsetX: number; offsetY: number } {
  function axis(size: number, delta: number, sign: ResizeSign) {
    if (sign === 0) return { size, offset: 0 }
    const next = Math.max(MIN_CANVAS_SIZE, size + sign * delta)
    // Right/bottom (+1): the origin stays. Left/top (-1): the edge that moved
    // is the origin's own, so contents shift by however much the size changed.
    return { size: next, offset: sign === 1 ? 0 : next - size }
  }
  const x = axis(start.width, deltaX, xSign)
  const y = axis(start.height, deltaY, ySign)
  return { width: x.size, height: y.size, offsetX: x.offset, offsetY: y.offset }
}

// The CSS clip-path that crops a layer to the canvas, or undefined when the
// layer is fully inside. Without it a layer hanging off an edge — after the
// canvas was shrunk, or a layer dragged partway off — spills out over the page,
// while export (which draws onto a canvas of exactly the canvas's size) crops it.
//
// Written in container-query units, not percentages of the layer, because an
// auto-height text box's real height is unknown until the browser lays it out:
// `cqw` (1% of the canvas width — also what text sizing already uses) lets every
// edge be expressed from the canvas's side. Left/top: how far the layer hangs
// off. Right/bottom: the layer's own size (100%) minus how much of it is still
// inside the canvas; max(0px, ...) makes a layer that fits clip nothing there.
export function layerClipPath(layer: Layer, canvas: { width: number; height: number }): string | undefined {
  // A text box's stored height is only its starting height (see heightAuto), so
  // it's just a trigger here — the clip itself never depends on it.
  const overhangs = layer.x < 0 || layer.y < 0 || layer.x + layer.width > canvas.width || layer.y + layer.height > canvas.height
  if (!overhangs) return undefined
  const cqw = (px: number) => `${(px / canvas.width) * 100}cqw`
  const left = layer.x < 0 ? cqw(-layer.x) : '0px'
  const top = layer.y < 0 ? cqw(-layer.y) : '0px'
  const right = `max(0px, calc(100% - ${cqw(canvas.width - layer.x)}))`
  const bottom = `max(0px, calc(100% - ${cqw(canvas.height - layer.y)}))`
  return `inset(${top} ${right} ${bottom} ${left})`
}

// Which edge(s) a resize handle controls. +1 = right/bottom edge (growing
// moves that edge further out, opposite edge fixed). -1 = left/top edge
// (growing moves that edge further out the other way, opposite edge fixed).
// 0 = that axis isn't controlled by this handle (midpoints only control one
// axis; corners control both).
export type ResizeSign = -1 | 0 | 1

export interface ResizeHandle {
  key: string
  top: string
  left: string
  cursor: string
  xSign: ResizeSign
  ySign: ResizeSign
}

// The 8 resize handles: 4 corners (control both axes) and 4 edge midpoints
// (control only their own axis). top/left as CSS percentages position each
// handle on its box's own edge; translate(-50%,-50%) (applied by whoever
// renders these) centers the handle dot on that edge/corner rather than
// sitting fully inside or outside it. Shared between an ordinary layer's own
// resize handles (EditorPage.tsx) and the crop overlay's selection
// rectangle (ImageCropOverlay.tsx) — same 8 positions either way.
export const RESIZE_HANDLES: ResizeHandle[] = [
  { key: 'tl', top: '0%', left: '0%', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
  { key: 'tm', top: '0%', left: '50%', cursor: 'ns-resize', xSign: 0, ySign: -1 },
  { key: 'tr', top: '0%', left: '100%', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
  { key: 'lm', top: '50%', left: '0%', cursor: 'ew-resize', xSign: -1, ySign: 0 },
  { key: 'rm', top: '50%', left: '100%', cursor: 'ew-resize', xSign: 1, ySign: 0 },
  { key: 'bl', top: '100%', left: '0%', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
  { key: 'bm', top: '100%', left: '50%', cursor: 'ns-resize', xSign: 0, ySign: 1 },
  { key: 'br', top: '100%', left: '100%', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
]

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

// Image-layer resize: unlike applyResizeDelta above (which lets width and
// height change independently — fine for a text box, which just reflows),
// an image renders via object-cover, so an independently-stretched box
// would force it to crop to fill the mismatched shape. Only ever called
// with a corner sign (both xSign and ySign nonzero — see CORNER_RESIZE_HANDLES
// in EditorPage.tsx), so this always scales width and height together by the
// same factor, keeping the image's own aspect ratio intact — a pure resize,
// never a crop. The scale factor is driven by whichever axis moved further
// (proportionally), so a mostly-horizontal or mostly-vertical drag both feel
// like dragging that corner naturally, not like fighting a hidden diagonal.
export function applyAspectLockedResizeDelta(
  layer: ImageLayer,
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  xSign: ResizeSign,
  ySign: ResizeSign,
): ImageLayer {
  const deltaX = (deltaXPx / displayScale) * xSign
  const deltaY = (deltaYPx / displayScale) * ySign
  const scaleFromWidth = (layer.width + deltaX) / layer.width
  const scaleFromHeight = (layer.height + deltaY) / layer.height
  const rawScale = Math.abs(scaleFromWidth - 1) > Math.abs(scaleFromHeight - 1) ? scaleFromWidth : scaleFromHeight
  const scale = Math.max(rawScale, MIN_LAYER_SIZE / layer.width, MIN_LAYER_SIZE / layer.height)

  const width = layer.width * scale
  const height = layer.height * scale
  const x = xSign === -1 ? layer.x + layer.width - width : layer.x
  const y = ySign === -1 ? layer.y + layer.height - height : layer.y

  return { ...layer, x, y, width, height }
}
