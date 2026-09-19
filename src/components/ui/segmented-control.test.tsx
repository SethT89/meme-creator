import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from './segmented-control'

const options = [
  { value: 'new', label: 'New Meme' },
  { value: 'saved', label: 'My Saved Memes' },
]

describe('SegmentedControl', () => {
  it('marks the option matching value as pressed, the other not', () => {
    render(<SegmentedControl options={options} value="new" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'New Meme' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'My Saved Memes' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked option\'s value', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="new" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'My Saved Memes' }))
    expect(onChange).toHaveBeenCalledWith('saved')
  })

  it('grows taller on a touch screen, to a fingertip-sized 44px target', () => {
    render(<SegmentedControl options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value="a" onChange={() => {}} />)
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('pointer-coarse:py-3')
  })
})
