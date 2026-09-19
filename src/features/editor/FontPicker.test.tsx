import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FontPicker } from './FontPicker'
import { SYSTEM_FONT_STACK } from '../../lib/fonts'

const anton = { fontId: 'anton' as const, fontFamily: `"Anton", ${SYSTEM_FONT_STACK}`, fontWeight: 400 }
const legacy = { fontId: null, fontFamily: SYSTEM_FONT_STACK, fontWeight: 700 }

describe('FontPicker', () => {
  it("shows the current typeface's name, set in that typeface", () => {
    render(<FontPicker {...anton} open={false} onToggle={() => {}} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Font: Anton' })
    expect(button).toHaveTextContent('Anton')
    expect(button.style.fontFamily).toContain('Anton')
  })

  it('shows "System" for a legacy layer with no chosen font', () => {
    render(<FontPicker {...legacy} open={false} onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
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

  it('checks nothing for a legacy layer', () => {
    render(<FontPicker {...legacy} open onToggle={() => {}} onChange={() => {}} />)
    for (const item of screen.getAllByRole('menuitemradio')) expect(item).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the font id', async () => {
    const onChange = vi.fn()
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bebas Neue' }))
    expect(onChange).toHaveBeenCalledWith('bebas-neue')
  })
})
