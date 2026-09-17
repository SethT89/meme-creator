import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from './routes'

vi.mock('./lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'templates' || table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }
      }
      // creations
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }
    },
  },
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('routes', () => {
  it('renders the editor (blank canvas) at /', () => {
    renderAt('/')
    // No page heading on the editor (removed — redundant with the page
    // itself) — "Search All Memes" is unique to this route, unlike Gallery.
    expect(screen.getByRole('button', { name: 'Search All Memes' })).toBeInTheDocument()
  })

  it('renders the gallery page at /gallery', () => {
    renderAt('/gallery')
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('the header toggle actually navigates between New Meme and My Saved Memes', async () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: 'Search All Memes' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'My Saved Memes' }))
    expect(await screen.findByRole('heading', { name: 'My Creations' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New Meme' }))
    expect(await screen.findByRole('button', { name: 'Search All Memes' })).toBeInTheDocument()
  })
})
