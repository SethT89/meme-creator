import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./exportCanvas', () => ({
  renderCreationToBlob: vi.fn(),
  loadImage: vi.fn(),
}))
import { renderCreationToBlob, loadImage } from './exportCanvas'
import { renderSavedCreationToBlob, NOMINAL_DISPLAY_WIDTH } from './renderSavedCreation'

const FULL_BLOB = new Blob(['png'], { type: 'image/png' })
const templateImage = { tag: 'template-image' } as unknown as HTMLImageElement
const template = { image_width: 600, image_height: 908, blank_image_url: 'https://x/blank.jpg' }
const textLayer = { type: 'text', id: 'l1', label: 'hi', x: 10, y: 20, width: 200, height: 50, fontSize: 30, heightAuto: true }

beforeEach(() => {
  vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(FULL_BLOB)
  vi.mocked(loadImage).mockReset().mockResolvedValue(templateImage)
})

const rendered = () => {
  const [, size, layers, options] = vi.mocked(renderCreationToBlob).mock.calls[0]
  return { size, layers: layers!, options: options! }
}

describe('renderSavedCreationToBlob', () => {
  it("rebuilds a template meme at the template's real size, on top of the template image, with its saved layers", async () => {
    const blob = await renderSavedCreationToBlob(
      { source_type: 'template', template_id: 't1', canvas_data: { layers: [textLayer] } },
      template,
    )

    expect(blob).toBe(FULL_BLOB)
    expect(loadImage).toHaveBeenCalledWith('https://x/blank.jpg')
    const { size, layers, options } = rendered()
    expect(size).toEqual({ image_width: 600, image_height: 908 })
    expect(layers).toEqual([textLayer])
    expect(options.background).toEqual({ image: templateImage, x: 0, y: 0, width: 600, height: 908 })
  })

  it('renders lossless and full size, exactly like the Export button: no JPEG, no downscaling', async () => {
    await renderSavedCreationToBlob({ source_type: 'template', template_id: 't1', canvas_data: { layers: [textLayer] } }, template)

    const { options } = rendered()
    expect(options.type).toBeUndefined() // the renderer's default is a lossless PNG
    expect(options.maxEdge).toBeUndefined()
    expect(options.quality).toBeUndefined()
  })

  it('assumes a typical on-screen width for the fixed text padding, since nothing is on screen to measure', async () => {
    await renderSavedCreationToBlob({ source_type: 'template', template_id: 't1', canvas_data: { layers: [] } }, template)

    expect(rendered().options.displayWidth).toBe(NOMINAL_DISPLAY_WIDTH)
  })

  it('honours an adjusted canvas: its size, and where the template image sits on it', async () => {
    await renderSavedCreationToBlob(
      {
        source_type: 'template',
        template_id: 't1',
        canvas_data: { layers: [], canvasWidth: 900, canvasHeight: 1000, backgroundX: 150, backgroundY: -20 },
      },
      template,
    )

    const { size, options } = rendered()
    expect(size).toEqual({ image_width: 900, image_height: 1000 })
    // the image itself keeps its own size; only the canvas around it changed
    expect(options.background).toEqual({ image: templateImage, x: 150, y: -20, width: 600, height: 908 })
  })

  it("rebuilds a freeform meme at its own saved size, with nothing drawn underneath", async () => {
    await renderSavedCreationToBlob(
      { source_type: 'freeform', template_id: null, canvas_data: { layers: [textLayer], canvasWidth: 400, canvasHeight: 300 } },
      undefined,
    )

    expect(loadImage).not.toHaveBeenCalled()
    const { size, options } = rendered()
    expect(size).toEqual({ image_width: 400, image_height: 300 })
    expect(options.background).toBeUndefined()
  })

  it('refuses a freeform meme that has no saved size, rather than guessing one', async () => {
    await expect(
      renderSavedCreationToBlob({ source_type: 'freeform', template_id: null, canvas_data: { layers: [] } }, undefined),
    ).rejects.toThrow(/size/i)
    expect(renderCreationToBlob).not.toHaveBeenCalled()
  })

  it('refuses a template meme whose template is gone, rather than exporting it without its picture', async () => {
    await expect(
      renderSavedCreationToBlob({ source_type: 'template', template_id: 't1', canvas_data: { layers: [] } }, undefined),
    ).rejects.toThrow(/template/i)
    expect(renderCreationToBlob).not.toHaveBeenCalled()
  })

  it("falls back to the template's own caption fields for an older save that stored no layers", async () => {
    const fields = [{ id: 'f1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22 }]
    await renderSavedCreationToBlob({ source_type: 'template', template_id: 't1', canvas_data: {} }, template, fields)

    const { layers } = rendered()
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({ type: 'text', label: 'Caption 1' })
  })

  it('keeps a saved empty layer list empty (every layer was deleted) instead of bringing the default captions back', async () => {
    const fields = [{ id: 'f1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22 }]
    await renderSavedCreationToBlob({ source_type: 'template', template_id: 't1', canvas_data: { layers: [] } }, template, fields)

    expect(rendered().layers).toEqual([])
  })
})
