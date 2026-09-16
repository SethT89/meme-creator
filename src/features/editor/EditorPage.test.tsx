import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './EditorPage'

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
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Text' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Sticker' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
  })

  it('does not show the add-menu FAB until a template is loaded', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    expect(screen.queryByRole('button', { name: 'Open add menu' })).not.toBeInTheDocument()
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
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

    // Clicking the page heading — nowhere near the canvas — should still deselect.
    await userEvent.click(screen.getByRole('heading', { name: 'Editor' }))
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

  it('saves a new template creation with its real template_id, then shows the Save/Save As split', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByRole('button', { name: 'Save to Gallery' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Two Buttons 1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▾' })).toBeInTheDocument()
    expect(savedRows.at(-1)).toMatchObject({ name: 'Two Buttons 1', source_type: 'template', template_id: 'tmpl-1' })
  })

  it('loads an existing template creation at /editor/:id with its real fields and image', async () => {
    savedRows.push({ id: 'existing-1', name: 'Two Buttons 1', tags: ['funny'], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })

    renderEditor('/editor/existing-1')

    expect(await screen.findByRole('heading', { name: 'Two Buttons 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toHaveAttribute('src', 'https://example.com/blank.jpg')
    expect(await screen.findByText('Caption 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▾' })).toBeInTheDocument()
  })

  it('changing the size preset updates the selected box and persists it on save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByText(/size: 22px/i))
    await userEvent.click(screen.getByText('Large'))
    expect(screen.getByText(/size: large/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save to Gallery' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByRole('button', { name: 'Save' })
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

    await userEvent.click(screen.getByRole('button', { name: 'Save to Gallery' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByRole('button', { name: 'Save' })
    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; label: string }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.label).toBe('Caption 1X')
  })

  it('does not show a Clear Canvas button when the canvas is blank', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    expect(screen.queryByRole('button', { name: 'Clear Canvas' })).not.toBeInTheDocument()
  })

  it('Clear Canvas asks for confirmation, and only clears once confirmed', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument() // not cleared yet

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear Canvas' })).not.toBeInTheDocument()
  })

  it('Clear Canvas cancel leaves the canvas untouched', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear Canvas' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('picking a template while the canvas is blank loads it with no confirmation', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })
})
