import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagChips } from './TagChips'

// jsdom has no layout engine, so every element measures 0 wide. Stub a fake
// one: each element is 100px wide as a row, and a chip is 8px per character
// plus 16px of padding — so a four-letter tag is 48px, and the "+N" chip
// (two characters here) is 32px.
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return (this.textContent?.length ?? 0) * 8 + 16
  })
}

afterEach(() => vi.restoreAllMocks())

describe('TagChips', () => {
  it('shows every tag as a chip, with no +N chip, when they all fit', () => {
    stubLayout()
    render(<TagChips tags={['aaaa', 'bbbb', 'cccc', 'dddd']} onShowAll={() => {}} />) // 2 per line = exactly 2 lines

    expect(screen.getAllByText(/^[a-d]{4}$/)).toHaveLength(4)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows as many chips as fit in two lines and a +N chip for the rest', () => {
    stubLayout()
    render(<TagChips tags={['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff']} onShowAll={() => {}} />)

    // Two lines hold 2 + (1 chip and the +N chip), so three tags show and three are hidden.
    expect(screen.getAllByText(/^[a-f]{4}$/).map((el) => el.textContent)).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(screen.getByRole('button', { name: 'Show all 6 tags' })).toHaveTextContent('+3')
  })

  it('clicking the +N chip calls onShowAll', async () => {
    stubLayout()
    const onShowAll = vi.fn()
    render(<TagChips tags={['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff']} onShowAll={onShowAll} />)

    await userEvent.click(screen.getByRole('button', { name: 'Show all 6 tags' }))

    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('shows all tags when there is no layout to measure (nothing is ever hidden by mistake)', () => {
    render(<TagChips tags={['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff']} onShowAll={() => {}} />)

    expect(screen.getAllByText(/^[a-f]{4}$/)).toHaveLength(6)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
