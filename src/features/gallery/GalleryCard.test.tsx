import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GalleryCard } from './GalleryCard'

const PREVIEW = 'https://x/creation-previews/a.png'

function renderCard(overrides: Partial<Parameters<typeof GalleryCard>[0]['creation']> = {}) {
  const handlers = { onDownload: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn() }
  const utils = render(
    <GalleryCard creation={{ id: 'abc', name: 'Drake 1', tags: ['funny'], preview_image_url: PREVIEW, ...overrides }} {...handlers} />,
  )
  return { ...handlers, ...utils }
}

const dots = () => screen.getByRole('button', { name: 'More options for Drake 1' })

// jsdom has no layout engine: give every row 100px and every chip 8px per
// character + 16px, so six four-letter tags overflow two lines (see TagChips.test.tsx).
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return (this.textContent?.length ?? 0) * 8 + 16
  })
}

afterEach(() => vi.restoreAllMocks())

describe('GalleryCard', () => {
  it('shows the creation name and its saved preview image', () => {
    renderCard()
    expect(screen.getByText('Drake 1')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Drake 1' })).toHaveAttribute('src', PREVIEW)
  })

  it('clicking the card opens the creation in the editor, and does not open the menu', async () => {
    const { onOpen } = renderCard()

    await userEvent.click(screen.getByText('Drake 1'))

    expect(onOpen).toHaveBeenCalledWith('abc')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  describe('hover and pressed states', () => {
    it('grays the card on hover and darker still while pressed, the same pattern as the template tiles', () => {
      renderCard()
      const card = screen.getByTestId('gallery-card')
      expect(card).toHaveClass('hover:bg-muted')
      // Pressed only when the card's main button is pressed, not the 3-dots or a chip.
      expect(card.className).toMatch(/has-\[\[data-card-open\]:active\]:bg-border/)
    })

    it('has a 3-dots button that is hidden until the card is hovered or focused, and always shown on touch screens', () => {
      renderCard()
      expect(dots()).toHaveClass('opacity-0', 'group-hover/card:opacity-100', 'focus-visible:opacity-100')
      expect(dots().className).toMatch(/\[@media\(hover:none\)\]:opacity-100/)
    })
  })

  describe('3-dots menu', () => {
    it('is closed at first, and opens with Download, Open in editor and Delete', async () => {
      renderCard()
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()

      await userEvent.click(dots())

      const menu = screen.getByRole('menu')
      expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Download', 'Open in editor', 'Delete'])
    })

    it('does not also open the creation when the 3-dots button is clicked', async () => {
      const { onOpen } = renderCard()
      await userEvent.click(dots())
      expect(onOpen).not.toHaveBeenCalled()
    })

    it.each([
      ['Download', 'onDownload'],
      ['Open in editor', 'onOpen'],
      ['Delete', 'onDelete'],
    ] as const)('%s calls %s with the creation id and closes the menu', async (label, handler) => {
      const handlers = renderCard()
      await userEvent.click(dots())

      await userEvent.click(screen.getByRole('menuitem', { name: label }))

      expect(handlers[handler]).toHaveBeenCalledWith('abc')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('offers Download even for a save with no stored preview, since it is rebuilt from the saved data', async () => {
      renderCard({ preview_image_url: null })
      await userEvent.click(dots())

      expect(screen.getByRole('menuitem', { name: 'Download' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Open in editor' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    })

    it('clicking the 3-dots button again closes it', async () => {
      renderCard()
      await userEvent.click(dots())
      await userEvent.click(dots())
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('clicking anywhere else closes it', async () => {
      renderCard()
      await userEvent.click(dots())

      await userEvent.click(document.body)

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('clicking inside the menu but not on an item leaves it open', async () => {
      renderCard()
      await userEvent.click(dots())

      await userEvent.click(screen.getByRole('menu'))

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('closes on Escape', async () => {
      renderCard()
      await userEvent.click(dots())

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  describe('tags', () => {
    it('shows each tag as its own chip, not one comma-separated line of text', () => {
      renderCard({ tags: ['animal', 'chicken'] })

      const animal = screen.getByText('animal')
      const chicken = screen.getByText('chicken')
      expect(animal).not.toBe(chicken)
      expect(animal).toHaveClass('rounded-full')
      expect(chicken).toHaveClass('rounded-full')
      expect(screen.queryByText('animal, chicken')).not.toBeInTheDocument()
    })

    it("keeps chips a fixed color that doesn't change when the card is hovered or pressed", () => {
      renderCard({ tags: ['animal'] })
      const chip = screen.getByText('animal')
      expect(chip).toHaveClass('bg-blue-100')
      expect(chip.className).not.toMatch(/group-(hover|active)/)
    })

    it('shows a plain "no tags" note, not a chip, when there are none', () => {
      renderCard({ tags: [] })
      expect(screen.getByText('no tags')).not.toHaveClass('rounded-full')
    })

    it("doesn't put a remove button on a card's chips (they're display-only there)", () => {
      renderCard({ tags: ['funny'] })
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    })

    it('reserves the same two-line tag space whether the card has no tags, one tag, or many, so every card is the same size', () => {
      const heights = [[], ['funny'], ['a', 'b', 'c']].map((tags) => {
        const { unmount } = renderCard({ tags })
        const region = screen.getByTestId('card-tags')
        const cls = region.className
        unmount()
        return cls
      })

      for (const cls of heights) expect(cls).toMatch(/\bh-11\b/)
      expect(new Set(heights).size).toBe(1)
    })

    it('keeps a long name to one line so it cannot make the card taller than the others', () => {
      renderCard({ name: 'A really extremely long meme name that would otherwise wrap onto several lines' })
      expect(screen.getByText(/A really extremely long/)).toHaveClass('truncate')
    })

    it('shows a +N chip when tags overflow two lines, and clicking it opens a modal with every tag', async () => {
      stubLayout()
      const { onOpen } = renderCard({ tags: ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff'] })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Show all 6 tags' }))

      const dialog = screen.getByRole('dialog')
      for (const tag of ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff']) {
        expect(within(dialog).getByText(tag)).toBeInTheDocument()
      }
      // The chip is its own control, not part of the card's open-in-editor button.
      expect(onOpen).not.toHaveBeenCalled()
    })

    it('closes the tags modal again', async () => {
      stubLayout()
      renderCard({ tags: ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff'] })
      await userEvent.click(screen.getByRole('button', { name: 'Show all 6 tags' }))

      await userEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
