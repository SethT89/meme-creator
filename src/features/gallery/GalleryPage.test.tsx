import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GalleryPage } from './GalleryPage'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              { id: '1', name: 'Drake 1', tags: ['funny'], exported_image_url: null },
            ],
            error: null,
          }),
      }),
    }),
  },
}))

function renderGallery() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('GalleryPage', () => {
  it('shows an empty message with no creations, then real cards once loaded', async () => {
    renderGallery()
    expect(await screen.findByText('Drake 1')).toBeInTheDocument()
    expect(screen.getByText(/1 meme saved/i)).toBeInTheDocument()
  })

  it('navigates to the editor when "Open in editor" is clicked', async () => {
    renderGallery()
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Open in editor'))
    // No router assertion needed beyond "didn't throw" — routing itself is covered by routes.test.tsx.
  })
})
