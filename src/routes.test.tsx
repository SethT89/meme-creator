import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from './routes'

vi.mock('./lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
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
  it('renders the editor empty state at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Start a New Meme' })).toBeInTheDocument()
  })

  it('renders the gallery page at /gallery', () => {
    renderAt('/gallery')
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('the header toggle actually navigates between New Meme and My Saved Memes', async () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Start a New Meme' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'My Saved Memes' }))
    expect(await screen.findByRole('heading', { name: 'My Creations' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New Meme' }))
    expect(await screen.findByRole('heading', { name: 'Start a New Meme' })).toBeInTheDocument()
  })
})
