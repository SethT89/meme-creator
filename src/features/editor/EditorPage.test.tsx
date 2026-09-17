import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './EditorPage'

vi.mock('../../lib/exportCanvas', () => ({
  renderCreationToBlob: vi.fn(),
}))
vi.mock('../../lib/exportDelivery', () => ({
  sanitizeFilename: (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '-'),
  canShareFile: vi.fn(),
  shareFile: vi.fn(),
  downloadBlob: vi.fn(),
}))
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { canShareFile, shareFile, downloadBlob } from '../../lib/exportDelivery'

const mockTemplate = {
  id: 'tmpl-1',
  name: 'Two Buttons',
  blank_image_url: 'https://example.com/blank.jpg',
  image_width: 600,
  image_height: 908,
}
const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22, order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', position_x: 310, position_y: 70, width: 220, height: 110, font_size: 22, order_index: 1 },
  { id: 'f3', template_id: 'tmpl-1', label: 'Caption 3', position_x: 60, position_y: 680, width: 480, height: 100, font_size: 28, order_index: 2 },
]

const savedRows: Array<{
  id: string
  name: string
  tags: string[]
  source_type: string
  template_id: string | null
  canvas_data?: unknown
}> = []
let nextId = 1

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'templates') {
        return { select: () => Promise.resolve({ data: [mockTemplate], error: null }) }
      }
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockFields, error: null }),
            }),
          }),
        }
      }
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      // creations
      return {
        select: () => ({
          order: () => Promise.resolve({ data: savedRows, error: null }),
          eq: (_col: string, id: string) => ({
            single: () => {
              const row = savedRows.find((r) => r.id === id)
              return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } })
            },
          }),
        }),
        insert: (values: { name: string; tags: string[]; source_type: string; template_id: string | null }) => ({
          select: () => ({
            single: () => {
              const row = { id: String(nextId++), ...values }
              savedRows.push(row)
              return Promise.resolve({ data: row, error: null })
            },
          }),
        }),
        update: (values: { name: string; tags: string[] }) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              single: () => {
                const row = savedRows.find((r) => r.id === id)!
                Object.assign(row, values)
                return Promise.resolve({ data: row, error: null })
              },
            }),
          }),
        }),
      }
    },
  },
}))

function renderEditor(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/editor/:creationId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EditorPage', () => {
  it('shows a blank canvas and the template sidebar first, then the real template image and its fields after picking it', async () => {
    renderEditor()
    expect(await screen.findByRole('button', { name: 'Two Buttons' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Two Buttons' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toHaveAttribute('src', 'https://example.com/blank.jpg')
    expect(screen.getByText('Caption 1')).toBeInTheDocument()
    expect(screen.getByText('Caption 2')).toBeInTheDocument()
    expect(screen.getByText('Caption 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '+ Text' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Sticker' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
  })

  it('shows the add-menu FAB on the blank canvas too, not just once a template is loaded', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    // Blank canvas — no template picked yet — is how a user starts from
    // scratch (upload/add) via the FAB, so it must be visible here too.
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
  })

  it('clicking Add Text in the FAB adds a new blank layer, selected and in edit mode with focus ready to type', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    // Menu closes — Add Text is a real action now, unlike the other 3.
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()

    // A new contentEditable box exists (the 3 template captions are not
    // editing), and it already has focus — cursor ready to type, no click
    // needed.
    const editableBoxes = document.querySelectorAll('[contenteditable="true"]')
    expect(editableBoxes).toHaveLength(1)
    expect(document.activeElement).toBe(editableBoxes[0])

    // It's selected too — the property bar shows for it, at the default
    // 36px ("Medium") starting size.
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('does nothing when Add Text is clicked on the blank canvas (no template loaded yet)', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load

    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0)
  })

  it('selecting one field shows the property bar for it; selecting another moves it; clicking the image hides it', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    await userEvent.click(screen.getByText('Caption 2'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument() // still showing, now for field 2

    await userEvent.click(screen.getByRole('img', { name: 'Two Buttons' }))
    expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()
  })

  it('deselects when clicking anywhere on the page, not just the image', async () => {
    const { container } = renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    // Clicking the page's own root wrapper — nowhere near the canvas, and
    // has no click handler of its own — should still deselect, via the
    // document-level listener.
    const pageRoot = container.firstChild as HTMLElement
    await userEvent.click(pageRoot)
    expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()
  })

  it('deselects on a click completely outside this page\'s own rendered content (e.g. the app header, or empty space in the floating panel)', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    // document.body is outside this component's own DOM subtree entirely —
    // regression test for the bug where the deselect handler only lived on
    // this page's own wrapper div, which doesn't span the full floating
    // panel (let alone the app header), so clicks outside its own content
    // bounds silently did nothing.
    await userEvent.click(document.body)
    expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()
  })

  it('does not deselect when clicking a control inside the property bar itself', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    await userEvent.click(screen.getByText(/size: 22px/i))
    expect(screen.getByText('Extra Large')).toBeInTheDocument() // the size preset panel opened
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument() // property bar itself is still showing
  })

  it('pressing Delete while a field is selected (not editing) deletes it', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    await userEvent.keyboard('{Delete}')

    expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
    expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument() // selection cleared too
    expect(screen.getByText('Caption 2')).toBeInTheDocument() // other fields untouched
  })

  it('pressing Backspace while a field is selected (not editing) also deletes it', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.keyboard('{Backspace}')

    expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
  })

  it('pressing Delete while actively editing a field does not delete it', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)

    await userEvent.keyboard('{Delete}')

    // Still there — entering edit mode selects all the existing text, so
    // Delete here is ordinary text editing (consuming that selection),
    // same as it would be in any text field. Checking the box still exists
    // rather than its exact text, since consuming the selection is expected
    // to clear it.
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
  })

  it('pressing Delete with nothing selected does nothing', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.keyboard('{Delete}')

    expect(screen.getByText('Caption 1')).toBeInTheDocument()
  })

  it('saves a new template creation with its real template_id, then the menu shows Save and Save As', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))

    const dialog = screen.getByRole('dialog')
    const savedName = (within(dialog).getByLabelText('Name') as HTMLInputElement).value
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save As' })).toBeInTheDocument()
    expect(savedRows.at(-1)).toMatchObject({ name: savedName, source_type: 'template', template_id: 'tmpl-1' })
  })

  it('loads an existing template creation at /editor/:id with its real fields and image', async () => {
    savedRows.push({ id: 'existing-1', name: 'Two Buttons 1', tags: ['funny'], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })

    renderEditor('/editor/existing-1')

    expect(await screen.findByRole('heading', { name: 'Two Buttons 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toHaveAttribute('src', 'https://example.com/blank.jpg')
    expect(await screen.findByText('Caption 3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save As' })).toBeInTheDocument()
  })

  it('changing the size preset updates the selected box and persists it on save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByText(/size: 22px/i))
    await userEvent.click(screen.getByText('Large'))
    expect(screen.getByText(/size: large/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; fontSize: number }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.fontSize).toBe(48)
  })

  it('deleting the selected box removes it from the canvas', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByText('Delete'))

    expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
    expect(screen.getByText('Caption 2')).toBeInTheDocument()
  })

  it("loads a saved creation's edited layers instead of the template defaults", async () => {
    savedRows.push({
      id: 'existing-2',
      name: 'Two Buttons 2',
      tags: [],
      source_type: 'template',
      template_id: 'tmpl-1',
      canvas_data: {
        layers: [{ id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 88 }],
      },
    })

    renderEditor('/editor/existing-2')

    await userEvent.click(await screen.findByText('Caption 1'))
    expect(screen.getByText(/size: huge/i)).toBeInTheDocument()
  })

  it('a freshly seeded box has no explicit height (heightAuto) so wrapped text is never clipped', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    expect(screen.getByText('Caption 1')).not.toHaveStyle({ height: expect.anything() })
  })

  it('a box loaded with heightAuto: false from a saved creation keeps its explicit height', async () => {
    savedRows.push({
      id: 'existing-3',
      name: 'Two Buttons 3',
      tags: [],
      source_type: 'template',
      template_id: 'tmpl-1',
      canvas_data: {
        layers: [{ id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: false }],
      },
    })

    renderEditor('/editor/existing-3')

    expect(await screen.findByText('Caption 1')).toHaveStyle({ height: '12.114537444933921%' })
  })

  it('shows 8 resize handles only for the selected box', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    const handleSelector = '.border-blue-500.bg-white'
    expect(document.querySelectorAll(handleSelector)).toHaveLength(0)

    await userEvent.click(screen.getByText('Caption 1'))
    expect(document.querySelectorAll(handleSelector)).toHaveLength(8)

    await userEvent.click(screen.getByRole('img', { name: 'Two Buttons' }))
    expect(document.querySelectorAll(handleSelector)).toHaveLength(0)
  })

  it('double-clicking a box enters edit mode (contentEditable)', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    const box = screen.getByText('Caption 1')
    expect(box).not.toHaveAttribute('contenteditable', 'true')

    await userEvent.dblClick(box)
    // Entering edit mode remounts the box (see the `key` comment in
    // EditorPage.tsx) so React never has to reconcile against DOM the
    // browser's native contentEditable typing mutated behind its back —
    // re-query rather than reuse the pre-edit `box` reference, which is
    // now a detached node.
    expect(screen.getByText('Caption 1')).toHaveAttribute('contenteditable', 'true')
  })

  it('dragging while editing text does not move the box', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))
    const editingBox = screen.getByText('Caption 1')

    const styleBefore = editingBox.getAttribute('style')
    fireEvent.pointerDown(editingBox, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(editingBox, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(editingBox)

    expect(editingBox.getAttribute('style')).toBe(styleBefore)
  })

  it('typing new text and pressing Enter commits it and exits edit mode', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))

    await userEvent.type(screen.getByText('Caption 1'), 'X')
    await userEvent.keyboard('{Enter}')

    const committed = screen.getByText(/Caption 1X/)
    expect(committed).toBeInTheDocument()
    expect(committed).not.toHaveAttribute('contenteditable', 'true')
  })

  it('typing new text and pressing Escape reverts it and exits edit mode', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))

    await userEvent.type(screen.getByText('Caption 1'), 'X')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByText('Caption 1')).toBeInTheDocument()
    expect(screen.queryByText(/Caption 1X/)).not.toBeInTheDocument()
  })

  it('edited text persists through save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))
    await userEvent.type(screen.getByText('Caption 1'), 'X')
    await userEvent.keyboard('{Enter}')

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; label: string }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.label).toBe('Caption 1X')
  })

  it('the more-options menu is disabled when the canvas is blank', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('Delete in the more-options menu asks for confirmation, and only clears the canvas once confirmed', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument() // not cleared yet

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('Delete in the more-options menu, cancel leaves the canvas untouched', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('picking a template while the canvas is blank loads it with no confirmation', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  describe('Export', () => {
    beforeEach(() => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['fake'], { type: 'image/png' }))
      vi.mocked(canShareFile).mockReset().mockReturnValue(false)
      vi.mocked(shareFile).mockReset().mockResolvedValue(undefined)
      vi.mocked(downloadBlob).mockReset()
    })

    it('downloads the rendered PNG and shows a toast when file-sharing is unsupported', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(renderCreationToBlob).toHaveBeenCalled()
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.png$/))
      expect(shareFile).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Downloaded')
    })

    it('shares via the Web Share API when file-sharing is supported, showing a toast on success', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(shareFile).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(/\.png$/))
      expect(downloadBlob).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Shared')
    })

    it('shows no toast when the user cancels the native share sheet', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      const abortError = new Error('cancelled')
      abortError.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(abortError)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await Promise.resolve() // let the rejected promise settle
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('shows an error toast when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('boom'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(await screen.findByRole('status')).toHaveTextContent('failed')
    })
  })
})
