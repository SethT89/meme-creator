import { describe, it, expect, vi, afterEach } from 'vitest'
import { wrapTextLines, renderCreationToBlob } from './exportCanvas'
import type { Layer } from './layers'
import { SYSTEM_FONT_STACK } from './fonts'

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
    const calls: { method: string; args: unknown[]; lineJoin?: string }[] = []
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
      // Records the line-join style in force at the moment the outline is drawn.
      strokeText: (...args: unknown[]) => calls.push({ method: 'strokeText', args, lineJoin: ctx.lineJoin }),
      fillText: (...args: unknown[]) => calls.push({ method: 'fillText', args }),
      // Fixed ascent/descent (not derived from fontSize) so a baseline-y
      // comparison across two calls isolates exactly the padding term —
      // see the scale test below.
      measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      lineJoin: 'miter', // the real canvas default — the source of the spikes if it is never changed
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

    const blob = await renderCreationToBlob(document.createElement('div'), templateRow, layers, {
      background: { image, x: 0, y: 0, width: 600, height: 908 },
    })

    expect(blob.type).toBe('image/png')
    expect(calls[0]).toMatchObject({ method: 'drawImage', args: [image, 0, 0, 600, 908] })
    const strokeIndex = calls.findIndex((c) => c.method === 'strokeText')
    const fillIndex = calls.findIndex((c) => c.method === 'fillText')
    expect(strokeIndex).toBeGreaterThan(0)
    expect(fillIndex).toBeGreaterThan(strokeIndex)

    vi.restoreAllMocks()
  })

  it('draws the outline with rounded joins, so the sharp corners of letters (W, V, A, K, X) do not shoot out as black spikes', async () => {
    // A canvas stroke defaults to mitered joins, and this outline is very thick (0.24em): at a sharp
    // corner the miter extends far past the letter as a spike. The on-screen editor draws it clean, so
    // the export must too.
    const { ctx, calls } = mockContext()
    stubCanvas(ctx)
    const layers: Layer[] = [{ type: 'text', id: 'f1', label: 'WAVE', x: 10, y: 20, width: 300, height: 80, fontSize: 60, heightAuto: true }]

    await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 400 }, layers)

    const stroke = calls.find((c) => c.method === 'strokeText')
    expect(stroke).toBeDefined()
    expect(stroke!.lineJoin).toBe('round')

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

    await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 908 }, layers, {
      background: { image, x: 0, y: 0, width: 600, height: 908 },
    })

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

  it('uses an explicit displayWidth for the padding scale when there is no on-screen element to measure (rendering a saved meme from its data)', async () => {
    const layers: Layer[] = [{ type: 'text', id: 'f1', label: 'hi', x: 10, y: 100, width: 200, height: 50, fontSize: 20, heightAuto: true }]

    async function baselineYWith(displayWidth: number | undefined) {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      // A detached element has no size, exactly like the stand-in the gallery passes.
      await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 908 }, layers, { displayWidth })
      vi.restoreAllMocks()
      return calls.find((c) => c.method === 'fillText')!.args[2] as number
    }

    // Shown narrower => the fixed 4px CSS padding is a bigger share of the image => text sits lower.
    expect(await baselineYWith(300)).toBeGreaterThan(await baselineYWith(600))
    // And it beats the detached element's zero width, which would otherwise mean "no scaling".
    expect(await baselineYWith(300)).toBeGreaterThan((await baselineYWith(undefined)) as number)
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

      const blob = await renderCreationToBlob(document.createElement('div'), { image_width: 3000, image_height: 2000 }, [])

      const canvas = canvasOf(createSpy)
      expect([canvas.width, canvas.height]).toEqual([3000, 2000])
      expect(toBlob.mock.calls[0][1]).toBe('image/png')
      expect(blob.type).toBe('image/png')
      vi.restoreAllMocks()
    })

    it('downscales so the longer edge is at most maxEdge, keeping the aspect ratio', async () => {
      const { calls } = recordingContext()
      const createSpy = vi.spyOn(document, 'createElement')

      await renderCreationToBlob(document.createElement('div'), { image_width: 3000, image_height: 2000 }, [], { maxEdge: 1200 })

      const canvas = canvasOf(createSpy)
      expect([canvas.width, canvas.height]).toEqual([1200, 800])
      // Everything is drawn in real-pixel coordinates, so one scale() call shrinks it all.
      expect(calls.find((c) => c.method === 'scale')?.args).toEqual([0.4, 0.4])
      vi.restoreAllMocks()
    })

    it('never upscales a canvas that is already smaller than maxEdge', async () => {
      const { calls } = recordingContext()
      const createSpy = vi.spyOn(document, 'createElement')

      await renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 400 }, [], { maxEdge: 1200 })

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

  describe('background image', () => {
    it('draws the background at its own position and size inside the canvas, before every layer (a template on an enlarged canvas)', async () => {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      const image = document.createElement('img')
      const layers: Layer[] = [{ type: 'text', id: 't', label: 'hi', x: 10, y: 10, width: 100, height: 50, fontSize: 20, heightAuto: true }]

      await renderCreationToBlob(document.createElement('div'), { image_width: 700, image_height: 908 }, layers, {
        background: { image, x: 100, y: 0, width: 600, height: 908 },
      })

      expect(calls[0]).toMatchObject({ method: 'drawImage', args: [image, 100, 0, 600, 908] })
      expect(calls.findIndex((c) => c.method === 'strokeText')).toBeGreaterThan(0)
      vi.restoreAllMocks()
    })

    it('draws nothing as a background when none is given (a freeform canvas), leaving it transparent', async () => {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      await renderCreationToBlob(document.createElement('div'), { image_width: 700, image_height: 908 }, [])
      expect(calls.some((c) => c.method === 'drawImage')).toBe(false)
      vi.restoreAllMocks()
    })

    it('lets the background hang off the canvas (a canvas shrunk below the image); the canvas itself does the cropping', async () => {
      const { ctx, calls } = mockContext()
      stubCanvas(ctx)
      const image = document.createElement('img')

      await renderCreationToBlob(document.createElement('div'), { image_width: 400, image_height: 500 }, [], {
        background: { image, x: -100, y: -50, width: 600, height: 908 },
      })

      expect(calls[0].args).toEqual([image, -100, -50, 600, 908])
      vi.restoreAllMocks()
    })

    it('scales the background down with everything else in a downscaled preview', async () => {
      const { ctx, calls } = mockContext()
      const extra = ctx as typeof ctx & { scale: (...a: unknown[]) => void }
      extra.scale = (...args: unknown[]) => calls.push({ method: 'scale', args })
      stubCanvas(extra)
      const image = document.createElement('img')

      await renderCreationToBlob(document.createElement('div'), { image_width: 2400, image_height: 1200 }, [], {
        maxEdge: 1200,
        background: { image, x: 0, y: 0, width: 2400, height: 1200 },
      })

      const scaleIndex = calls.findIndex((c) => c.method === 'scale')
      const drawIndex = calls.findIndex((c) => c.method === 'drawImage')
      expect(scaleIndex).toBeGreaterThanOrEqual(0)
      expect(scaleIndex).toBeLessThan(drawIndex) // scale first, so the draw lands at half size
      vi.restoreAllMocks()
    })
  })

  it('rejects when no 2D context is available', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const image = document.createElement('div')
    await expect(renderCreationToBlob(image, { image_width: 10, image_height: 10 }, [])).rejects.toThrow(
      'Canvas 2D context is not available',
    )

    vi.restoreAllMocks()
  })

})

describe('renderCreationToBlob text styling', () => {
  function styledContext() {
    const calls: { method: string; args: unknown[] }[] = []
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
      strokeText: (...args: unknown[]) => calls.push({ method: 'strokeText', args }),
      fillText: (...args: unknown[]) => calls.push({ method: 'fillText', args }),
      measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(['fake'], { type: 'image/png' }))
    })
    return { ctx, calls }
  }

  // x=10, width=100, jsdom display width 0 → scale 1 → 4px padding:
  // left anchor 14, center 60, right 106.
  const layer = (over: Partial<Extract<Layer, { type: 'text' }>> = {}): Layer => ({
    type: 'text',
    id: 't1',
    label: 'hi',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    fontSize: 22,
    heightAuto: true,
    ...over,
  })
  const render = (layers: Layer[]) =>
    renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 908 }, layers)

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'fonts')
  })

  it('draws a layer with no style fields exactly as before: system bold, white fill, black outline, centered', async () => {
    const { ctx, calls } = styledContext()
    await render([layer()])

    expect(ctx.font).toBe(`700 22px ${SYSTEM_FONT_STACK}`)
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.strokeStyle).toBe('#000000')
    expect(ctx.textAlign).toBe('center')
    expect(calls.find((c) => c.method === 'fillText')?.args[1]).toBe(60)
  })

  it("uses the layer's font, fill color and outline color", async () => {
    const { ctx, calls } = styledContext()
    await render([layer({ fontFamily: 'anton', color: '#ff0000', strokeColor: '#00ff00' })])

    expect(ctx.font).toBe(`400 22px "Anton", ${SYSTEM_FONT_STACK}`)
    expect(ctx.fillStyle).toBe('#ff0000')
    expect(ctx.strokeStyle).toBe('#00ff00')
    expect(calls.some((c) => c.method === 'strokeText')).toBe(true)
  })

  it('skips the outline entirely when strokeColor is null', async () => {
    const { calls } = styledContext()
    await render([layer({ strokeColor: null })])

    expect(calls.some((c) => c.method === 'strokeText')).toBe(false)
    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })

  it.each([
    ['left', 14],
    ['center', 60],
    ['right', 106],
  ] as const)('aligns %s by anchoring the text at x=%s', async (textAlign, anchorX) => {
    const { ctx, calls } = styledContext()
    await render([layer({ textAlign })])

    expect(ctx.textAlign).toBe(textAlign)
    expect(calls.find((c) => c.method === 'fillText')?.args[1]).toBe(anchorX)
  })

  it('waits for every web font used by a text layer to load before drawing anything', async () => {
    const { calls } = styledContext()
    let release!: () => void
    const load = vi.fn(() => new Promise<FontFace[]>((resolve) => (release = () => resolve([]))))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    const pending = render([layer({ fontFamily: 'anton', label: 'hello' })])

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(expect.stringContaining('"Anton"'), 'hello')
    expect(calls.some((c) => c.method === 'fillText')).toBe(false)

    release()
    await pending
    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })

  it('loads each distinct font once, and skips legacy layers that use no web font', async () => {
    styledContext()
    const load = vi.fn(() => Promise.resolve([] as FontFace[]))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    await render([layer({ id: 'a', fontFamily: 'bangers' }), layer({ id: 'b', fontFamily: 'bangers' }), layer({ id: 'c' })])

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(expect.stringContaining('"Bangers"'), expect.any(String))
  })

  it('still exports (in the fallback font) if a font fails to load', async () => {
    const { calls } = styledContext()
    const load = vi.fn(() => Promise.reject(new Error('network')))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    await render([layer({ fontFamily: 'anton' })])

    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })
})
