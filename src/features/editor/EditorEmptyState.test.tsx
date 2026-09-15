import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorEmptyState } from './EditorEmptyState'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () =>
        Promise.resolve({
          data: [
            {
              id: 'tmpl-1',
              name: 'Two Buttons',
              blank_image_url: 'https://example.com/blank.jpg',
              image_width: 600,
              image_height: 908,
            },
          ],
          error: null,
        }),
    }),
  },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EditorEmptyState', () => {
  it('calls onUpload when the dropzone is clicked', async () => {
    const onUpload = vi.fn()
    renderWithQuery(<EditorEmptyState onUpload={onUpload} onSelectTemplate={vi.fn()} />)
    await userEvent.click(screen.getByText(/drag an image here/i))
    expect(onUpload).toHaveBeenCalled()
  })

  it('calls onSelectTemplate with the real template row when a tile is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<EditorEmptyState onUpload={vi.fn()} onSelectTemplate={onSelectTemplate} />)

    const tile = await screen.findByText('Two Buttons')
    await userEvent.click(tile)

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 'tmpl-1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/blank.jpg',
      imageWidth: 600,
      imageHeight: 908,
    })
  })
})
