import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CURRENT_USER_ID } from '../currentUser'
import { useTemplates, useTemplateFields, useTemplatesByUsage, useLogTemplateUsage } from './templates'

const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', order_index: 1 },
]
const mockTemplates = [
  { id: 't1', name: 'Two Buttons' },
  { id: 't2', name: 'Drake' },
]

let lastUsageInsert: unknown
let lastTemplateOrders: Array<[string, unknown]> = []
let usageEventsSelected = false

// Awaitable, chainable stand-in for a Supabase `templates` query: `useTemplates` awaits
// `.select('*')` directly, `useTemplatesByUsage` chains `.order(...)` first.
function templatesQuery() {
  const query = {
    order: (column: string, options: unknown) => {
      lastTemplateOrders.push([column, options])
      return query
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: mockTemplates, error: null }).then(resolve, reject),
  }
  return query
}

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
          select: () => {
            usageEventsSelected = true
            return Promise.resolve({ data: [], error: null })
          },
          insert: (values: unknown) => {
            lastUsageInsert = values
            return Promise.resolve({ error: null })
          },
        }
      }
      // templates
      return {
        select: () => templatesQuery(),
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
  it('orders templates by the cached all-time counter, then name, without reading events', async () => {
    lastTemplateOrders = []
    usageEventsSelected = false
    const { result } = renderHook(() => useTemplatesByUsage(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastTemplateOrders).toEqual([
      ['use_count_total', { ascending: false }],
      ['name', { ascending: true }],
    ])
    expect(usageEventsSelected).toBe(false)
    expect(result.current.data).toEqual(mockTemplates)
  })
})

describe('useLogTemplateUsage', () => {
  it('inserts a usage event for the given template id', async () => {
    const { result } = renderHook(() => useLogTemplateUsage(), { wrapper })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toEqual({ template_id: 't1', user_id: CURRENT_USER_ID })
  })
})
