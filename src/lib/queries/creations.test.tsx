import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreations, useCreateCreation } from './creations'

const mockRow = {
  id: '1',
  name: 'Drake 1',
  tags: ['funny'],
  source_type: 'template' as const,
  template_id: 'tmpl-1',
  status: 'final' as const,
  canvas_data: {},
  exported_image_url: null,
  user_id: '00000000-0000-0000-0000-000000000001',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [mockRow], error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: mockRow, error: null }),
        }),
      }),
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
    result.current.mutate({ name: 'Drake 1', tags: ['funny'], sourceType: 'template', templateId: 'tmpl-1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockRow)
  })
})
