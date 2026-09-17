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
      measureText: (text: string) => ({ width: text.length * 10 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
    }
    return { ctx, calls }
  }

  it("draws the background image first, then each layer's stroke before its fill", async () => {
    const { ctx, calls } = mockContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['fake'], { type: 'image/png' }))
    })

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
})
