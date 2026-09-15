import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTemplates } from './templates'

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [{ id: '1', name: 'Drake' }], error: null }),
    }),
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
