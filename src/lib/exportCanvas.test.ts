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
    const layers: Layer[] = [{ id: 'f1', label: 'hi', x: 10, y: 20, width: 100, height: 50, fontSize: 22, heightAuto: true }]

    const blob = await renderCreationToBlob(image, templateRow, layers)

    expect(blob.type).toBe('image/png')
    expect(calls[0]).toMatchObject({ method: 'drawImage', args: [image, 0, 0, 600, 908] })
    const strokeIndex = calls.findIndex((c) => c.method === 'strokeText')
    const fillIndex = calls.findIndex((c) => c.method === 'fillText')
    expect(strokeIndex).toBeGreaterThan(0)
    expect(fillIndex).toBeGreaterThan(strokeIndex)

    vi.restoreAllMocks()
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
    const layers: Layer[] = [{ id: 'f1', label: 'hi', x: 10, y: 100, width: 200, height: 50, fontSize: 20, heightAuto: true }]

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
