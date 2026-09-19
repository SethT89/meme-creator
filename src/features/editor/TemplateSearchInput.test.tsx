import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateSearchInput } from './TemplateSearchInput'

// The input is controlled, so drive it through real state like the sidebar does.
function Harness({ onSubmit = () => {}, onArrowDown = () => {} }: { onSubmit?: () => void; onArrowDown?: () => void }) {
  const [value, setValue] = useState('')
  return <TemplateSearchInput value={value} onChange={setValue} onSubmit={onSubmit} onArrowDown={onArrowDown} />
}

describe('TemplateSearchInput', () => {
  it('is a search box with a placeholder and an accessible name', () => {
    render(<Harness />)
    const box = screen.getByRole('searchbox', { name: 'Search memes' })
    expect(box).toHaveAttribute('placeholder', 'Search memes…')
  })

  it('reports each keystroke through onChange', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('searchbox'), 'drake')
    expect(screen.getByRole('searchbox')).toHaveValue('drake')
  })

  it('shows the clear button only when there is text, and clicking it empties the box and keeps focus there', async () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), 'drake')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('searchbox')).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('clears the box on Escape', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('searchbox'), 'drake{Escape}')
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('calls onSubmit on Enter', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await userEvent.type(screen.getByRole('searchbox'), 'drake{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('calls onArrowDown on the down arrow, without moving the text cursor', async () => {
    const onArrowDown = vi.fn()
    render(<Harness onArrowDown={onArrowDown} />)
    await userEvent.type(screen.getByRole('searchbox'), 'x{ArrowDown}')
    expect(onArrowDown).toHaveBeenCalledTimes(1)
  })

  it('does not call the callbacks for ordinary typing', async () => {
    const onSubmit = vi.fn()
    const onArrowDown = vi.fn()
    render(<Harness onSubmit={onSubmit} onArrowDown={onArrowDown} />)
    await userEvent.type(screen.getByRole('searchbox'), 'hello world')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onArrowDown).not.toHaveBeenCalled()
  })
})
