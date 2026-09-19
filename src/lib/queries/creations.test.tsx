import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
const { mockUploadPreview, mockRemovePreview, mockRemoveUnusedAssets } = vi.hoisted(() => ({
  mockUploadPreview: vi.fn(),
  mockRemovePreview: vi.fn(),
  mockRemoveUnusedAssets: vi.fn(),
}))
vi.mock('../previewStorage', () => ({ uploadPreview: mockUploadPreview, removePreview: mockRemovePreview }))
vi.mock('../assetStorage', () => ({ removeUnusedAssets: mockRemoveUnusedAssets }))

import { useCreations, useCreateCreation, useUpdateCreation, useDeleteCreation } from './creations'

const mockRow = {
  id: '1',
  name: 'Drake 1',
  tags: ['funny'],
  source_type: 'template' as const,
  template_id: 'tmpl-1',
  status: 'final' as const,
  canvas_data: {},
  preview_image_url: null,
  user_id: '00000000-0000-0000-0000-000000000001',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

let lastInsertArgs: unknown
let lastUpdateArgs: unknown
let existingPreviewUrl: string | null = null
let deleteError: { message: string } | null = null

beforeEach(() => {
  mockUploadPreview.mockReset().mockResolvedValue(null)
  mockRemovePreview.mockReset().mockResolvedValue(undefined)
  mockRemoveUnusedAssets.mockReset().mockResolvedValue(undefined)
  existingPreviewUrl = null
  deleteError = null
})

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [mockRow], error: null }),
        eq: () => ({
          single: () => Promise.resolve({ data: { preview_image_url: existingPreviewUrl }, error: null }),
        }),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: deleteError }) }),
      insert: (args: unknown) => {
        lastInsertArgs = args
        return {
          select: () => ({
            single: () => Promise.resolve({ data: mockRow, error: null }),
          }),
        }
      },
      update: (args: unknown) => {
        lastUpdateArgs = args
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: mockRow, error: null }),
            }),
          }),
        }
      },
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCreations', () => {
  it('returns the list of creations, newest first', async () => {
    const { result } = renderHook(() => useCreations(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([mockRow])
  })
})

describe('useCreateCreation', () => {
  it('inserts a creation and returns the created row', async () => {
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({ name: 'Drake 1', tags: ['funny'], sourceType: 'template', templateId: 'tmpl-1', canvasData: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockRow)
  })

  it('writes canvasData as the canvas_data column', async () => {
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({
      name: 'Drake 1',
      tags: ['funny'],
      sourceType: 'template',
      templateId: 'tmpl-1',
      canvasData: { layers: [{ id: 'f1', label: 'Caption 1', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastInsertArgs).toMatchObject({
      canvas_data: { layers: [{ id: 'f1', label: 'Caption 1', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] },
    })
  })
  it('renders no preview on its own: with no previewBlob it stores no preview URL', async () => {
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({ name: 'A', tags: [], sourceType: 'template', templateId: 't', canvasData: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastInsertArgs).toMatchObject({ preview_image_url: null })
  })

  it('uploads the given previewBlob and stores its public URL as preview_image_url', async () => {
    const blob = new Blob(['png'])
    mockUploadPreview.mockResolvedValue('https://x/creation-previews/new.png')
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({ name: 'A', tags: [], sourceType: 'template', templateId: 't', canvasData: {}, previewBlob: blob })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockUploadPreview).toHaveBeenCalledWith(blob)
    expect(lastInsertArgs).toMatchObject({ preview_image_url: 'https://x/creation-previews/new.png' })
  })

  it('still saves (with no preview) when the preview upload fails', async () => {
    mockUploadPreview.mockResolvedValue(null) // uploadPreview swallows its own failures
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({ name: 'A', tags: [], sourceType: 'template', templateId: 't', canvasData: {}, previewBlob: new Blob(['png']) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastInsertArgs).toMatchObject({ preview_image_url: null })
  })
})

describe('useUpdateCreation', () => {
  it('writes canvasData as the canvas_data column', async () => {
    const { result } = renderHook(() => useUpdateCreation(), { wrapper })
    result.current.mutate({
      id: '1',
      name: 'Drake 1',
      tags: ['funny'],
      canvasData: { layers: [] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUpdateArgs).toMatchObject({ canvas_data: { layers: [] } })
  })

  it('leaves preview_image_url alone when saving without a new previewBlob', async () => {
    const { result } = renderHook(() => useUpdateCreation(), { wrapper })
    result.current.mutate({ id: '1', name: 'A', tags: [], canvasData: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUpdateArgs).not.toHaveProperty('preview_image_url')
    expect(mockUploadPreview).not.toHaveBeenCalled()
  })

  it('stores the new preview and then deletes the one it replaced', async () => {
    existingPreviewUrl = 'https://x/creation-previews/old.png'
    mockUploadPreview.mockResolvedValue('https://x/creation-previews/new.png')
    const { result } = renderHook(() => useUpdateCreation(), { wrapper })
    result.current.mutate({ id: '1', name: 'A', tags: [], canvasData: {}, previewBlob: new Blob(['png']) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUpdateArgs).toMatchObject({ preview_image_url: 'https://x/creation-previews/new.png' })
    expect(mockRemovePreview).toHaveBeenCalledWith('https://x/creation-previews/old.png')
  })

  it('keeps the old preview when the new upload fails, rather than losing both', async () => {
    existingPreviewUrl = 'https://x/creation-previews/old.png'
    mockUploadPreview.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdateCreation(), { wrapper })
    result.current.mutate({ id: '1', name: 'A', tags: [], canvasData: {}, previewBlob: new Blob(['png']) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUpdateArgs).not.toHaveProperty('preview_image_url')
    expect(mockRemovePreview).not.toHaveBeenCalled()
  })
})

describe('useDeleteCreation', () => {
  const canvasData = { layers: [{ type: 'image', id: 'i', src: 'https://x/creation-assets/up.jpg' }] }

  it('deletes the row and then its preview file', async () => {
    const { result } = renderHook(() => useDeleteCreation(), { wrapper })
    result.current.mutate({ id: '1', previewImageUrl: 'https://x/creation-previews/old.png', canvasData })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockRemovePreview).toHaveBeenCalledWith('https://x/creation-previews/old.png')
  })

  it("also cleans up the creation's uploaded images, passing along its canvas data", async () => {
    const { result } = renderHook(() => useDeleteCreation(), { wrapper })
    result.current.mutate({ id: '1', previewImageUrl: null, canvasData })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockRemoveUnusedAssets).toHaveBeenCalledWith(canvasData)
  })

  it('cleans up nothing when the row could not be deleted (the creation still exists and still uses them)', async () => {
    deleteError = { message: 'boom' }
    const { result } = renderHook(() => useDeleteCreation(), { wrapper })
    result.current.mutate({ id: '1', previewImageUrl: 'https://x/creation-previews/old.png', canvasData })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockRemovePreview).not.toHaveBeenCalled()
    expect(mockRemoveUnusedAssets).not.toHaveBeenCalled()
  })

  it('still succeeds when the image cleanup fails, since a leftover file must never fail a delete', async () => {
    mockRemoveUnusedAssets.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useDeleteCreation(), { wrapper })
    result.current.mutate({ id: '1', previewImageUrl: null, canvasData })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
