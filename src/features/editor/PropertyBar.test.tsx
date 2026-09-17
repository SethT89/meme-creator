import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'

describe('PropertyBar', () => {
  it('shows the current size as a preset name when it matches one exactly', () => {
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('shows the current size as a raw px label when it matches no preset', () => {
    render(<PropertyBar fontSize={22} onChangeFontSize={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
  })

  it("clicking a preset calls onChangeFontSize with that preset's px value and closes the panel", async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    await userEvent.click(screen.getByText('Large'))

    expect(onChangeFontSize).toHaveBeenCalledWith(48)
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })

  it('typing a custom size and pressing Enter calls onChangeFontSize with the clamped value', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '9999{enter}')

    expect(onChangeFontSize).toHaveBeenCalledWith(300)
  })

  it('updates live as you type a custom size, before any blur or Enter', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '50')

    // No blur, no Enter — the on-canvas preview should already reflect it.
    expect(onChangeFontSize).toHaveBeenCalledWith(50)
  })

  it('does not fire on an empty (in-progress) custom size value', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)

    // Clearing the field to type a fresh number shouldn't flash the
    // on-canvas text down to the minimum size in the meantime.
    expect(onChangeFontSize).not.toHaveBeenCalled()
  })

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={onDelete} />)

    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders without Font/Size controls when fontSize is not provided (an image layer), but still shows Delete', () => {
    render(<PropertyBar onDelete={() => {}} />)
    expect(screen.queryByText('Font')).not.toBeInTheDocument()
    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Delete still works when font controls are hidden', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar onDelete={onDelete} />)

    await userEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalled()
  })
})
