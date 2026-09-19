import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'
import { resolveTextStyle } from '../../lib/layers'
import type { TextLayer } from '../../lib/layers'
import { SWATCH_ROWS } from '../../lib/palette'

const textLayer: TextLayer = { type: 'text', id: 't', label: '', x: 0, y: 0, width: 10, height: 10, fontSize: 36, heightAuto: true, fontFamily: 'anton' }
const textStyle = resolveTextStyle(textLayer)

// A text layer's bar: every text prop supplied, each overridable per test.
function renderTextBar(props: Partial<ComponentProps<typeof PropertyBar>> = {}) {
  const onChangeTextStyle = vi.fn()
  const onChangeFontSize = vi.fn()
  render(
    <PropertyBar
      fontSize={36}
      onChangeFontSize={onChangeFontSize}
      textStyle={textStyle}
      onChangeTextStyle={onChangeTextStyle}
      onDelete={() => {}}
      onReorder={() => {}}
      canMoveForward
      canMoveBackward
      {...props}
    />,
  )
  return { onChangeTextStyle, onChangeFontSize }
}

describe('PropertyBar', () => {
  it('shows the current size as a preset name when it matches one exactly', () => {
    renderTextBar()
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('shows the current size as a raw px label when it matches no preset', () => {
    renderTextBar({ fontSize: 22 })
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
  })

  it("clicking a preset calls onChangeFontSize with that preset's px value and closes the panel", async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    await userEvent.click(screen.getByText('Large'))

    expect(onChangeFontSize).toHaveBeenCalledWith(48)
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })

  it('typing a custom size and pressing Enter calls onChangeFontSize with the clamped value', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '9999{enter}')

    expect(onChangeFontSize).toHaveBeenCalledWith(300)
  })

  it('updates live as you type a custom size, before any blur or Enter', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '50')

    // No blur, no Enter — the on-canvas preview should already reflect it.
    expect(onChangeFontSize).toHaveBeenCalledWith(50)
  })

  it('does not fire on an empty (in-progress) custom size value', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)

    // Clearing the field to type a fresh number shouldn't flash the
    // on-canvas text down to the minimum size in the meantime.
    expect(onChangeFontSize).not.toHaveBeenCalled()
  })

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn()
    renderTextBar({ onDelete })

    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders without any text controls when it is an image layer (no text props), but still shows Delete', () => {
    render(<PropertyBar onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.queryByRole('button', { name: /^font/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text color' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text alignment' })).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Delete still works when text controls are hidden', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar onDelete={onDelete} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalled()
  })

  it('shows font, color and alignment controls alongside size for a text layer', () => {
    renderTextBar()
    expect(screen.getByRole('button', { name: 'Font: Anton' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text color' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text alignment' })).toBeInTheDocument()
  })

  it('shows no Crop button when onCrop is not provided (a text layer)', () => {
    renderTextBar()
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

  describe('font, color and alignment', () => {
    it('shows a constant "Aa" for the font button, naming the font only to assistive tech, and "System" for a legacy layer', () => {
      const { unmount } = render(
        <PropertyBar fontSize={36} onChangeFontSize={() => {}} textStyle={textStyle} onChangeTextStyle={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />,
      )
      expect(screen.getByRole('button', { name: 'Font: Anton' })).toHaveTextContent('Aa')
      unmount()

      const legacyStyle = resolveTextStyle({ ...textLayer, fontFamily: undefined })
      renderTextBar({ textStyle: legacyStyle })
      expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
    })

    it('choosing a font sends it as a style patch and closes the list', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bebas Neue' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ fontFamily: 'bebas-neue' })
      expect(screen.queryByRole('menu', { name: 'Fonts' })).not.toBeInTheDocument()
    })

    it('choosing an alignment sends it as a style patch and closes the menu', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align right' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ textAlign: 'right' })
      expect(screen.queryByRole('menu', { name: 'Text alignment options' })).not.toBeInTheDocument()
    })

    it('picking a fill color sends it as a style patch and leaves the popover open', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      await userEvent.click(screen.getByRole('button', { name: 'Red' }))

      const red = SWATCH_ROWS.flat().find((s) => s.name === 'Red')!.hex
      expect(onChangeTextStyle).toHaveBeenCalledWith({ color: red })
      expect(screen.getByRole('dialog', { name: 'Text color' })).toBeInTheDocument()
    })

    it('turning the outline off sends strokeColor: null', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
      await userEvent.click(screen.getByRole('button', { name: 'None' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ strokeColor: null })
    })

    it('only ever has one menu open: opening another closes the current one', async () => {
      renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
      expect(screen.getByRole('menu', { name: 'Fonts' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      expect(screen.queryByRole('menu', { name: 'Fonts' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Text color' })).toBeInTheDocument()

      await userEvent.click(screen.getByText(/size: medium/i))
      expect(screen.queryByRole('dialog', { name: 'Text color' })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/custom font size/i)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))
      expect(screen.queryByLabelText(/custom font size/i)).not.toBeInTheDocument()
      expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    })

    it("clicking an open menu's own button closes it", async () => {
      renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      expect(screen.getByRole('menu', { name: 'Text alignment options' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      expect(screen.queryByRole('menu', { name: 'Text alignment options' })).not.toBeInTheDocument()
    })
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

    it("shows Layering on an image layer's toolbar too", () => {
      render(<PropertyBar onCrop={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
      expect(screen.getByRole('button', { name: 'Layering' })).toBeInTheDocument()
    })
  })
})
