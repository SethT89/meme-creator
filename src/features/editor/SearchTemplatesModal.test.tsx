import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchTemplatesModal } from './SearchTemplatesModal'

const mockTemplates = [
  { id: 't1', name: 'Two Buttons', blank_image_url: 'https://example.com/two-buttons.jpg', image_width: 600, image_height: 908 },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500 },
]

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: mockTemplates, error: null }) }) },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('SearchTemplatesModal', () => {
  it('renders nothing when closed', () => {
    renderWithQuery(<SearchTemplatesModal open={false} onClose={vi.fn()} onSelectTemplate={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows all templates by default, filters by search text', async () => {
    renderWithQuery(<SearchTemplatesModal open onClose={vi.fn()} onSelectTemplate={vi.fn()} />)

    expect(await screen.findByText('Two Buttons')).toBeInTheDocument()
    expect(screen.getByText('Drake')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'drake')

    expect(screen.queryByText('Two Buttons')).not.toBeInTheDocument()
    expect(screen.getByText('Drake')).toBeInTheDocument()
  })

  it('calls onSelectTemplate with the real template row when a tile is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<SearchTemplatesModal open onClose={vi.fn()} onSelectTemplate={onSelectTemplate} />)

    await userEvent.click(await screen.findByText('Two Buttons'))

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/two-buttons.jpg',
      imageWidth: 600,
      imageHeight: 908,
    })
  })

  it('calls onClose when the backdrop close button is clicked', async () => {
    const onClose = vi.fn()
    renderWithQuery(<SearchTemplatesModal open onClose={onClose} onSelectTemplate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
