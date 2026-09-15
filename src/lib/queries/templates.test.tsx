import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTemplates, useTemplateFields } from './templates'

const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', order_index: 1 },
]

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockFields, error: null }),
            }),
          }),
        }
      }
      return {
        select: () => Promise.resolve({ data: [{ id: '1', name: 'Drake' }], error: null }),
      }
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTemplates', () => {
  it('returns the list of templates from Supabase', async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([{ id: '1', name: 'Drake' }])
  })
})

describe('useTemplateFields', () => {
  it('returns the ordered fields for a template', async () => {
    const { result } = renderHook(() => useTemplateFields('tmpl-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockFields)
  })

  it('does not fetch when templateId is undefined', () => {
    const { result } = renderHook(() => useTemplateFields(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
