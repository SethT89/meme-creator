import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTemplates, useTemplateFields, useTemplatesByUsage, useLogTemplateUsage } from './templates'

const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', order_index: 1 },
]
const mockTemplates = [
  { id: 't1', name: 'Two Buttons' },
  { id: 't2', name: 'Drake' },
]
const mockUsageEvents = [{ template_id: 't2' }, { template_id: 't2' }]

let lastUsageInsert: unknown

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
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: mockUsageEvents, error: null }),
          insert: (values: unknown) => {
            lastUsageInsert = values
            return Promise.resolve({ error: null })
          },
        }
      }
      // templates
      return {
        select: () => Promise.resolve({ data: mockTemplates, error: null }),
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
    expect(result.current.data).toEqual(mockTemplates)
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

describe('useTemplatesByUsage', () => {
  it('returns templates sorted by usage event count descending', async () => {
    const { result } = renderHook(() => useTemplatesByUsage(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual(['t2', 't1'])
  })
})

describe('useLogTemplateUsage', () => {
  it('inserts a usage event for the given template id', async () => {
    const { result } = renderHook(() => useLogTemplateUsage(), { wrapper })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toMatchObject({ template_id: 't1' })
  })
})
