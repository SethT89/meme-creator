import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorPicker } from './ColorPicker'
import { SWATCH_ROWS } from '../../lib/palette'

const hexOf = (name: string) => SWATCH_ROWS.flat().find((s) => s.name === name)!.hex

function renderPicker(props: Partial<ComponentProps<typeof ColorPicker>> = {}) {
  const onChange = vi.fn()
  render(<ColorPicker color="#ffffff" strokeColor="#000000" open onToggle={() => {}} onChange={onChange} {...props} />)
  return { onChange }
}

describe('ColorPicker', () => {
  it('shows a swatch of the current fill color on its button, and keeps the popover hidden until open', () => {
    render(<ColorPicker color="#ff0000" strokeColor="#000000" open={false} onToggle={() => {}} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Text color' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.querySelector('span')?.style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', async () => {
    const onToggle = vi.fn()
    render(<ColorPicker color="#ffffff" strokeColor="#000000" open={false} onToggle={onToggle} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('opens on the Fill tab, with the current fill swatch marked selected', () => {
    renderPicker({ color: '#ffffff' })
    expect(screen.getByRole('tab', { name: 'Fill' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders every swatch in both rows', () => {
    renderPicker()
    for (const swatch of SWATCH_ROWS.flat()) expect(screen.getByRole('button', { name: swatch.name })).toBeInTheDocument()
  })

  it('picking a swatch on the Fill tab changes the fill color', async () => {
    const { onChange } = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(onChange).toHaveBeenCalledWith({ color: hexOf('Red') })
  })

  it('the Outline tab marks the current outline swatch and picking one changes the outline color', async () => {
    const { onChange } = renderPicker({ strokeColor: '#000000' })
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Blue' }))
    expect(onChange).toHaveBeenCalledWith({ strokeColor: hexOf('Blue') })
  })

  it('has a None option only on the Outline tab, which turns the outline off', async () => {
    const { onChange } = renderPicker()
    expect(screen.queryByRole('button', { name: 'None' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith({ strokeColor: null })
  })

  it('shows None as pressed and no swatch selected when the outline is off', async () => {
    renderPicker({ strokeColor: null })
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true')
    for (const swatch of SWATCH_ROWS.flat()) {
      expect(screen.getByRole('button', { name: swatch.name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it("routes the custom color wheel to the active tab's property", async () => {
    const { onChange } = renderPicker()
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } })
    expect(onChange).toHaveBeenLastCalledWith({ color: '#123456' })

    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#654321' } })
    expect(onChange).toHaveBeenLastCalledWith({ strokeColor: '#654321' })
  })

  it('leaves the popover open after picking a color, so fill and outline can be set in a row', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
