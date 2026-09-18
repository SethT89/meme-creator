import { describe, it, expect, vi } from 'vitest'
import { wrapTextLines, renderCreationToBlob } from './exportCanvas'
import type { Layer } from './layers'

// A fixed 10px-per-character stub — real font metrics aren't available in
// jsdom, and this keeps assertions simple and deterministic.
const fakeCtx = { measureText: (text: string) => ({ width: text.length * 10 }) }

describe('wrapTextLines', () => {
  it('returns an empty array for blank text', () => {
    expect(wrapTextLines(fakeCtx, '', 1000)).toEqual([])
    expect(wrapTextLines(fakeCtx, '   ', 1000)).toEqual([])
  })

  it('keeps everything on one line when it fits', () => {
    expect(wrapTextLines(fakeCtx, 'a b c', 1000)).toEqual(['a b c'])
  })

  it('breaks onto a new line once adding a word would exceed maxWidth', () => {
    // 'aaaaaaaaaa' is 100px. Adding ' bbbbbbbbbb' makes the line 210px,
    // over a 150px maxWidth, so it wraps onto its own line instead.
    expect(wrapTextLines(fakeCtx, 'aaaaaaaaaa bbbbbbbbbb', 150)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb'])
  })

  it('puts an unbreakably long single word on its own line rather than dropping it', () => {
    expect(wrapTextLines(fakeCtx, 'supercalifragilistic', 50)).toEqual(['supercalifragilistic'])
  })
})

describe('renderCreationToBlob', () => {
  function mockContext() {
    const calls: { method: string; args: unknown[] }[] = []
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
      strokeText: (...args: unknown[]) => calls.push({ method: 'strokeText', args }),
      fillText: (...args: unknown[]) => calls.push({ method: 'fillText', args }),
      // Fixed ascent/descent (not derived from fontSize) so a baseline-y
      // comparison across two calls isolates exactly the padding term —
      // see the scale test below.
      measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
    }
    return { ctx, calls }
  }

  function stubCanvas(ctx: unknown) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['fake'], { type: 'image/png' }))
    })
  }

  it("draws the background image first, then each layer's stroke before its fill", async () => {
    const { ctx, calls } = mockContext()
    stubCanvas(ctx)

    const image = document.createElement('img')
    const templateRow = { image_width: 600, image_height: 908 }
    const layers: Layer[] = [{ type: 'text', id: 'f1', label: 'hi', x: 10, y: 20, width: 100, height: 50, fontSize: 22, heightAuto: true }]

    const blob = await renderCreationToBlob(image, templateRow, layers)

    expect(blob.type).toBe('image/png')
    expect(calls[0]).toMatchObject({ method: 'drawImage', args: [image, 0, 0, 600, 908] })
    const strokeIndex = calls.findIndex((c) => c.method === 'strokeText')
    const fillIndex = calls.findIndex((c) => c.method === 'fillText')
    expect(strokeIndex).toBeGreaterThan(0)
    expect(fillIndex).toBeGreaterThan(strokeIndex)

    vi.restoreAllMocks()
  })

  it('draws image layers in layer order, sourcing only the cropped region of each', async () => {
    class LoadingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      crossOrigin = ''
      set src(_: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadingImage)
    const { ctx, calls } = mockContext()
    stubCanvas(ctx)

    const image = document.createElement('img')
    const layers: Layer[] = [
      {
        type: 'image',
        id: 'i1',
        src: 'https://example.com/sticker.jpg',
        naturalWidth: 400,
        naturalHeight: 300,
        x: 50,
        y: 60,
        width: 200,
        height: 100,
        cropX: 0.25,
        cropY: 0.5,
        cropWidth: 0.5,
        cropHeight: 0.5,
      },
      { type: 'text', id: 't1', label: 'hi', x: 10, y: 20, width: 100, height: 50, fontSize: 22, heightAuto: true },
    ]

    await renderCreationToBlob(image, { image_width: 600, image_height: 908 }, layers)

    const draws = calls.filter((c) => c.method === 'drawImage')
    expect(draws).toHaveLength(2) // background + the image layer
    // source rect = crop fractions * natural size; dest rect = the layer's own box
    expect(draws[1].args.slice(1)).toEqual([100, 150, 200, 150, 50, 60, 200, 100])
    // ...and it lands before the text layer's stroke, matching on-screen stacking.
    expect(calls.findIndex((c) => c === draws[1])).toBeLessThan(calls.findIndex((c) => c.method === 'strokeText'))

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('for a freeform canvas (a <div>, no background image), draws only the layers and sizes the canvas to the given size', async () => {
    class LoadingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      crossOrigin = ''
      set src(_: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadingImage)
    const { ctx, calls } = mockContext()
    stubCanvas(ctx)
    const createSpy = vi.spyOn(document, 'createElement')

    const box = document.createElement('div')
    const layers: Layer[] = [
      { type: 'image', id: 'i1', src: 'https://example.com/a.jpg', naturalWidth: 400, naturalHeight: 300, x: 0, y: 0, width: 400, height: 300 },
    ]

    await renderCreationToBlob(box, { image_width: 400, image_height: 300 }, layers)

    const canvas = createSpy.mock.results.map((r) => r.value).find((el) => el instanceof HTMLCanvasElement) as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([400, 300])
    // No template background to draw — the only drawImage is the layer itself.
    const draws = calls.filter((c) => c.method === 'drawImage')
    expect(draws).toHaveLength(1)
    expect(draws[0].args.slice(1)).toEqual([0, 0, 400, 300, 0, 0, 400, 300])

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("reads a freeform canvas box's displayed width from its bounding rect for the padding scale", async () => {
    const layers: Layer[] = [{ type: 'text', id: 'f1', label: 'hi', x: 10, y: 100, width: 200, height: 50, fontSize: 20, heightAuto: true }]

    async function baselineYAt(displayedWidth: number) {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      const box = document.createElement('div')
      box.getBoundingClientRect = () => ({ width: displayedWidth }) as DOMRect
      await renderCreationToBlob(box, { image_width: 600, image_height: 908 }, layers)
      vi.restoreAllMocks()
      return calls.find((c) => c.method === 'fillText')!.args[2] as number
    }

    // Same doubling-scale relationship the template-image test above checks.
    expect(await baselineYAt(300)).toBeGreaterThan(await baselineYAt(600))
  })

  describe('render options (for small previews)', () => {
    function recordingContext() {
      const { ctx, calls } = mockContext()
      const extra = ctx as typeof ctx & { scale: (...a: unknown[]) => void; fillRect: (...a: unknown[]) => void }
      extra.scale = (...args: unknown[]) => calls.push({ method: 'scale', args })
      extra.fillRect = (...args: unknown[]) => calls.push({ method: 'fillRect', args })
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(extra as unknown as CanvasRenderingContext2D)
      const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        cb: BlobCallback,
        type?: string,
      ) {
        cb(new Blob(['fake'], { type: type ?? 'image/png' }))
      })
      return { calls, toBlob }
    }
    const canvasOf = (spy: { mock: { results: { value: unknown }[] } }) =>
      spy.mock.results.map((r) => r.value).find((el) => el instanceof HTMLCanvasElement) as HTMLCanvasElement

    it('renders full size as a PNG by default (what Export uses)', async () => {
      const { toBlob } = recordingContext()
      const createSpy = vi.spyOn(document, 'createElement')

      const blob = await renderCreationToBlob(document.createElement('img'), { image_width: 3000, image_height: 2000 }, [])

      const canvas = canvasOf(createSpy)
      expect([canvas.width, canvas.height]).toEqual([3000, 2000])
      expect(toBlob.mock.calls[0][1]).toBe('image/png')
      expect(blob.type).toBe('image/png')
      vi.restoreAllMocks()
    })

    it('downscales so the longer edge is at most maxEdge, keeping the aspect ratio', async () => {
      const { calls } = recordingContext()
      const createSpy = vi.spyOn(document, 'createElement')

      await renderCreationToBlob(document.createElement('img'), { image_width: 3000, image_height: 2000 }, [], { maxEdge: 1200 })

      const canvas = canvasOf(createSpy)
      expect([canvas.width, canvas.height]).toEqual([1200, 800])
      // Everything is drawn in real-pixel coordinates, so one scale() call shrinks it all.
      expect(calls.find((c) => c.method === 'scale')?.args).toEqual([0.4, 0.4])
      vi.restoreAllMocks()
    })

    it('never upscales a canvas that is already smaller than maxEdge', async () => {
      const { calls } = recordingContext()
      const createSpy = vi.spyOn(document, 'createElement')

      await renderCreationToBlob(document.createElement('img'), { image_width: 600, image_height: 400 }, [], { maxEdge: 1200 })

      const canvas = canvasOf(createSpy)
      expect([canvas.width, canvas.height]).toEqual([600, 400])
      expect(calls.some((c) => c.method === 'scale')).toBe(false)
      vi.restoreAllMocks()
    })

    it('encodes as JPEG at the requested quality, on a white background (JPEG has no transparency)', async () => {
      const { calls, toBlob } = recordingContext()

      const blob = await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 400 }, [], {
        type: 'image/jpeg',
        quality: 0.8,
      })

      expect(toBlob.mock.calls[0][1]).toBe('image/jpeg')
      expect(toBlob.mock.calls[0][2]).toBe(0.8)
      expect(blob.type).toBe('image/jpeg')
      // The white fill is painted before anything else.
      expect(calls[0]).toMatchObject({ method: 'fillRect', args: [0, 0, 600, 400] })
      vi.restoreAllMocks()
    })

    it('leaves a PNG transparent — no background fill', async () => {
      const { calls } = recordingContext()
      await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 400 }, [])
      expect(calls.some((c) => c.method === 'fillRect')).toBe(false)
      vi.restoreAllMocks()
    })
  })

  it('rejects when no 2D context is available', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const image = document.createElement('img')
    await expect(renderCreationToBlob(image, { image_width: 10, image_height: 10 }, [])).rejects.toThrow(
      'Canvas 2D context is not available',
    )

    vi.restoreAllMocks()
  })

  it('scales the fixed on-screen padding to match the real-vs-displayed image size ratio', async () => {
    const templateRow = { image_width: 600, image_height: 908 }
    const layers: Layer[] = [{ type: 'text', id: 'f1', label: 'hi', x: 10, y: 100, width: 200, height: 50, fontSize: 20, heightAuto: true }]

    async function baselineYAt(displayedWidth: number) {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      const image = document.createElement('img')
      image.width = displayedWidth
      await renderCreationToBlob(image, templateRow, layers)
      vi.restoreAllMocks()
      return calls.find((c) => c.method === 'fillText')!.args[2] as number
    }

    const yAtActualSize = await baselineYAt(600) // scale = 600/600 = 1
    const yAtHalfSize = await baselineYAt(300) // scale = 600/300 = 2

    // Only the padding term (4px * scale) should move — the font-metric
    // (ascent/half-leading) term is already in real-resolution units and
    // doesn't depend on how zoomed in/out the on-screen preview was.
    expect(yAtHalfSize - yAtActualSize).toBeCloseTo(4 * (2 - 1), 5)
  })
})
