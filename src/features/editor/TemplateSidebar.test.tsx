import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateSidebar } from './TemplateSidebar'

vi.mock('../../lib/prefetchImage', () => ({ prefetchImage: vi.fn() }))
import { prefetchImage } from '../../lib/prefetchImage'

const mockTemplates = [
  {
    id: 't1',
    name: 'Two Buttons',
    blank_image_url: 'https://example.com/two-buttons.jpg',
    image_width: 600,
    image_height: 908,
    description: 'The Two Buttons meme shows two difficult decisions.',
    tags: ['choice'],
    thumbnail_url: 'https://example.com/thumbs/two-buttons.jpg',
  },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500, description: null, tags: ['approval'], use_count_total: 2 },
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
// Drake has two clicks (use_count_total), the others none — Drake should render first.
// Stand-in for a Supabase `templates` query: applies the `.order(...)` calls it receives the
// way the database would, so the test proves the sidebar asks for the right sort.
function templatesQuery() {
  const orders: Array<[string, { ascending: boolean }]> = []
  const query = {
    order: (column: string, options: { ascending: boolean }) => {
      orders.push([column, options])
      return query
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = [...mockTemplates] as Array<Record<string, unknown>>
      rows.sort((a, b) => {
        for (const [column, { ascending }] of orders) {
          const av = (a[column] ?? 0) as number | string
          const bv = (b[column] ?? 0) as number | string
          const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number)
          if (cmp !== 0) return ascending ? cmp : -cmp
        }
        return 0
      })
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
    },
  }
  return query
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'template_usage_events') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      return { select: () => templatesQuery() }
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

  it('shows each card\'s small thumbnail, not the full-size image, so the list stays light', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const card = await screen.findByRole('button', { name: 'Two Buttons' })
    const image = card.querySelector('span')!.style.backgroundImage
    expect(image).toContain('https://example.com/thumbs/two-buttons.jpg')
    expect(image).not.toContain('https://example.com/two-buttons.jpg') // that's the full-size image
  })

  it('falls back to the full image for a template that has no thumbnail yet', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const card = await screen.findByRole('button', { name: 'Drake' })
    expect(card.querySelector('span')!.style.backgroundImage).toContain('https://example.com/drake.jpg')
  })

  it('still loads the full-size image on the canvas when a template is picked (only the list uses thumbnails)', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={onSelectTemplate} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Two Buttons' }))
    expect(onSelectTemplate).toHaveBeenCalledWith(expect.objectContaining({ blankImageUrl: 'https://example.com/two-buttons.jpg' }))
  })

  it('calls onSelectTemplate with the real template row when a row is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={onSelectTemplate} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Two Buttons' }))

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/two-buttons.jpg',
      // Handed along so the canvas can show it instantly while the full image loads.
      thumbnailUrl: 'https://example.com/thumbs/two-buttons.jpg',
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

  describe('mobile drawer', () => {
    const scrollTo = vi.fn()
    beforeEach(() => {
      scrollTo.mockReset()
      window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    })
    afterEach(() => {
      document.body.removeAttribute('style')
      Reflect.deleteProperty(window, 'matchMedia')
    })

    const openDrawer = async () => {
      renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
      await screen.findByRole('button', { name: 'Drake' })
      const toggle = screen.getByRole('button', { name: /^☰ Templates$/ })
      await userEvent.click(toggle)
      return toggle
    }

    it('locks the page behind the open drawer, so it cannot scroll under your finger', async () => {
      expect(document.body.style.position).toBe('')
      await openDrawer()
      expect(document.body.style.position).toBe('fixed')
    })

    it('unlocks the page when the drawer is closed with its toggle', async () => {
      const toggle = await openDrawer()
      await userEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(document.body.style.position).toBe('')
      expect(scrollTo).toHaveBeenCalled()
    })

    it('unlocks the page when the dark strip beside the panel is tapped', async () => {
      await openDrawer()
      const scrim = document.querySelector('.bg-black\\/50') as HTMLElement
      await userEvent.click(scrim)
      expect(document.body.style.position).toBe('')
    })

    it('unlocks the page when a template is picked (which also closes the drawer)', async () => {
      await openDrawer()
      const cards = screen.getAllByRole('button', { name: 'Two Buttons' })
      await userEvent.click(cards[0])
      expect(document.body.style.position).toBe('')
    })

    it('makes the panel wide, leaving only a slim strip of the dark scrim visible beside it', async () => {
      await openDrawer()
      const panel = document.querySelector('.fixed.inset-0.z-30 .bg-background') as HTMLElement
      expect(panel).toHaveClass('w-[calc(100vw-3rem)]')
      expect(panel).not.toHaveClass('w-64')
    })

    it('sits above the canvas\'s floating + button (z-10), so that button never paints over the open drawer', async () => {
      await openDrawer()
      const overlay = document.querySelector('.fixed.inset-0.sm\\:hidden') as HTMLElement
      // Any layer at or below the FAB's z-10 loses to it, since the FAB comes later in the page.
      expect(overlay).toHaveClass('z-30')
      expect(overlay).not.toHaveClass('z-10')
    })

    it('stops the scrim from scrolling the page underneath it', async () => {
      await openDrawer()
      expect(document.querySelector('.bg-black\\/50')).toHaveClass('touch-none')
    })

    it('closes itself, and unlocks the page, if the screen becomes wide enough for the desktop layout (e.g. rotating a phone)', async () => {
      let onChange: ((e: { matches: boolean }) => void) | undefined
      window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => (onChange = cb),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia
      const toggle = await openDrawer()
      expect(toggle).toHaveAttribute('aria-expanded', 'true')

      act(() => onChange?.({ matches: true }))

      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(document.body.style.position).toBe('')
    })

    it('stops listening for screen-size changes when the sidebar goes away', async () => {
      const removeEventListener = vi.fn()
      window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener })) as unknown as typeof window.matchMedia
      const { unmount } = renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
      unmount()
      expect(removeEventListener).toHaveBeenCalled()
    })
  })

  describe('preloading the full image', () => {
    beforeEach(() => vi.mocked(prefetchImage).mockClear())

    it('downloads nothing extra just by showing the list (that is the whole point of thumbnails)', async () => {
      renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
      await screen.findByRole('button', { name: 'Two Buttons' })
      expect(prefetchImage).not.toHaveBeenCalled()
    })

    it('starts loading a template\'s full image when the pointer moves onto its card', async () => {
      renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
      await userEvent.hover(await screen.findByRole('button', { name: 'Two Buttons' }))
      expect(prefetchImage).toHaveBeenCalledWith('https://example.com/two-buttons.jpg')
    })

    it('also does so on keyboard focus, and on the press itself (touch has no hover)', async () => {
      renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
      const drake = await screen.findByRole('button', { name: 'Drake' })

      drake.focus()
      expect(prefetchImage).toHaveBeenCalledWith('https://example.com/drake.jpg')

      vi.mocked(prefetchImage).mockClear()
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'Skydiving Chicken' }))
      expect(prefetchImage).toHaveBeenCalledWith('https://example.com/chicken.jpg')
    })
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
        thumbnailUrl: null, // this fixture has no thumbnail
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
