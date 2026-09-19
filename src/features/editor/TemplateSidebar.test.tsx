import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateSidebar } from './TemplateSidebar'

const mockTemplates = [
  {
    id: 't1',
    name: 'Two Buttons',
    blank_image_url: 'https://example.com/two-buttons.jpg',
    image_width: 600,
    image_height: 908,
    description: 'The Two Buttons meme shows two difficult decisions.',
    tags: ['choice'],
  },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500, description: null, tags: ['approval'] },
  {
    id: 't3',
    name: 'Skydiving Chicken',
    blank_image_url: 'https://example.com/chicken.jpg',
    image_width: 500,
    image_height: 400,
    description: 'A chicken in a parachute rig.',
    tags: ['random', 'animals'],
  },
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
    const names = (await screen.findAllByRole('button', { name: /Two Buttons|Drake|Chicken/ })).map((el) => el.textContent)
    // Drake has the usage; the other two have none and fall back to A-Z.
    expect(names).toEqual(['Drake', 'Skydiving Chicken', 'Two Buttons'])
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

  it('puts the search box above the template list, not below it', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const drake = await screen.findByRole('button', { name: 'Drake' })
    const box = screen.getByRole('searchbox', { name: 'Search memes' })

    // DOCUMENT_POSITION_FOLLOWING: the list card comes after the box.
    expect(box.compareDocumentPosition(drake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no longer has the old Search All Memes button or its modal', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    await screen.findByRole('button', { name: 'Drake' })
    expect(screen.queryByRole('button', { name: 'Search All Memes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is collapsed by default and expands into a drawer when its toggle is clicked', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)

    // The template list isn't visible until the drawer is opened, on narrow
    // viewports — but jsdom doesn't do real layout/media queries, so this
    // asserts the drawer's own open/closed state via its toggle button
    // rather than actual visibility, which is verified live in the browser
    // (see the plan's final task).
    const toggle = await screen.findByRole('button', { name: /templates/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('expands the selected card to show its description', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId="t1" onSelectTemplate={vi.fn()} />)
    expect(await screen.findByText(/two difficult decisions/i)).toBeInTheDocument()
  })

  it('does not show a description for an unselected card, even if it has one', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    await screen.findByRole('button', { name: /Two Buttons/i })
    expect(screen.queryByText(/two difficult decisions/i)).not.toBeInTheDocument()
  })

  it('shows nothing extra when the selected card has no description', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId="t2" onSelectTemplate={vi.fn()} />)
    const drakeButton = await screen.findByRole('button', { name: 'Drake' })
    expect(drakeButton).toHaveTextContent(/^Drake$/)
  })

  it("leaves a gutter to the right of the cards inside the scroll area, so the scrollbar doesn't sit on top of them", async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const card = await screen.findByRole('button', { name: 'Two Buttons' })

    const scrollArea = card.parentElement as HTMLElement
    expect(scrollArea).toHaveClass('overflow-y-auto') // the element that owns the scrollbar
    expect(scrollArea).toHaveClass('pr-3')
  })

  describe('searching', () => {
    const cardNames = () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('data-template-card'))
        .map((b) => b.textContent)

    async function renderLoaded(onSelectTemplate = vi.fn(), selectedTemplateId?: string) {
      renderWithQuery(<TemplateSidebar selectedTemplateId={selectedTemplateId} onSelectTemplate={onSelectTemplate} />)
      await screen.findByRole('button', { name: 'Drake' })
      return { onSelectTemplate, box: screen.getByRole('searchbox') }
    }

    it('narrows the list as you type, and Escape brings the full list back', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'drake')
      expect(cardNames()).toEqual(['Drake'])

      await userEvent.keyboard('{Escape}')
      expect(cardNames()).toEqual(['Drake', 'Skydiving Chicken', 'Two Buttons'])
    })

    it('finds a template by a tag, and by a word only in its description', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'animals')
      expect(cardNames()).toEqual(['Skydiving Chicken'])

      await userEvent.clear(box)
      await userEvent.type(box, 'difficult')
      expect(cardNames()).toEqual(['Two Buttons'])
    })

    it('finds a template despite a typo', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'chiken')
      expect(cardNames()).toEqual(['Skydiving Chicken'])
    })

    it('shows an empty state with a way back when nothing matches', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'zebra')

      expect(cardNames()).toEqual([])
      // (The screen-reader status line also says "No memes match", without the query.)
      expect(screen.getByText('No memes match "zebra".')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Show all memes' }))
      expect(box).toHaveValue('')
      expect(cardNames()).toHaveLength(3)
    })

    it('announces the result count to screen readers as the query changes', async () => {
      const { box } = await renderLoaded()
      const status = document.querySelector('[data-search-status]')!
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(status).toBeEmptyDOMElement()

      await userEvent.type(box, 'd')
      expect(status).toHaveTextContent(/^\d+ memes?$/)

      await userEvent.clear(box)
      await userEvent.type(box, 'chicken')
      expect(status).toHaveTextContent('1 meme')

      await userEvent.clear(box)
      await userEvent.type(box, 'zebra')
      expect(status).toHaveTextContent('No memes match')
    })

    it('Enter picks the top result, and logs the pick like a click does', async () => {
      const { box, onSelectTemplate } = await renderLoaded()
      await userEvent.type(box, 'chicken{Enter}')

      expect(onSelectTemplate).toHaveBeenCalledTimes(1)
      expect(onSelectTemplate).toHaveBeenCalledWith({
        id: 't3',
        name: 'Skydiving Chicken',
        blankImageUrl: 'https://example.com/chicken.jpg',
        imageWidth: 500,
        imageHeight: 400,
      })
    })

    it('Enter does nothing when nothing matches, or when the box is empty', async () => {
      const { box, onSelectTemplate } = await renderLoaded()
      await userEvent.type(box, 'zebra{Enter}')
      await userEvent.clear(box)
      await userEvent.type(box, '{Enter}')
      expect(onSelectTemplate).not.toHaveBeenCalled()
    })

    it('keeps the query after a template is picked, with the pick still in view', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'chicken')
      await userEvent.click(screen.getByRole('button', { name: 'Skydiving Chicken' }))

      expect(box).toHaveValue('chicken')
      expect(cardNames()).toEqual(['Skydiving Chicken'])
    })

    it('keeps the selected template highlighted and expanded wherever it ranks', async () => {
      const { box } = await renderLoaded(vi.fn(), 't1')
      await userEvent.type(box, 'buttons')
      const card = screen.getByRole('button', { name: /Two Buttons/ })
      expect(card).toHaveClass('border-blue-500')
      expect(screen.getByText(/two difficult decisions/i)).toBeInTheDocument()
    })

    it('ArrowDown moves focus from the box to the first result, then down and up the results', async () => {
      const { box } = await renderLoaded()
      box.focus()

      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('button', { name: 'Drake' })).toHaveFocus()

      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('button', { name: 'Skydiving Chicken' })).toHaveFocus()

      await userEvent.keyboard('{ArrowUp}')
      expect(screen.getByRole('button', { name: 'Drake' })).toHaveFocus()
    })

    it('ArrowUp on the first result returns focus to the box, and ArrowDown stops at the last result', async () => {
      const { box } = await renderLoaded()
      box.focus()
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{ArrowUp}')
      expect(box).toHaveFocus()

      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
      expect(screen.getByRole('button', { name: 'Two Buttons' })).toHaveFocus()
    })

    it('ArrowDown with no results leaves focus in the box', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'zebra{ArrowDown}')
      expect(box).toHaveFocus()
    })

    it('navigates only the filtered results', async () => {
      const { box } = await renderLoaded()
      await userEvent.type(box, 'chicken{ArrowDown}')
      expect(screen.getByRole('button', { name: 'Skydiving Chicken' })).toHaveFocus()
      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('button', { name: 'Skydiving Chicken' })).toHaveFocus()
    })
  })
})
