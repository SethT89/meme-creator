import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'

describe('PropertyBar', () => {
  it('shows the current size as a preset name when it matches one exactly', () => {
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('shows the current size as a raw px label when it matches no preset', () => {
    render(<PropertyBar fontSize={22} onChangeFontSize={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
  })

  it("clicking a preset calls onChangeFontSize with that preset's px value and closes the panel", async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText(/size: medium/i))
    await userEvent.click(screen.getByText('Large'))

    expect(onChangeFontSize).toHaveBeenCalledWith(48)
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })

  it('typing a custom size and pressing Enter calls onChangeFontSize with the clamped value', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '9999{enter}')

    expect(onChangeFontSize).toHaveBeenCalledWith(300)
  })

  it('updates live as you type a custom size, before any blur or Enter', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '50')

    // No blur, no Enter — the on-canvas preview should already reflect it.
    expect(onChangeFontSize).toHaveBeenCalledWith(50)
  })

  it('does not fire on an empty (in-progress) custom size value', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)

    // Clearing the field to type a fresh number shouldn't flash the
    // on-canvas text down to the minimum size in the meantime.
    expect(onChangeFontSize).not.toHaveBeenCalled()
  })

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={onDelete} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders without Font/Size/Color controls when fontSize is not provided (an image layer), but still shows Delete', () => {
    render(<PropertyBar onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.queryByText('Font')).not.toBeInTheDocument()
    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Color')).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Delete still works when font controls are hidden', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar onDelete={onDelete} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalled()
  })

  it('shows Color alongside Font/Size for a text layer', () => {
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.getByText('Color')).toBeInTheDocument()
  })

  it('shows no Crop button when onCrop is not provided (a text layer)', () => {
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.queryByText('Crop')).not.toBeInTheDocument()
  })

  it('shows a Crop button when onCrop is provided (an image layer), and clicking it calls onCrop', async () => {
    const onCrop = vi.fn()
    render(<PropertyBar onCrop={onCrop} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    const cropButton = screen.getByText('Crop')
    expect(cropButton).toBeInTheDocument()
    await userEvent.click(cropButton)

    expect(onCrop).toHaveBeenCalled()
  })

  describe('Layering', () => {
    function renderBar(props: { canMoveForward?: boolean; canMoveBackward?: boolean } = {}) {
      const onReorder = vi.fn()
      render(<PropertyBar onDelete={() => {}} onReorder={onReorder} canMoveForward={props.canMoveForward ?? true} canMoveBackward={props.canMoveBackward ?? true} />)
      return onReorder
    }

    it('shows a Layering button, with its options hidden until clicked', async () => {
      renderBar()
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getAllByRole('menuitem').map((el) => el.textContent?.replace(/[⌘⇧[\]]/g, ''))).toEqual([
        'Bring to front',
        'Bring forward',
        'Send backward',
        'Send to back',
      ])
    })

    it.each([
      ['Bring to front', 'front'],
      ['Bring forward', 'forward'],
      ['Send backward', 'backward'],
      ['Send to back', 'back'],
    ])('clicking %s calls onReorder(%s) and closes the menu', async (name, action) => {
      const onReorder = renderBar()
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(name, 'i') }))

      expect(onReorder).toHaveBeenCalledWith(action)
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    })

    it('disables the forward/front options when the layer is already on top', async () => {
      const onReorder = renderBar({ canMoveForward: false })
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getByRole('menuitem', { name: /bring to front/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /bring forward/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /send backward/i })).toBeEnabled()
      expect(screen.getByRole('menuitem', { name: /send to back/i })).toBeEnabled()

      await userEvent.click(screen.getByRole('menuitem', { name: /bring forward/i }))
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('disables the backward/back options when the layer is already at the bottom', async () => {
      renderBar({ canMoveBackward: false })
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getByRole('menuitem', { name: /send backward/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /send to back/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /bring forward/i })).toBeEnabled()
    })

    it('shows Layering on an image layer\'s toolbar too', () => {
      render(<PropertyBar onCrop={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
      expect(screen.getByRole('button', { name: 'Layering' })).toBeInTheDocument()
    })
  })
})
