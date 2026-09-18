import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prepareImageForUpload, MAX_UPLOAD_DIMENSION, UPLOAD_JPEG_QUALITY } from './imageUpload'

// jsdom doesn't decode images or implement canvas — stub both, the same
// general approach exportCanvas.test.ts already uses for canvas/toBlob.
class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

function stubImageDimensions(width: number, height: number) {
  class SizedMockImage extends MockImage {
    naturalWidth = width
    naturalHeight = height
  }
  vi.stubGlobal('Image', SizedMockImage)
}

function stubCanvas() {
  const drawImageCalls: unknown[][] = []
  const ctx = { drawImage: (...args: unknown[]) => drawImageCalls.push(args) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  // vi.fn already records every call's real arguments — no need to do
  // anything beyond invoking the callback with a fake Blob.
  const toBlobSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((cb: BlobCallback, type?: string) => cb(new Blob(['fake'], { type: type ?? 'image/png' })))
  return { drawImageCalls, toBlobSpy }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

describe('prepareImageForUpload', () => {
  it('downscales an image larger than MAX_UPLOAD_DIMENSION, preserving aspect ratio', async () => {
    stubImageDimensions(4032, 3024) // 12MP phone photo, 4:3
    const { drawImageCalls } = stubCanvas()

    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' })
    const { width, height } = await prepareImageForUpload(file)

    // Long edge (4032) scales down to exactly MAX_UPLOAD_DIMENSION.
    expect(width).toBe(MAX_UPLOAD_DIMENSION)
    expect(height).toBe(Math.round(3024 * (MAX_UPLOAD_DIMENSION / 4032)))
    expect(drawImageCalls[0]).toEqual([expect.anything(), 0, 0, width, height])
  })

  it('never upscales an image already smaller than MAX_UPLOAD_DIMENSION', async () => {
    stubImageDimensions(400, 300)
    stubCanvas()

    const file = new File(['fake'], 'small.png', { type: 'image/png' })
    const { width, height } = await prepareImageForUpload(file)

    expect(width).toBe(400)
    expect(height).toBe(300)
  })

  it('re-encodes as JPEG at UPLOAD_JPEG_QUALITY regardless of the original format', async () => {
    stubImageDimensions(400, 300)
    const { toBlobSpy } = stubCanvas()

    const file = new File(['fake'], 'original.png', { type: 'image/png' })
    const { blob } = await prepareImageForUpload(file)

    expect(blob.type).toBe('image/jpeg')
    const [, type, quality] = toBlobSpy.mock.calls[0]
    expect(type).toBe('image/jpeg')
    expect(quality).toBe(UPLOAD_JPEG_QUALITY)
  })

  it('rejects when no 2D context is available', async () => {
    stubImageDimensions(400, 300)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' })
    await expect(prepareImageForUpload(file)).rejects.toThrow('Canvas 2D context is not available')
  })

  it('rejects when the image fails to load', async () => {
    class FailingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailingImage)

    const file = new File(['fake'], 'corrupt.jpg', { type: 'image/jpeg' })
    await expect(prepareImageForUpload(file)).rejects.toThrow('Could not read the selected image')
  })
})
