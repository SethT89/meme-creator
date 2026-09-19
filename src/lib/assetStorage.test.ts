import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRemove, mockSelect } = vi.hoisted(() => ({
  mockRemove: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'creations') throw new Error(`unexpected table ${table}`)
      return { select: mockSelect }
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== 'creation-assets') throw new Error(`unexpected bucket ${bucket}`)
        return { remove: mockRemove }
      },
    },
  },
}))

import { assetPathFromUrl, assetPathsFromCanvasData, removeUnusedAssets } from './assetStorage'

const url = (path: string) => `https://x.supabase.co/storage/v1/object/public/creation-assets/${path}`
const imageLayer = (src: string) => ({ type: 'image', id: src, src, x: 0, y: 0, width: 1, height: 1 })
const textLayer = { type: 'text', id: 't', label: 'hi', x: 0, y: 0, width: 1, height: 1, fontSize: 20, heightAuto: true }

beforeEach(() => {
  mockRemove.mockReset().mockResolvedValue({ data: [], error: null })
  mockSelect.mockReset().mockResolvedValue({ data: [], error: null })
})

describe('assetPathFromUrl', () => {
  it("extracts the object path from the assets bucket's public URL", () => {
    expect(assetPathFromUrl(url('abc-123.jpg'))).toBe('abc-123.jpg')
  })

  it('returns null for another bucket, a local blob: preview, junk, or nothing', () => {
    expect(assetPathFromUrl('https://x.supabase.co/storage/v1/object/public/template-images/random/a.jpg')).toBeNull()
    expect(assetPathFromUrl('https://x.supabase.co/storage/v1/object/public/creation-previews/a.jpg')).toBeNull()
    expect(assetPathFromUrl('blob:http://localhost:5173/1234')).toBeNull()
    expect(assetPathFromUrl('not a url')).toBeNull()
    expect(assetPathFromUrl(null)).toBeNull()
    expect(assetPathFromUrl(undefined)).toBeNull()
  })
})

describe('assetPathsFromCanvasData', () => {
  it("lists the uploaded-image paths of a creation's image layers, once each", () => {
    const canvasData = { layers: [imageLayer(url('a.jpg')), textLayer, imageLayer(url('b.jpg')), imageLayer(url('a.jpg'))] }
    expect(assetPathsFromCanvasData(canvasData).sort()).toEqual(['a.jpg', 'b.jpg'])
  })

  it('ignores text layers, layers whose image is not in the assets bucket, and layers with no src', () => {
    const canvasData = { layers: [textLayer, imageLayer('blob:http://localhost/1'), { type: 'image', id: 'x' }] }
    expect(assetPathsFromCanvasData(canvasData)).toEqual([])
  })

  it.each([null, undefined, {}, { layers: 'nope' }, 42, 'text'])('returns nothing for canvas_data that is %j', (canvasData) => {
    expect(assetPathsFromCanvasData(canvasData)).toEqual([])
  })
})

describe('removeUnusedAssets', () => {
  it("removes a deleted creation's uploaded images when no remaining creation uses them", async () => {
    mockSelect.mockResolvedValue({ data: [{ canvas_data: { layers: [imageLayer(url('other.jpg'))] } }], error: null })

    await removeUnusedAssets({ layers: [imageLayer(url('a.jpg')), imageLayer(url('b.jpg'))] })

    expect(mockRemove).toHaveBeenCalledTimes(1)
    expect(mockRemove.mock.calls[0][0].sort()).toEqual(['a.jpg', 'b.jpg'])
  })

  it('keeps an image another creation still uses (Save As copies share their uploads), removing only the rest', async () => {
    mockSelect.mockResolvedValue({ data: [{ canvas_data: { layers: [imageLayer(url('shared.jpg'))] } }], error: null })

    await removeUnusedAssets({ layers: [imageLayer(url('shared.jpg')), imageLayer(url('mine.jpg'))] })

    expect(mockRemove).toHaveBeenCalledWith(['mine.jpg'])
  })

  it('removes nothing when every image is still in use', async () => {
    mockSelect.mockResolvedValue({ data: [{ canvas_data: { layers: [imageLayer(url('shared.jpg'))] } }], error: null })

    await removeUnusedAssets({ layers: [imageLayer(url('shared.jpg'))] })

    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('does not even look anything up when the deleted creation had no uploaded images', async () => {
    await removeUnusedAssets({ layers: [textLayer] })
    await removeUnusedAssets(null)

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("removes nothing if it can't tell what is still in use (a failed lookup must never cost someone their images)", async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await removeUnusedAssets({ layers: [imageLayer(url('a.jpg'))] })
    expect(mockRemove).not.toHaveBeenCalled()

    mockSelect.mockRejectedValue(new Error('network'))
    await removeUnusedAssets({ layers: [imageLayer(url('a.jpg'))] })
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('never throws, even when the removal itself fails (a leftover file is harmless; a failed delete is not)', async () => {
    mockRemove.mockRejectedValue(new Error('boom'))
    await expect(removeUnusedAssets({ layers: [imageLayer(url('a.jpg'))] })).resolves.toBeUndefined()

    mockRemove.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(removeUnusedAssets({ layers: [imageLayer(url('a.jpg'))] })).resolves.toBeUndefined()
  })

  it("treats a remaining creation with missing or odd canvas_data as using nothing", async () => {
    mockSelect.mockResolvedValue({ data: [{ canvas_data: null }, { canvas_data: {} }], error: null })

    await removeUnusedAssets({ layers: [imageLayer(url('a.jpg'))] })

    expect(mockRemove).toHaveBeenCalledWith(['a.jpg'])
  })
})
