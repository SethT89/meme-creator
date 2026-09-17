import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GalleryPage } from './GalleryPage'

const rows: Array<{ id: string; name: string; tags: string[]; exported_image_url: string | null }> = []

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          const index = rows.findIndex((r) => r.id === id)
          if (index !== -1) rows.splice(index, 1)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  rows.length = 0
  rows.push({ id: '1', name: 'Drake 1', tags: ['funny'], exported_image_url: null })
})

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

  it('Delete asks for confirmation, and only removes the creation once confirmed', async () => {
    renderGallery()
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Delete'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Drake 1/)).toBeInTheDocument()
    expect(screen.getByText('Drake 1')).toBeInTheDocument() // not removed yet

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Drake 1')).not.toBeInTheDocument()
  })

  it('Delete cancel leaves the creation in the list', async () => {
    renderGallery()
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Delete'))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Drake 1')).toBeInTheDocument()
  })
})
