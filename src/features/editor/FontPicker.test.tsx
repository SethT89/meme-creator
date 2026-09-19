import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FontPicker } from './FontPicker'

const anton = { fontId: 'anton' as const }
const legacy = { fontId: null }

describe('FontPicker', () => {
  it('shows a constant "Aa" on the button whatever the font, so the toolbar never changes width', () => {
    const { unmount } = render(<FontPicker {...anton} open={false} onToggle={() => {}} onChange={() => {}} />)
    const antonButton = screen.getByRole('button', { name: 'Font: Anton' })
    expect(antonButton).toHaveTextContent('Aa')
    expect(antonButton).not.toHaveTextContent('Anton')
    // The label is not restyled in the current font either — that would make the width vary.
    expect(antonButton.style.fontFamily).toBe('')
    unmount()

    render(<FontPicker fontId="playfair-display" open={false} onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Font: Playfair Display' })).toHaveTextContent('Aa')
  })

  it('still names the current font for screen readers and on hover, and says "System" for a legacy layer', () => {
    render(<FontPicker {...legacy} open={false} onToggle={() => {}} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Font: System' })
    expect(button).toHaveTextContent('Aa')
    expect(button).toHaveAttribute('title', 'System')
  })

  it('keeps the list hidden until open, and calls onToggle on click', async () => {
    const onToggle = vi.fn()
    render(<FontPicker {...anton} open={false} onToggle={onToggle} onChange={() => {}} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('lists all eight fonts when open, each name set in its own typeface, current one checked', () => {
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={() => {}} />)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((el) => el.textContent)).toEqual([
      'Anton',
      'Bebas Neue',
      'Archivo Black',
      'Inter',
      'Permanent Marker',
      'Bangers',
      'Special Elite',
      'Playfair Display',
    ])
    expect(screen.getByRole('menuitemradio', { name: 'Bangers' }).style.fontFamily).toContain('Bangers')
    expect(screen.getByRole('menuitemradio', { name: 'Anton' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Bangers' })).toHaveAttribute('aria-checked', 'false')
  })

  it('draws a checkmark beside the current font only', () => {
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('menuitemradio', { name: 'Anton' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'Bangers' }).querySelector('svg')).toBeNull()
    expect(screen.getAllByRole('menuitemradio').filter((el) => el.querySelector('svg'))).toHaveLength(1)
  })

  it('checks nothing for a legacy layer', () => {
    render(<FontPicker {...legacy} open onToggle={() => {}} onChange={() => {}} />)
    for (const item of screen.getAllByRole('menuitemradio')) {
      expect(item).toHaveAttribute('aria-checked', 'false')
      expect(item.querySelector('svg')).toBeNull()
    }
  })

  it('calls onChange with the font id', async () => {
    const onChange = vi.fn()
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bebas Neue' }))
    expect(onChange).toHaveBeenCalledWith('bebas-neue')
  })
})
