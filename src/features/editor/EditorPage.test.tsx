import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  it('shows the empty state first, then the real template image and its fields after picking it', async () => {
    renderEditor()
    expect(screen.getByRole('heading', { name: 'Start a New Meme' })).toBeInTheDocument()

    await userEvent.click(await screen.findByText('Two Buttons'))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toHaveAttribute('src', 'https://example.com/blank.jpg')
    expect(screen.getByText('Caption 1')).toBeInTheDocument()
    expect(screen.getByText('Caption 2')).toBeInTheDocument()
    expect(screen.getByText('Caption 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Text' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
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
})
