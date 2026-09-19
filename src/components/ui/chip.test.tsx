import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from './chip'

describe('Chip', () => {
  it('renders its label as a colored pill, so it reads the same on a white or a gray background', () => {
    render(<Chip label="funny" />)
    expect(screen.getByText('funny')).toHaveClass('rounded-full', 'bg-blue-100', 'text-blue-800')
  })

  it('has no remove button unless onRemove is given', () => {
    render(<Chip label="funny" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a labelled remove button that calls onRemove when onRemove is given', async () => {
    const onRemove = vi.fn()
    render(<Chip label="funny" onRemove={onRemove} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove funny' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('renders as a button when onClick is given, using ariaLabel as its accessible name', async () => {
    const onClick = vi.fn()
    render(<Chip label="+3" ariaLabel="Show all 5 tags" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Show all 5 tags' })
    expect(button).toHaveTextContent('+3')
    expect(button).toHaveClass('rounded-full')
    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('truncates a label that is too long for its row instead of overflowing it', () => {
    render(<Chip label="a-very-long-tag-name" />)
    expect(screen.getByText('a-very-long-tag-name')).toHaveClass('truncate', 'max-w-full')
  })

  describe('touch targets', () => {
    it("gives the tiny remove ✕ a much larger invisible hit area on a touch screen", () => {
      render(<Chip label="funny" onRemove={() => {}} />)
      expect(screen.getByRole('button', { name: 'Remove funny' })).toHaveClass('pointer-coarse:before:-inset-3')
    })

    it('does the same for a chip that is itself a button (e.g. a gallery card\'s "+3")', () => {
      render(<Chip label="+3" onClick={() => {}} />)
      expect(screen.getByRole('button', { name: '+3' })).toHaveClass('pointer-coarse:before:-inset-2')
    })
  })
})
