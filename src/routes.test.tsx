import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from './routes'

vi.mock('./lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('routes', () => {
  it('renders the gallery page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('renders the editor page at /editor/:creationId', () => {
    renderAt('/editor/abc123')
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument()
  })
})
