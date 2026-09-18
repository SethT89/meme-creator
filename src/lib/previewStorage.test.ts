import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUpload, mockRemove, mockFrom } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        mockFrom(bucket)
        return {
          upload: mockUpload,
          remove: mockRemove,
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        }
      },
    },
  },
}))

import { previewPathFromUrl, uploadPreview, removePreview } from './previewStorage'

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ data: { path: 'p' }, error: null })
  mockRemove.mockReset().mockResolvedValue({ data: [], error: null })
  mockFrom.mockReset()
})

describe('previewPathFromUrl', () => {
  it("extracts the object path from a preview bucket's public URL", () => {
    expect(previewPathFromUrl('https://x.supabase.co/storage/v1/object/public/creation-previews/abc.png')).toBe('abc.png')
  })

  it('returns null for a URL that is not in the previews bucket, or for null', () => {
    expect(previewPathFromUrl('https://x.supabase.co/storage/v1/object/public/creation-assets/abc.jpg')).toBeNull()
    expect(previewPathFromUrl(null)).toBeNull()
  })
})

describe('uploadPreview', () => {
  it('uploads the PNG to the creation-previews bucket and returns its public URL', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })

    const url = await uploadPreview(blob)

    expect(mockFrom).toHaveBeenCalledWith('creation-previews')
    expect(mockUpload).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}\.png$/), blob, { contentType: 'image/png' })
    expect(url).toMatch(/\/creation-previews\/[0-9a-f-]{36}\.png$/)
  })

  it('uses a fresh path every time, so a re-save never serves a stale cached image', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const a = await uploadPreview(blob)
    const b = await uploadPreview(blob)
    expect(a).not.toBe(b)
  })

  it('returns null instead of throwing when there is no blob to upload', async () => {
    expect(await uploadPreview(null)).toBeNull()
    expect(await uploadPreview(undefined)).toBeNull()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('returns null instead of throwing when the upload fails (a missing preview must never block a save)', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await uploadPreview(new Blob(['png']))).toBeNull()
  })

  it('returns null when the upload call itself throws', async () => {
    mockUpload.mockRejectedValue(new Error('network'))
    expect(await uploadPreview(new Blob(['png']))).toBeNull()
  })
})

describe('removePreview', () => {
  it('deletes the object behind a preview URL', async () => {
    await removePreview('https://x.supabase.co/storage/v1/object/public/creation-previews/abc.png')
    expect(mockFrom).toHaveBeenCalledWith('creation-previews')
    expect(mockRemove).toHaveBeenCalledWith(['abc.png'])
  })

  it('does nothing for null or a URL from some other bucket', async () => {
    await removePreview(null)
    await removePreview('https://x.supabase.co/storage/v1/object/public/creation-assets/abc.jpg')
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('swallows failures — an orphaned file is not worth failing a save or delete over', async () => {
    mockRemove.mockRejectedValue(new Error('network'))
    await expect(removePreview('https://x.supabase.co/storage/v1/object/public/creation-previews/abc.png')).resolves.toBeUndefined()
  })
})
