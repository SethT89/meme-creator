import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlignPicker } from './AlignPicker'

describe('AlignPicker', () => {
  it('renders a button and keeps its options hidden until open', () => {
    render(<AlignPicker value="center" open={false} onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Text alignment' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', async () => {
    const onToggle = vi.fn()
    render(<AlignPicker value="center" open={false} onToggle={onToggle} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('lists left/center/right when open, with the current one checked', () => {
    render(<AlignPicker value="right" open onToggle={() => {}} onChange={() => {}} />)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((el) => el.textContent)).toEqual(['Align left', 'Align center', 'Align right'])
    expect(screen.getByRole('menuitemradio', { name: 'Align right' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Align left' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the chosen alignment', async () => {
    const onChange = vi.fn()
    render(<AlignPicker value="center" open onToggle={() => {}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align left' }))
    expect(onChange).toHaveBeenCalledWith('left')
  })
})
