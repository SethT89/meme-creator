import { loadImage, renderCreationToBlob } from './exportCanvas'
import type { RenderOptions } from './exportCanvas'
import { layersFromCanvasData } from './layers'
import type { TemplateFieldRow } from './layers'

// Only the fixed 4px text padding depends on how big the meme was shown on screen (see exportCanvas),
// and there is no screen when a saved meme is rebuilt from its data. The editor's canvas is about 300-650
// CSS px wide on any device, so a typical value keeps the text inset within a pixel or two of what Export
// gives at any size that matters.
export const NOMINAL_DISPLAY_WIDTH = 320

interface SavedCreation {
  source_type: 'template' | 'freeform'
  template_id: string | null
  canvas_data: unknown
}

interface TemplateForRender {
  image_width: number
  image_height: number
  blank_image_url: string
}

// Saved canvas_data is untyped JSON; these are the fields the editor writes (see EditorPage.buildCanvasData).
interface SavedCanvasData {
  canvasWidth?: number
  canvasHeight?: number
  backgroundX?: number
  backgroundY?: number
}

// Rebuilds a saved meme from its stored data and renders it with the SAME code the Export button uses:
// a lossless PNG at the meme's real pixel size. The gallery's Download used to send the stored preview,
// which is a compressed JPEG — so its text picked up JPEG noise that Export never has.
//
// `template` is the meme's template row (required for a template meme, ignored for a freeform one);
// `fallbackFields` is only used for an older save that stored no layers at all.
export async function renderSavedCreationToBlob(
  creation: SavedCreation,
  template: TemplateForRender | undefined,
  fallbackFields: TemplateFieldRow[] = [],
): Promise<Blob> {
  const saved = (creation.canvas_data ?? {}) as SavedCanvasData
  const layers = layersFromCanvasData(creation.canvas_data, fallbackFields)
  const adjusted = Boolean(saved.canvasWidth && saved.canvasHeight)

  let size: { image_width: number; image_height: number }
  let background: RenderOptions['background']

  if (creation.source_type === 'template') {
    if (!template) throw new Error('Cannot render this meme: its template no longer exists')
    size = adjusted
      ? { image_width: saved.canvasWidth!, image_height: saved.canvasHeight! }
      : { image_width: template.image_width, image_height: template.image_height }
    // The template image keeps its own size; only an adjusted canvas moves it around.
    background = {
      image: await loadImage(template.blank_image_url),
      x: adjusted ? (saved.backgroundX ?? 0) : 0,
      y: adjusted ? (saved.backgroundY ?? 0) : 0,
      width: template.image_width,
      height: template.image_height,
    }
  } else {
    if (!adjusted) throw new Error('Cannot render this meme: it has no saved canvas size')
    size = { image_width: saved.canvasWidth!, image_height: saved.canvasHeight! }
  }

  // A detached element: it is only ever measured, and displayWidth says what to assume instead.
  return renderCreationToBlob(document.createElement('div'), size, layers, { background, displayWidth: NOMINAL_DISPLAY_WIDTH })
}
