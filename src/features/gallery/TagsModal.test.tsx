import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagsModal } from './TagsModal'

describe('TagsModal', () => {
  it('shows every tag as a chip, titled with the creation name', () => {
    render(<TagsModal name="Drake 1" tags={['funny', 'animal', 'chicken']} onClose={() => {}} />)

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Drake 1/)
    expect(screen.getByText('funny')).toHaveClass('rounded-full')
    expect(screen.getByText('animal')).toHaveClass('rounded-full')
    expect(screen.getByText('chicken')).toHaveClass('rounded-full')
  })

  it('closes from the Close button', async () => {
    const onClose = vi.fn()
    render(<TagsModal name="Drake 1" tags={['funny']} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<TagsModal name="Drake 1" tags={['funny']} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the dimmed backdrop is clicked, but not when the panel itself is', async () => {
    const onClose = vi.fn()
    render(<TagsModal name="Drake 1" tags={['funny']} onClose={onClose} />)

    await userEvent.click(screen.getByText('funny'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks the page behind it while open, and releases it when closed', () => {
    const { unmount } = render(<TagsModal name="Drake 1" tags={['funny']} onClose={() => {}} />)
    expect(document.body.style.position).toBe('fixed')
    unmount()
    expect(document.body.style.position).toBe('')
  })
})
