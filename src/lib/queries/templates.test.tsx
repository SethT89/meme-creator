import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CURRENT_USER_ID } from '../currentUser'
import { useTemplates, useTemplateFields, useTemplatesByUsage, useLogTemplateUsage, useLogExport, fetchTemplate, fetchTemplateFields } from './templates'

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
    eq: (column: string, value: string) => ({
      maybeSingle: () => Promise.resolve({ data: mockTemplates.find((t) => (t as Record<string, unknown>)[column === 'id' ? 'id' : column] === value) ?? null, error: null }),
    }),
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
    expect(lastUsageInsert).toEqual({ template_id: 't1', event_type: 'pick', user_id: CURRENT_USER_ID })
  })
})

describe('useLogExport', () => {
  it('inserts an export event for the template that was exported', async () => {
    const { result } = renderHook(() => useLogExport(), { wrapper })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toEqual({ template_id: 't1', event_type: 'export', user_id: CURRENT_USER_ID })
  })

  it('inserts an export event with no template for freeform work', async () => {
    const { result } = renderHook(() => useLogExport(), { wrapper })
    result.current.mutate(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toEqual({ template_id: null, event_type: 'export', user_id: CURRENT_USER_ID })
  })
})

describe('fetchTemplate', () => {
  it('returns one template by id, for callers (like the gallery download) that only need a single one on demand', async () => {
    expect(await fetchTemplate('t2')).toEqual({ id: 't2', name: 'Drake' })
  })

  it('returns undefined when that template no longer exists', async () => {
    expect(await fetchTemplate('gone')).toBeUndefined()
  })
})

describe('fetchTemplateFields', () => {
  it("returns a template's caption fields in order", async () => {
    expect(await fetchTemplateFields('tmpl-1')).toEqual(mockFields)
  })
})

describe('the popularity order stays put while the page is in use', () => {
  // Fetches of the by-usage list, counted through the mock's `.order()` calls (two per fetch).
  const fetches = () => lastTemplateOrders.length / 2
  const settle = (ms = 30) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  // One shared client, like the real app, so the click hook and the list hook see each other's cache.
  function sharedClient() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shared = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    return { queryClient, shared }
  }

  it('does not re-fetch (and so does not reorder) when a template is clicked', async () => {
    lastTemplateOrders = []
    const { shared } = sharedClient()
    const list = renderHook(() => useTemplatesByUsage(), { wrapper: shared })
    const log = renderHook(() => useLogTemplateUsage(), { wrapper: shared })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    expect(fetches()).toBe(1)

    log.result.current.mutate('t1')
    await waitFor(() => expect(log.result.current.isSuccess).toBe(true))
    await settle()

    expect(fetches()).toBe(1)
  })

  it('does not re-fetch when the window regains focus or the network reconnects', async () => {
    lastTemplateOrders = []
    const { shared } = sharedClient()
    const list = renderHook(() => useTemplatesByUsage(), { wrapper: shared })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))

    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
    })
    await settle()

    expect(fetches()).toBe(1)
  })

  it('fetches a fresh order each time the list comes back, e.g. returning to the main page', async () => {
    lastTemplateOrders = []
    const { shared } = sharedClient()
    const first = renderHook(() => useTemplatesByUsage(), { wrapper: shared })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount() // leaving the page
    await settle()

    const second = renderHook(() => useTemplatesByUsage(), { wrapper: shared })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))

    expect(fetches()).toBe(2)
  })
})
