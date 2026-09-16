import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateSidebar } from './TemplateSidebar'

const mockTemplates = [
  { id: 't1', name: 'Two Buttons', blank_image_url: 'https://example.com/two-buttons.jpg', image_width: 600, image_height: 908 },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500 },
]
// Two clicks on Drake, none on Two Buttons — Drake should render first.
const mockUsageEvents = [{ template_id: 't2' }, { template_id: 't2' }]

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: mockUsageEvents, error: null }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return { select: () => Promise.resolve({ data: mockTemplates, error: null }) }
    },
  },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('TemplateSidebar', () => {
  it('renders templates most-used first', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const names = (await screen.findAllByRole('button', { name: /Two Buttons|Drake/ })).map((el) => el.textContent)
    expect(names).toEqual(['Drake', 'Two Buttons'])
  })

  it('calls onSelectTemplate with the real template row when a row is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={onSelectTemplate} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Two Buttons' }))

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/two-buttons.jpg',
      imageWidth: 600,
      imageHeight: 908,
    })
  })

  it('opens the search modal when Search All Memes is clicked', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Search All Memes' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
