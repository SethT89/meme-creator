import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasFab } from './CanvasFab'

describe('CanvasFab', () => {
  it('renders closed by default: only the main toggle, no action buttons', () => {
    render(<CanvasFab />)
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
  })

  it('clicking the main FAB opens the menu with all 4 actions, in order Emoji, Sticker, Image, Text', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))

    expect(screen.getByRole('button', { name: 'Close add menu' })).toBeInTheDocument()
    const expectedOrder = [
      screen.getByRole('button', { name: 'Add Emoji' }),
      screen.getByRole('button', { name: 'Add Sticker' }),
      screen.getByRole('button', { name: 'Add Image' }),
      screen.getByRole('button', { name: 'Add Text' }),
    ]
    // DOM order matches the visual top-to-bottom stacking order (flex-col),
    // and the main toggle renders last (bottom of the stack).
    expect(screen.getAllByRole('button').slice(0, 4)).toEqual(expectedOrder)
  })

  it('clicking an action button does not close the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    expect(screen.getByRole('button', { name: 'Add Text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close add menu' })).toBeInTheDocument()
  })

  it('clicking the main FAB again closes the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close add menu' }))

    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
  })

  it('clicking anywhere outside the FAB closes the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    expect(screen.getByRole('button', { name: 'Add Text' })).toBeInTheDocument()

    // document.body is outside this component's own DOM subtree — same
    // pattern EditorPage's own outside-click deselect test uses.
    await userEvent.click(document.body)
    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
  })
})
