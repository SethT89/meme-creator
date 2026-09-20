import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './EditorPage'
import { readDraft, writeDraft, DRAFT_TTL_MS } from '../../lib/editorDraft'

vi.mock('../../lib/exportCanvas', () => ({
  renderCreationToBlob: vi.fn(),
}))
vi.mock('../../lib/exportDelivery', () => ({
  sanitizeFilename: (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '-'),
  canShareFile: vi.fn(),
  isMobileOrTabletDevice: vi.fn(),
  shareFile: vi.fn(),
  downloadBlob: vi.fn(),
}))
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { canShareFile, isMobileOrTabletDevice, shareFile, downloadBlob } from '../../lib/exportDelivery'

const mockTemplate = {
  id: 'tmpl-1',
  name: 'Two Buttons',
  blank_image_url: 'https://example.com/blank.jpg',
  thumbnail_url: 'https://example.com/thumbs/blank.jpg',
  image_width: 600,
  image_height: 908,
}
// Like the "random image" templates in production: an image with no caption
// fields of its own, so every piece of text on it is text the user added.
const mockFieldlessTemplate = {
  id: 'tmpl-2',
  name: 'Plain Photo',
  blank_image_url: 'https://example.com/plain.jpg',
  image_width: 500,
  image_height: 400,
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
// Set by a test to make the next creations insert/update fail.
let saveError: { message: string } | null = null

// vi.hoisted so this vi.fn() exists before the hoisted vi.mock factory below
// runs — lets individual tests override its resolved value (e.g. simulate a
// failed upload) via vi.mocked(mockStorageUpload).mockResolvedValueOnce(...).
const { mockStorageUpload, usageInserts } = vi.hoisted(() => ({
  mockStorageUpload: vi.fn(
    (): Promise<{ data: { path: string } | null; error: { message: string } | null }> =>
      Promise.resolve({ data: { path: 'mock-path' }, error: null }),
  ),
  // Every row inserted into template_usage_events (template picks and exports alike).
  usageInserts: [] as Array<{ template_id: string | null; kind: string }>,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'templates') {
        // Awaitable AND chainable: `useTemplates` awaits `.select()`, `useTemplatesByUsage` adds `.order()`s.
        return {
          select: () => {
            const query = {
              order: () => query,
              then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve({ data: [mockTemplate, mockFieldlessTemplate], error: null }).then(resolve, reject),
            }
            return query
          },
        }
      }
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: (_col: string, templateId: string) => ({
              order: () => Promise.resolve({ data: templateId === mockTemplate.id ? mockFields : [], error: null }),
            }),
          }),
        }
      }
      if (table === 'template_usage_events') {
        return {
          insert: (values: { template_id: string | null; kind: string }) => {
            usageInserts.push(values)
            return Promise.resolve({ error: null })
          },
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
              if (saveError) return Promise.resolve({ data: null, error: saveError })
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
                if (saveError) return Promise.resolve({ data: null, error: saveError })
                const row = savedRows.find((r) => r.id === id)!
                Object.assign(row, values)
                return Promise.resolve({ data: row, error: null })
              },
            }),
          }),
        }),
      }
    },
    storage: {
      from: (bucket: string) => ({
        upload: mockStorageUpload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/${bucket}/${path}` } }),
      }),
    },
  },
}))

// jsdom doesn't decode images or implement createObjectURL — stub both so
// prepareImageForUpload (src/lib/imageUpload.ts) resolves with a fixed,
// known size instead of hanging forever.
class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 300
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

async function selectImageFile(filename = 'photo.png') {
  const file = new File(['fake-bytes'], filename, { type: 'image/png' })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, file)
}

beforeEach(() => {
  saveError = null
  vi.stubGlobal('Image', MockImage)
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
  mockStorageUpload.mockReset().mockResolvedValue({ data: { path: 'mock-path' }, error: null })
  // prepareImageForUpload also draws the picked file onto a canvas to
  // resize/re-encode it before upload — jsdom doesn't implement real canvas
  // rendering, so stub both the same way exportCanvas.test.ts already does.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(new Blob(['fake'], { type: 'image/jpeg' })))
})

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

  describe('reopening a saved template creation', () => {
    const textLayer = (id: string, label: string) => ({ type: 'text', id, label, x: 10, y: 20, width: 200, height: 50, fontSize: 30, heightAuto: true })

    it("shows the text the user added to a template that has no caption fields of its own", async () => {
      savedRows.push({
        id: 'plain-1',
        name: 'Plain Photo 1',
        tags: [],
        source_type: 'template',
        template_id: 'tmpl-2',
        canvas_data: { layers: [textLayer('t1', 'I like to go fast')] },
      })

      renderEditor('/editor/plain-1')

      expect(await screen.findByText('I like to go fast')).toBeInTheDocument()
    })

    it('shows every saved layer, in order, on a template that has no caption fields', async () => {
      savedRows.push({
        id: 'plain-2',
        name: 'Plain Photo 2',
        tags: [],
        source_type: 'template',
        template_id: 'tmpl-2',
        canvas_data: { layers: [textLayer('t1', 'First'), textLayer('t2', 'Second')] },
      })

      renderEditor('/editor/plain-2')

      await screen.findByText('First')
      expect(screen.getAllByText(/^(First|Second)$/).map((el) => el.textContent)).toEqual(['First', 'Second'])
    })

    it('does not wipe the saved text when it is re-saved without any edits', async () => {
      savedRows.push({
        id: 'plain-3',
        name: 'Plain Photo 3',
        tags: [],
        source_type: 'template',
        template_id: 'tmpl-2',
        canvas_data: { layers: [textLayer('t1', 'Keep me')] },
      })
      renderEditor('/editor/plain-3')
      await screen.findByText('Keep me')

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))

      await waitFor(() => {
        const saved = savedRows.find((r) => r.id === 'plain-3') as { canvas_data?: { layers?: { label: string }[] } }
        expect(saved.canvas_data?.layers?.map((l) => l.label)).toEqual(['Keep me'])
      })
    })

    it("keeps the captions deleted when a template's captions were all deleted before saving, instead of bringing the defaults back", async () => {
      savedRows.push({ id: 'two-1', name: 'Two Buttons 9', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: { layers: [] } })

      renderEditor('/editor/two-1')

      expect(await screen.findByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
      // Give the fields query time to resolve so this can't pass just by being early.
      await waitFor(() => expect(screen.getByRole('button', { name: 'More options' })).toBeEnabled())
      await new Promise((r) => setTimeout(r, 50))
      expect(screen.queryByText(/^Caption \d$/)).not.toBeInTheDocument()
    })

    it('still shows the default captions when a template creation has no layer data saved at all', async () => {
      savedRows.push({ id: 'two-2', name: 'Two Buttons 10', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })

      renderEditor('/editor/two-2')

      expect(await screen.findByText('Caption 1')).toBeInTheDocument()
    })
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

  it('changing the fill color updates the selected box on screen', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))

    expect(screen.getByText('Caption 1')).toHaveStyle({ color: '#e2553a' })
    // ...and only that box.
    expect(screen.getByText('Caption 2')).toHaveStyle({ color: '#ffffff' })
  })

  it('changing the font and alignment updates the selected box, and both persist on save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bangers' }))
    await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align left' }))

    const box = screen.getByText('Caption 1')
    expect(box.style.fontFamily).toContain('Bangers')
    expect(box).toHaveStyle({ textAlign: 'left' })

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; fontFamily?: string; textAlign?: string }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.fontFamily).toBe('bangers')
    expect(savedField1?.textAlign).toBe('left')
  })

  it('turning the outline off is remembered as strokeColor null in the saved layer', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    // The popover stays open after a pick (it has role="dialog" too), so close
    // it before looking for the Save dialog.
    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; strokeColor?: string | null }[] } }
    expect(saved.canvas_data?.layers?.find((l) => l.id === 'f1')?.strokeColor).toBeNull()
  })

  it('new text and template captions start in Anton, white with a black outline, centered', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    expect(screen.getByRole('button', { name: 'Font: Anton' })).toBeInTheDocument()
    expect(screen.getByText('Caption 1').style.fontFamily).toContain('Anton')
    expect(screen.getByText('Caption 1')).toHaveStyle({ color: '#ffffff', textAlign: 'center' })
  })

  it('a creation saved before text styling existed reopens looking exactly as it did (system font, white, centered)', async () => {
    savedRows.push({
      id: 'legacy-style-1',
      name: 'Old Meme',
      tags: [],
      source_type: 'template',
      template_id: 'tmpl-1',
      canvas_data: { layers: [{ type: 'text', id: 'f1', label: 'Old caption', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true }] },
    })

    renderEditor('/editor/legacy-style-1')
    const box = await screen.findByText('Old caption')

    expect(box.style.fontFamily).not.toContain('Anton')
    expect(box).toHaveStyle({ color: '#ffffff', textAlign: 'center', fontWeight: '700' })

    await userEvent.click(box)
    expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
  })

  it('deleting the selected box removes it from the canvas', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

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

  describe('draft: unsaved work survives leaving the editor', () => {
    const textLayer = (id: string, label: string, over: Record<string, unknown> = {}) => ({
      type: 'text' as const,
      id,
      label,
      x: 30,
      y: 50,
      width: 220,
      height: 110,
      fontSize: 22,
      heightAuto: true,
      fontFamily: 'anton' as const,
      ...over,
    })
    const defaults = [
      textLayer('f1', 'Caption 1'),
      textLayer('f2', 'Caption 2', { x: 310, y: 70 }),
      textLayer('f3', 'Caption 3', { x: 60, y: 680, width: 480, height: 100, fontSize: 28 }),
    ]
    const twoButtons = { type: 'template' as const, name: 'Two Buttons', templateId: 'tmpl-1', blankImageUrl: 'https://example.com/blank.jpg', thumbnailUrl: null }
    // A draft as the editor would have left it: caption 1 edited, the rest untouched.
    const seedDraft = (over: Partial<Parameters<typeof writeDraft>[0]> = {}, now?: number) =>
      writeDraft(
        {
          hasEdits: true,
          source: twoButtons,
          savedMeta: null,
          layers: [textLayer('f1', 'Restored caption'), defaults[1], defaults[2]],
          baseline: defaults,
          canvasEdited: false,
          ...over,
        },
        now,
      )
    const draftLabel = (id: string) => (readDraft()?.layers.find((l) => l.id === id) as { label?: string } | undefined)?.label

    describe('writing it', () => {
      it('keeps a picked template as soon as its captions are in, even with no edits (but says there is nothing to lose)', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await screen.findByText('Caption 1')

        await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 2000 })
        const draft = readDraft()!
        expect(draft.source).toMatchObject({ type: 'template', templateId: 'tmpl-1' })
        expect(draft.layers).toHaveLength(3) // never written before the captions were seeded
        expect(draft.hasEdits).toBe(false)
      })

      it('keeps edits, and marks the draft as having something worth protecting', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))

        await waitFor(() => expect(readDraft()?.hasEdits).toBe(true), { timeout: 2000 })
        expect(readDraft()!.layers.find((l) => l.id === 'f1')).toMatchObject({ fontSize: 48 })
      })

      it('does not write on every keystroke: it waits for a pause', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await screen.findByText('Caption 1')
        // nothing yet, immediately after the change...
        expect(readDraft()).toBeNull()
        // ...but it does arrive
        await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 2000 })
      })

      it('writes immediately when the page is being hidden or closed, so the last edit is not lost', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        expect(readDraft()).toBeNull() // still inside the pause

        fireEvent(window, new Event('pagehide'))

        expect(readDraft()!.layers.find((l) => l.id === 'f1')).toMatchObject({ fontSize: 48 })
      })

      it('writes immediately when leaving the editor screen (e.g. tapping My Saves), however fast', async () => {
        const { unmount } = renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))

        unmount()

        expect(readDraft()!.layers.find((l) => l.id === 'f1')).toMatchObject({ fontSize: 48 })
      })

      it('never writes anything for an empty editor, and does not wipe an existing draft just because nothing is loaded yet', async () => {
        seedDraft()
        savedRows.push({ id: 'c1', name: 'Two Buttons 1', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
        renderEditor('/editor/c1')
        // The editor is briefly empty (loading the saved meme) — the draft must survive that moment.
        expect(readDraft()).not.toBeNull()
      })
    })

    describe('restoring it', () => {
      it('brings back the template and the edits when the editor opens, with no message', async () => {
        seedDraft()
        renderEditor()

        expect(await screen.findByText('Restored caption')).toBeInTheDocument()
        expect(await screen.findByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
        expect(screen.getByText('Caption 2')).toBeInTheDocument() // the untouched ones too
        expect(screen.queryByText('Caption 1')).not.toBeInTheDocument() // not reset to defaults
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      it('is not overwritten by the template\'s own default captions arriving afterwards', async () => {
        seedDraft()
        renderEditor()
        await screen.findByText('Restored caption')
        // give the template's default captions (a separate async load) time to land
        await new Promise((r) => setTimeout(r, 200))
        expect(screen.getByText('Restored caption')).toBeInTheDocument()
        expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
      })

      it('ignores a draft older than 30 days, and starts blank', async () => {
        seedDraft({}, Date.now() - DRAFT_TTL_MS - 1000)
        renderEditor()
        await screen.findByRole('searchbox', { name: 'Search memes' })
        expect(screen.queryByText('Restored caption')).not.toBeInTheDocument()
        expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
      })

      it('restores unsaved edits to a saved meme, with its name, on the plain editor route', async () => {
        seedDraft({ savedMeta: { id: 'c1', name: 'My Saved Meme', tags: ['funny'] } })
        renderEditor()
        expect(await screen.findByText('Restored caption')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'My Saved Meme' })).toBeInTheDocument()
      })

      it("restores a saved meme's own draft over the saved version when that meme is opened", async () => {
        savedRows.push({ id: 'c1', name: 'Two Buttons 1', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
        seedDraft({ savedMeta: { id: 'c1', name: 'Two Buttons 1', tags: [] } })
        renderEditor('/editor/c1')

        expect(await screen.findByText('Restored caption')).toBeInTheDocument()
        expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
      })

      it("loads a saved meme normally when the draft belongs to a different one", async () => {
        savedRows.push({ id: 'c1', name: 'Two Buttons 1', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
        seedDraft({ savedMeta: { id: 'c2', name: 'Another Meme', tags: [] } })
        renderEditor('/editor/c1')

        expect(await screen.findByText('Caption 1')).toBeInTheDocument()
        expect(screen.queryByText('Restored caption')).not.toBeInTheDocument()
      })

      it("loads a saved meme normally when the draft is new work", async () => {
        savedRows.push({ id: 'c1', name: 'Two Buttons 1', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
        seedDraft()
        renderEditor('/editor/c1')

        expect(await screen.findByText('Caption 1')).toBeInTheDocument()
        expect(screen.queryByText('Restored caption')).not.toBeInTheDocument()
      })
    })

    describe('a restored draft still protects your work', () => {
      it('asks before another template replaces restored edits', async () => {
        seedDraft()
        renderEditor()
        await screen.findByText('Restored caption')

        await userEvent.click(screen.getByText('Plain Photo'))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Restored caption')).toBeInTheDocument() // nothing replaced yet
      })

      it('does not ask when the restored template was never edited (nothing to lose)', async () => {
        seedDraft({ hasEdits: false, layers: defaults })
        renderEditor()
        await screen.findByText('Caption 1')

        await userEvent.click(screen.getByText('Plain Photo'))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(await screen.findByRole('img', { name: 'Plain Photo' })).toBeInTheDocument()
      })

      it('still counts an adjusted canvas as work to protect, even with no layer edits', async () => {
        seedDraft({ hasEdits: true, layers: defaults, canvasEdited: true })
        renderEditor()
        await screen.findByText('Caption 1')

        await userEvent.click(screen.getByText('Plain Photo'))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      it('replaces the draft with the new template once the switch is confirmed', async () => {
        seedDraft()
        renderEditor()
        await screen.findByText('Restored caption')

        await userEvent.click(screen.getByText('Plain Photo'))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /switch|discard|continue|confirm|yes/i }))

        expect(await screen.findByRole('img', { name: 'Plain Photo' })).toBeInTheDocument()
        expect(screen.queryByText('Restored caption')).not.toBeInTheDocument()
        await waitFor(() => expect(readDraft()?.source).toMatchObject({ templateId: 'tmpl-2' }), { timeout: 2000 })
        expect(draftLabel('f1')).toBeUndefined()
      })
    })

    describe('clearing it', () => {
      it('Clear Canvas removes the draft, and it does not come back', async () => {
        seedDraft()
        renderEditor()
        await screen.findByText('Restored caption')

        await userEvent.click(screen.getByRole('button', { name: 'More options' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Canvas' }))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /clear|confirm|yes|discard/i }))

        expect(readDraft()).toBeNull()
        await new Promise((r) => setTimeout(r, 600)) // longer than the write pause
        expect(readDraft()).toBeNull()
      })
    })

    describe('saving', () => {
      const saveViaDialog = async () => {
        await userEvent.click(screen.getByRole('button', { name: 'More options' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
      }

      it('counts saved work as saved: the draft no longer claims unsaved edits', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        await waitFor(() => expect(readDraft()?.hasEdits).toBe(true), { timeout: 2000 })

        await userEvent.click(document.body) // deselect
        await saveViaDialog()

        await waitFor(() => expect(readDraft()?.hasEdits).toBe(false), { timeout: 2000 })
        expect(readDraft()!.savedMeta).not.toBeNull() // and it is now a draft of that saved meme
      })

      it('does not ask to discard just-saved work when switching templates', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        await userEvent.click(document.body)
        await saveViaDialog()
        await screen.findByRole('status') // the "Saved!" toast: the save has finished

        await userEvent.click(screen.getByText('Plain Photo'))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(await screen.findByRole('img', { name: 'Plain Photo' })).toBeInTheDocument()
      })

      it('also counts an update to an already-saved meme as saved (the quick Save)', async () => {
        savedRows.push({ id: 'c1', name: 'Two Buttons 1', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
        renderEditor('/editor/c1')
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        await waitFor(() => expect(readDraft()?.hasEdits).toBe(true), { timeout: 2000 })
        await userEvent.click(document.body)

        await userEvent.click(screen.getByRole('button', { name: 'More options' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Save' })) // no dialog: it already has a name

        await screen.findByRole('status')
        await waitFor(() => expect(readDraft()?.hasEdits).toBe(false), { timeout: 2000 })
      })

      it('still asks after edits made AFTER saving', async () => {
        renderEditor()
        await userEvent.click(await screen.findByText('Two Buttons'))
        await userEvent.click(await screen.findByText('Caption 1'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        await userEvent.click(document.body)
        await saveViaDialog()
        await screen.findByRole('status')

        await userEvent.click(screen.getByText('Caption 2'))
        await userEvent.click(screen.getByText(/size: 22px/i))
        await userEvent.click(screen.getByText('Large'))
        await userEvent.click(document.body)
        await userEvent.click(screen.getByText('Plain Photo'))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })
  })

  describe('toolbar on a phone: docked to the bottom', () => {
    // Below 640px the toolbar is a bar pinned to the bottom of the screen, not a pill that
    // follows the selected caption around.
    const stubPhone = (isPhone: boolean) => {
      window.matchMedia = vi.fn((query: string) => ({
        matches: isPhone && query === '(max-width: 639px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia
    }
    const dock = () => document.querySelector('[data-property-dock]') as HTMLElement | null
    const fontButton = () => screen.queryByRole('button', { name: /^Font:/ })

    afterEach(() => {
      Reflect.deleteProperty(window, 'matchMedia')
      Reflect.deleteProperty(window, 'visualViewport')
    })

    async function selectCaption() {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await userEvent.click(await screen.findByText('Caption 1'))
    }

    it('pins the toolbar to the bottom edge of the screen, full width, not positioned by the caption', async () => {
      stubPhone(true)
      await selectCaption()
      const bar = dock()!
      expect(bar).not.toBeNull()
      expect(bar).toHaveClass('fixed', 'inset-x-0')
      expect(bar.style.bottom).toBe('0px')
      expect(bar.style.left).toBe('') // nothing ties it to where the caption is
      expect(bar.style.top).toBe('')
      expect(within(bar).getByRole('button', { name: /^Font:/ })).toBeInTheDocument()
    })

    it('shows nothing until something is selected, and goes away again when it is deselected', async () => {
      stubPhone(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await screen.findByText('Caption 1')
      expect(dock()).toBeNull()

      await userEvent.click(screen.getByText('Caption 1'))
      expect(dock()).not.toBeNull()

      // tapping empty page space deselects
      await userEvent.click(document.body)
      expect(dock()).toBeNull()
    })

    it('leaves the floating toolbar exactly as it was on a larger screen', async () => {
      stubPhone(false)
      await selectCaption()
      expect(dock()).toBeNull()
      expect(fontButton()).toBeInTheDocument() // still there, floating over the caption
    })

    it('rides above the on-screen keyboard instead of being covered by it', async () => {
      stubPhone(true)
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
      const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number; scale: number }
      viewport.height = 800
      viewport.offsetTop = 0
      viewport.scale = 1
      Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
      await selectCaption()
      expect(dock()!.style.bottom).toBe('0px')

      act(() => {
        viewport.height = 480 // the keyboard opened
        viewport.dispatchEvent(new Event('resize'))
      })
      expect(dock()!.style.bottom).toBe('320px')

      act(() => {
        viewport.height = 800
        viewport.dispatchEvent(new Event('resize'))
      })
      expect(dock()!.style.bottom).toBe('0px')
    })
  })

  describe('double-tap to edit (touch)', () => {
    // A phone has no double-click, and iOS doesn't reliably synthesize one for
    // these touch-none boxes, so two quick taps must enter edit mode themselves.
    const tap = (text: string, x = 100, y = 100) => {
      const box = screen.getByText(text)
      fireEvent.pointerDown(box, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y })
      fireEvent.pointerUp(box, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y })
    }
    const isEditing = (text: string) => screen.getByText(text).getAttribute('contenteditable') === 'true'

    async function openTwoButtons() {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await screen.findByText('Caption 1')
    }

    afterEach(() => vi.useRealTimers())

    it('enters edit mode on two quick taps of the same caption', async () => {
      await openTwoButtons()
      tap('Caption 1')
      expect(isEditing('Caption 1')).toBe(false) // one tap only selects
      tap('Caption 1')
      expect(isEditing('Caption 1')).toBe(true)
    })

    it('works for a pen too, not only a finger', async () => {
      await openTwoButtons()
      const box = screen.getByText('Caption 1')
      for (let i = 0; i < 2; i++) {
        fireEvent.pointerDown(box, { pointerType: 'pen', pointerId: 2, clientX: 50, clientY: 50 })
        fireEvent.pointerUp(box, { pointerType: 'pen', pointerId: 2, clientX: 50, clientY: 50 })
      }
      expect(isEditing('Caption 1')).toBe(true)
    })

    it('does not treat two slow taps as a double-tap', async () => {
      await openTwoButtons()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      tap('Caption 1')
      vi.setSystemTime(new Date('2026-01-01T00:00:01Z')) // a full second later
      tap('Caption 1')
      expect(isEditing('Caption 1')).toBe(false)
    })

    it('does not treat taps on two different captions as a double-tap', async () => {
      await openTwoButtons()
      tap('Caption 1')
      tap('Caption 2')
      expect(isEditing('Caption 1')).toBe(false)
      expect(isEditing('Caption 2')).toBe(false)
    })

    it('does not treat taps in clearly different spots as a double-tap', async () => {
      await openTwoButtons()
      tap('Caption 1', 100, 100)
      tap('Caption 1', 220, 100)
      expect(isEditing('Caption 1')).toBe(false)
    })

    it('does not count a drag as a tap', async () => {
      await openTwoButtons()
      const box = screen.getByText('Caption 1')
      fireEvent.pointerDown(box, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(box, { pointerType: 'touch', pointerId: 1, clientX: 160, clientY: 100 })
      fireEvent.pointerUp(box, { pointerType: 'touch', pointerId: 1, clientX: 160, clientY: 100 })
      tap('Caption 1', 160, 100)
      expect(isEditing('Caption 1')).toBe(false)
    })

    it('leaves mouse users to the real double-click (two quick mouse clicks do not double-fire it)', async () => {
      await openTwoButtons()
      const box = screen.getByText('Caption 1')
      for (let i = 0; i < 2; i++) {
        fireEvent.pointerDown(box, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 })
        fireEvent.pointerUp(box, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 })
      }
      expect(isEditing('Caption 1')).toBe(false)
    })

    it('a third quick tap after entering edit mode does not restart the edit', async () => {
      await openTwoButtons()
      tap('Caption 1')
      tap('Caption 1')
      expect(isEditing('Caption 1')).toBe(true)
      // Tapping inside a box being edited places the text cursor; it must not
      // re-run "enter edit mode", which would select all the text again.
      tap('Caption 1')
      tap('Caption 1')
      expect(isEditing('Caption 1')).toBe(true)
    })
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

  it('Clear Canvas in the more-options menu asks for confirmation, and only clears the canvas once confirmed', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    // The old "Delete" label was ambiguous next to a layer's own Delete.
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Canvas' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument() // not cleared yet

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('Clear Canvas in the more-options menu, cancel leaves the canvas untouched', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Canvas' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('Clear Canvas wipes everything at once: the template, its captions, and any image and text added on top', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
    await selectImageFile('sticker.png')
    await screen.findByAltText('')
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Canvas' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))

    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
    expect(screen.queryByAltText('')).not.toBeInTheDocument() // the uploaded image layer
    expect(screen.queryByText(/^Caption \d$/)).not.toBeInTheDocument()
    expect(document.querySelector('[contenteditable]')).toBeNull() // the added text layer
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled() // back to a blank canvas
  })

  it('Clear Canvas also wipes a freeform canvas and all its images', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' })
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
    await selectImageFile('first.png')
    await screen.findByAltText('')
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
    await selectImageFile('second.png')
    expect(await screen.findAllByAltText('')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Canvas' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))

    expect(screen.queryByAltText('')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('picking a template while the canvas is blank loads it with no confirmation', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('re-picking a template with no edits made switches immediately, with no confirmation', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    // Nothing changed since it loaded (no typing, no drag/resize) — picking
    // it again should just reload it, not ask to discard anything.
    await userEvent.click(screen.getByText('Two Buttons'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('re-picking a template after making an edit asks for confirmation first', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.dblClick(screen.getByText('Caption 1'))
    await userEvent.type(screen.getByText('Caption 1'), 'X')
    await userEvent.keyboard('{Enter}')

    await userEvent.click(screen.getByText('Two Buttons'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Caption 1X/)).toBeInTheDocument() // not discarded yet

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch Template' }))

    // Reloaded fresh — the edit is gone, back to the template's own default label.
    expect(screen.queryByText(/Caption 1X/)).not.toBeInTheDocument()
    expect(screen.getByText('Caption 1')).toBeInTheDocument()
  })

  describe('Gallery preview (rendered on save)', () => {
    type Saved = { preview_image_url?: string | null }
    const previewOf = () => (savedRows.at(-1) as Saved).preview_image_url

    beforeEach(() => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
    })

    async function saveFromDialog() {
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    }

    it('renders the meme and stores its uploaded preview URL when a template creation is first saved', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await saveFromDialog()

      await waitFor(() => expect(previewOf()).toMatch(/creation-previews\/.+\.jpg$/))
      // A small JPEG, not a full-size PNG: uploading the PNG of a big photo
      // took ~15s, which made Save feel like it wasn't working.
      expect(renderCreationToBlob).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { image_width: 600, image_height: 908 },
        expect.arrayContaining([expect.objectContaining({ label: 'Caption 1' })]),
        {
          maxEdge: 1200,
          type: 'image/jpeg',
          quality: 0.85,
          // the template image, drawn under everything, at 0,0 for an unadjusted canvas
          background: { image: expect.any(HTMLImageElement), x: 0, y: 0, width: 600, height: 908 },
        },
      )
    })

    it('re-renders a fresh preview on every later Save, not just the first', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await saveFromDialog()
      await waitFor(() => expect(previewOf()).toBeTruthy())
      const first = previewOf()

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' })) // quick save: already saved once

      await waitFor(() => expect(previewOf()).not.toBe(first))
      expect(previewOf()).toMatch(/creation-previews/)
      expect(renderCreationToBlob).toHaveBeenCalledTimes(2)
    })

    it('renders freeform canvases too, from their on-screen box', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')
      await screen.findByAltText('')
      await waitFor(() => expect(screen.getByRole('button', { name: 'More options' })).toBeEnabled())

      await saveFromDialog()

      await waitFor(() => expect(previewOf()).toMatch(/creation-previews/))
      expect(renderCreationToBlob).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { image_width: 400, image_height: 300 },
        expect.anything(),
        { maxEdge: 1200, type: 'image/jpeg', quality: 0.85 },
      )
    })

    it('still saves the creation, just without a preview, when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('tainted canvas'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await saveFromDialog()

      await waitFor(() => expect(savedRows.at(-1)).toMatchObject({ source_type: 'template', template_id: 'tmpl-1' }))
      expect(previewOf() ?? null).toBeNull()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // the save completed and the dialog closed
    })
  })

  describe('Save feedback (spinner and toast)', () => {
    beforeEach(() => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
    })

    // Holds the save open: the preview upload never finishes, so the save
    // stays in flight until the test says otherwise.
    const holdSaveOpen = () => mockStorageUpload.mockReset().mockReturnValue(new Promise(() => {}))

    async function openSaveDialog() {
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      return screen.getByRole('dialog')
    }

    it('shows a spinner on the dialog Save button and disables it while saving, so it never looks stuck', async () => {
      holdSaveOpen()
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const dialog = await openSaveDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      const saving = within(screen.getByRole('dialog')).getByRole('button', { name: 'Saving…' })
      expect(saving).toBeDisabled()
      expect(saving.querySelector('svg.animate-spin')).not.toBeNull()
      // Cancel can't take back a save that is already on its way.
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })

    it('closes the dialog and confirms with a toast once the save finishes', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const dialog = await openSaveDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Saved')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('a quick Save from the menu spins the menu button while saving, then toasts', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const dialog = await openSaveDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await screen.findByRole('status')
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 4000 })

      holdSaveOpen()
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))

      const busy = screen.getByRole('button', { name: 'Saving…' })
      expect(busy).toBeDisabled()
      expect(busy.querySelector('svg.animate-spin')).not.toBeNull()
    })

    it('a quick Save toasts "Saved" when it finishes', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const dialog = await openSaveDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 4000 })

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Saved')
      expect(screen.getByRole('button', { name: 'More options' })).toBeEnabled()
    })

    it('says so and lets you try again when the save fails, keeping the dialog open', async () => {
      saveError = { message: 'boom' }
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const dialog = await openSaveDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('status')).toHaveTextContent(/save failed/i)
      const stillOpen = screen.getByRole('dialog')
      expect(within(stillOpen).getByRole('button', { name: 'Save' })).toBeEnabled()
    })
  })

  describe('Adjusting a template canvas', () => {
    // Two Buttons is 600x908, so a canvas box given a 600px rect is 1:1.
    const rectOf = (width: number, height: number) => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => {} })
    const handle = (key: string) => document.querySelector(`[data-canvas-handle="${key}"]`) as HTMLElement
    const canvasBox = () => document.querySelector('[style*="aspect-ratio"]') as HTMLElement
    const background = () => screen.getByRole('img', { name: 'Two Buttons' })
    const pct = (el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height') => parseFloat(el.style[prop])

    async function startAdjustingTemplate() {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Adjust Canvas' }))
      vi.spyOn(canvasBox(), 'getBoundingClientRect').mockReturnValue(rectOf(600, 908))
    }
    const drag = (key: string, to: [number, number]) => {
      fireEvent.pointerDown(handle(key), { clientX: 0, clientY: 0 })
      fireEvent.pointerMove(handle(key), { clientX: to[0], clientY: to[1] })
    }

    it('starts with the image filling the canvas exactly', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      expect(canvasBox().style.aspectRatio).toBe('600 / 908')
      expect([pct(background(), 'left'), pct(background(), 'top'), pct(background(), 'width'), pct(background(), 'height')]).toEqual([0, 0, 100, 100])
    })

    it('shows all 8 handles', async () => {
      await startAdjustingTemplate()
      expect(document.querySelectorAll('[data-canvas-handle]')).toHaveLength(8)
    })

    it('growing the right edge adds empty canvas beside the image, which keeps its size and position', async () => {
      await startAdjustingTemplate()

      drag('rm', [100, 0])

      expect(canvasBox().style.aspectRatio).toBe('700 / 908')
      expect(pct(background(), 'left')).toBeCloseTo(0, 5)
      expect(pct(background(), 'width')).toBeCloseTo((600 / 700) * 100, 3) // still 600px, now of a 700px canvas
    })

    it('growing the left edge moves the image (and the captions) right by the same amount, so they stay put', async () => {
      await startAdjustingTemplate()
      const caption1Left = () => parseFloat(screen.getByText('Caption 1').style.left)

      drag('lm', [-50, 0])

      expect(canvasBox().style.aspectRatio).toBe('650 / 908')
      expect(pct(background(), 'left')).toBeCloseTo((50 / 650) * 100, 3)
      expect(caption1Left()).toBeCloseTo(((30 + 50) / 650) * 100, 3) // the mock caption sits at x=30
    })

    it('growing the top edge adds space above the image — room for a caption bar', async () => {
      await startAdjustingTemplate()

      drag('tm', [0, -120])

      expect(canvasBox().style.aspectRatio).toBe('600 / 1028')
      expect(pct(background(), 'top')).toBeCloseTo((120 / 1028) * 100, 3)
      expect(pct(background(), 'height')).toBeCloseTo((908 / 1028) * 100, 3)
    })

    it('shrinking the canvas crops the image rather than squashing it', async () => {
      await startAdjustingTemplate()

      drag('tm', [0, 100]) // push the top edge 100px in

      expect(canvasBox().style.aspectRatio).toBe('600 / 808')
      expect(pct(background(), 'top')).toBeCloseTo((-100 / 808) * 100, 3) // the image's top 100px is now off the canvas
      expect(pct(background(), 'height')).toBeCloseTo((908 / 808) * 100, 3) // and it is still its full 908px
    })

    it('crops the image with the canvas: the box that holds it hides anything hanging off', async () => {
      await startAdjustingTemplate()
      expect(canvasBox()).toHaveClass('overflow-hidden')
    })

    it('exports at the adjusted canvas size, with the image drawn at its offset', async () => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
      vi.mocked(canShareFile).mockReturnValue(false)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(false)
      await startAdjustingTemplate()
      drag('lm', [-50, 0])
      fireEvent.pointerUp(handle('lm'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(renderCreationToBlob).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { image_width: 650, image_height: 908 },
        expect.any(Array),
        { background: { image: expect.any(HTMLImageElement), x: 50, y: 0, width: 600, height: 908 } },
      )
    })

    it('saves the canvas size and where the image sits, and reopens exactly as adjusted', async () => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
      await startAdjustingTemplate()
      drag('lm', [-50, 0])
      fireEvent.pointerUp(handle('lm'))
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(savedRows.at(-1)).toMatchObject({ source_type: 'template', template_id: 'tmpl-1' }))

      const saved = savedRows.at(-1) as { canvas_data: Record<string, unknown> }
      expect(saved.canvas_data).toMatchObject({ canvasWidth: 650, canvasHeight: 908, backgroundX: 50, backgroundY: 0 })
    })

    it('an unadjusted template saves no canvas fields at all, so older and newer saves look the same', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(savedRows.at(-1)).toMatchObject({ source_type: 'template' }))

      const saved = savedRows.at(-1) as { canvas_data: Record<string, unknown> }
      expect(Object.keys(saved.canvas_data)).toEqual(['layers'])
    })

    it('reopens a saved adjusted template with its canvas size and image position restored', async () => {
      savedRows.push({
        id: 'adj-1',
        name: 'Two Buttons 7',
        tags: [],
        source_type: 'template',
        template_id: 'tmpl-1',
        canvas_data: { layers: [], canvasWidth: 700, canvasHeight: 1008, backgroundX: 100, backgroundY: 60 },
      })

      renderEditor('/editor/adj-1')

      await screen.findByRole('img', { name: 'Two Buttons' })
      expect(canvasBox().style.aspectRatio).toBe('700 / 1008')
      expect(pct(background(), 'left')).toBeCloseTo((100 / 700) * 100, 3)
      expect(pct(background(), 'top')).toBeCloseTo((60 / 1008) * 100, 3)
    })

    it('counts as an edit, so picking another template afterwards asks before throwing the adjustment away', async () => {
      await startAdjustingTemplate()
      drag('rm', [100, 0]) // no layer edits at all — only the canvas size
      fireEvent.pointerUp(handle('rm'))

      await userEvent.click(screen.getByText('Plain Photo'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Layering (z-order)', () => {
    // Stacking order is DOM order (later = on top), so the order the
    // captions appear in the document is the z-order under test.
    const captionOrder = () => screen.getAllByText(/^Caption \d$/).map((el) => el.textContent)

    async function selectCaption(name: string) {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await userEvent.click(screen.getByText(name))
    }

    async function chooseLayering(item: RegExp) {
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))
      await userEvent.click(screen.getByRole('menuitem', { name: item }))
    }

    const press = (init: KeyboardEventInit) => fireEvent.keyDown(document.body, init)

    it('starts in the seeded order', async () => {
      await selectCaption('Caption 1')
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('Bring to front / Send to back from the toolbar dropdown move the selected layer to the ends', async () => {
      await selectCaption('Caption 2')

      await chooseLayering(/bring to front/i)
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 3', 'Caption 2'])

      await chooseLayering(/send to back/i)
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])
    })

    it('Bring forward / Send backward from the dropdown move it one step', async () => {
      await selectCaption('Caption 1')

      await chooseLayering(/bring forward/i)
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])

      await chooseLayering(/send backward/i)
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('keeps the layer selected after reordering, so its toolbar stays up', async () => {
      await selectCaption('Caption 1')
      await chooseLayering(/bring to front/i)
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 3', 'Caption 1'])
      expect(screen.getByRole('button', { name: 'Layering' })).toBeInTheDocument()
    })

    it('disables the entries that would do nothing at either end of the stack', async () => {
      await selectCaption('Caption 3') // already the top layer
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))
      expect(screen.getByRole('menuitem', { name: /bring to front/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /send to back/i })).toBeEnabled()
    })

    it('⌘] brings the selected layer forward one step and ⌘[ sends it back one step', async () => {
      await selectCaption('Caption 1')

      press({ key: ']', code: 'BracketRight', metaKey: true })
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])

      press({ key: '[', code: 'BracketLeft', metaKey: true })
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('⌘⇧] brings to front and ⌘⇧[ sends to back (Shift changes event.key, so it must match on the physical key)', async () => {
      await selectCaption('Caption 2')

      press({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true })
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 3', 'Caption 2'])

      press({ key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true })
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])
    })

    it('still works when the event carries no physical key code, falling back to the character', async () => {
      // Some virtual/remote keyboards (and automation) send an empty
      // event.code — only event.key is reliable there.
      await selectCaption('Caption 1')

      press({ key: ']', code: '', metaKey: true })
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])

      press({ key: '{', code: '', metaKey: true, shiftKey: true })
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('Ctrl works in place of ⌘ for non-Mac keyboards', async () => {
      await selectCaption('Caption 1')
      press({ key: ']', code: 'BracketRight', ctrlKey: true })
      expect(captionOrder()).toEqual(['Caption 2', 'Caption 1', 'Caption 3'])
    })

    it("prevents the browser's own ⌘[ / ⌘] (Back / Forward) from also firing", async () => {
      await selectCaption('Caption 1')
      // fireEvent returns false when preventDefault() was called.
      expect(press({ key: ']', code: 'BracketRight', metaKey: true })).toBe(false)
    })

    it('does nothing when no layer is selected', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      press({ key: ']', code: 'BracketRight', metaKey: true })
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('ignores a bare bracket press with no ⌘/Ctrl (that is just a character)', async () => {
      await selectCaption('Caption 1')
      press({ key: ']', code: 'BracketRight' })
      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('does nothing while the layer\'s text is being edited', async () => {
      await selectCaption('Caption 1')
      await userEvent.dblClick(screen.getByText('Caption 1'))

      press({ key: ']', code: 'BracketRight', metaKey: true })

      expect(captionOrder()).toEqual(['Caption 1', 'Caption 2', 'Caption 3'])
    })

    it('counts as an edit, so switching templates afterwards asks before discarding it', async () => {
      await selectCaption('Caption 1')
      await chooseLayering(/bring to front/i)

      await userEvent.click(screen.getByText('Two Buttons'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('works on an image layer too: an uploaded image starts on top and can be sent behind the captions', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('sticker.png')
      const layerBox = (await screen.findByAltText('')).parentElement as HTMLElement
      const caption = screen.getByText('Caption 1')
      // Uploaded last, so it paints above every caption.
      expect(caption.compareDocumentPosition(layerBox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      await userEvent.click(layerBox)
      await chooseLayering(/send to back/i)

      expect(layerBox.compareDocumentPosition(screen.getByText('Caption 1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('template image while the full-size file loads', () => {
    it('shows the small thumbnail behind the full image, so picking a template is never a blank wait', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      const image = await screen.findByRole('img', { name: 'Two Buttons' })
      expect(image).toHaveAttribute('src', 'https://example.com/blank.jpg') // the sharp one is what's really loading
      expect(image.style.backgroundImage).toContain('https://example.com/thumbs/blank.jpg')
    })

    it('shows no placeholder for a template that has no thumbnail', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Plain Photo'))

      const image = await screen.findByRole('img', { name: 'Plain Photo' })
      expect(image.style.backgroundImage).toBe('')
    })

    it('does the same when reopening a saved creation', async () => {
      savedRows.push({ id: 'thumb-1', name: 'Two Buttons 9', tags: [], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })

      renderEditor('/editor/thumb-1')

      const image = await screen.findByRole('img', { name: 'Two Buttons' })
      expect(image.style.backgroundImage).toContain('https://example.com/thumbs/blank.jpg')
    })

    it('swaps in a fresh image element for each template, so the previous template never lingers while the next one loads', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const first = await screen.findByRole('img', { name: 'Two Buttons' })

      await userEvent.click(screen.getByText('Plain Photo'))
      if (screen.queryByRole('dialog')) await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /discard|confirm|yes|continue/i }))

      const second = await screen.findByRole('img', { name: 'Plain Photo' })
      expect(second).not.toBe(first)
      expect(first).not.toBeInTheDocument()
    })
  })

  describe('Export', () => {
    beforeEach(() => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['fake'], { type: 'image/png' }))
      vi.mocked(canShareFile).mockReset().mockReturnValue(false)
      vi.mocked(isMobileOrTabletDevice).mockReset().mockReturnValue(false)
      vi.mocked(shareFile).mockReset().mockResolvedValue(undefined)
      vi.mocked(downloadBlob).mockReset()
      usageInserts.length = 0
    })

    afterEach(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })

    const exportEvents = () => usageInserts.filter((event) => event.kind === 'export')

    it('waits for the full-size template image to finish loading before rendering, so a quick click never exports a blank template', async () => {
      let finishLoading!: () => void
      const decode = vi.fn(() => new Promise<void>((resolve) => (finishLoading = resolve)))
      Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: decode, configurable: true })
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))
      expect(decode).toHaveBeenCalled()
      expect(renderCreationToBlob).not.toHaveBeenCalled()

      finishLoading()
      await waitFor(() => expect(renderCreationToBlob).toHaveBeenCalled())
    })

    it('still exports when the template image fails to decode (it just goes out without it, as before)', async () => {
      Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: () => Promise.reject(new Error('broken')), configurable: true })
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(renderCreationToBlob).toHaveBeenCalled())
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

    it('downloads directly on a desktop (mouse/trackpad) device even when the browser supports file-sharing', async () => {
      // Regression test: modern desktop Safari supports navigator.share
      // with files too (confirmed live — it pops the native macOS share
      // sheet), which isn't what "Export" should do on desktop. Desktop
      // must always download directly regardless of canShareFile.
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(false)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.png$/))
      expect(shareFile).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Downloaded')
    })

    it('shares via the Web Share API on a touch-primary device that supports it, showing a toast on success', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(shareFile).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(/\.png$/))
      expect(downloadBlob).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Shared')
    })

    it('shows no toast when the user cancels the native share sheet', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      const abortError = new Error('cancelled')
      abortError.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(abortError)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await Promise.resolve() // let the rejected promise settle
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('exports a freeform canvas too, rendered at the canvas\'s own size from its on-screen box', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')
      await screen.findByAltText('')
      // Wait out the background upload — Export lives in a control that's
      // only enabled once the layer's permanent URL has swapped in.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled())

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      // MockImage reports 400x300 — the freeform canvas's own size. The
      // first argument is the on-screen box (a <div>, not a template <img>).
      expect(renderCreationToBlob).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { image_width: 400, image_height: 300 },
        expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
        { background: undefined }, // nothing beneath a freeform canvas
      )
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'vacation.png')
    })

    it('keeps Export disabled on the blank canvas', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })

      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    })

    it('shows an error toast when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('boom'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(await screen.findByRole('status')).toHaveTextContent('failed')
    })

    it('logs an export event for the template once a download succeeds', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toEqual([expect.objectContaining({ template_id: 'tmpl-1', kind: 'export' })]))
    })

    it('logs an export event once a native share completes', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toHaveLength(1))
    })

    it('does not log an export when the user cancels the native share sheet', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      const abortError = new Error('cancelled')
      abortError.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(abortError)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await Promise.resolve()
      expect(exportEvents()).toHaveLength(0)
    })

    it('does not log an export when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('boom'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(await screen.findByRole('status')).toHaveTextContent('failed')
      expect(exportEvents()).toHaveLength(0)
    })

    it('logs a freeform export with no template', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')
      await screen.findByAltText('')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled())

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toEqual([expect.objectContaining({ template_id: null, kind: 'export' })]))
    })
  })

  describe('Upload Image', () => {
    it('on the blank canvas, establishes a freeform canvas sized to the uploaded image, with the image itself as a layer', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')

      const img = await screen.findByAltText('')
      expect(img).toHaveAttribute('src', expect.stringContaining('creation-assets'))
      // MockImage reports 400x300 — that's now the canvas's own size, and
      // this first image fills it exactly (no canvas param passed to
      // createImageLayer for the very first upload).
      expect(img.parentElement).toHaveStyle({ width: '100%', height: '100%' })
    })

    it('adding a second image onto an existing freeform canvas appends a smaller, centered layer without resizing the canvas', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('first.png')
      await screen.findByAltText('')

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('second.png')

      const images = await screen.findAllByAltText('')
      expect(images).toHaveLength(2)
      // The first image's layer box still fills the (unchanged) canvas...
      expect(images[0].parentElement).toHaveStyle({ width: '100%', height: '100%' })
      // ...the second is scaled down to fit within it (60% of 400x300 —
      // width is the binding constraint here too).
      expect(images[1].parentElement).not.toHaveStyle({ width: '100%', height: '100%' })
    })

    it('while a template is loaded, adds the image as a layer on top of it and keeps the template', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))
      const templateImg = await screen.findByAltText('Two Buttons')

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('sticker.png')

      // The uploaded image is a layer over the template, not a replacement
      // for it: the template's own <img> is still there, and its caption
      // fields haven't been thrown away.
      const layerImg = await screen.findByAltText('')
      expect(layerImg).toHaveAttribute('src', expect.stringContaining('creation-assets'))
      expect(screen.getByAltText('Two Buttons')).toBe(templateImg)
      // Landed scaled-down and centered (MockImage is 400x300, the
      // template is bigger), never filling the whole canvas.
      expect(layerImg.parentElement).not.toHaveStyle({ width: '100%', height: '100%' })
    })

    it('shows the picked image immediately via a local preview, before the background upload finishes', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      // Never resolves within this test — isolates the moment right after
      // the local preview appears but before the (still-pending) background
      // upload would ever swap in the permanent URL.
      mockStorageUpload.mockReset().mockReturnValue(new Promise(() => {}))

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      expect(img).toHaveAttribute('src', 'blob:mock-url')
      // Still mid-upload — the FAB stays busy and Save stays blocked so a
      // blob: URL (only valid for this page session) can never get saved.
      expect(screen.getByRole('button', { name: 'Uploading image…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
      // Export too: its image layer's src is still the short-lived blob: URL.
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    })

    it('reverts fully back to the blank canvas when the very first upload fails', async () => {
      mockStorageUpload.mockReset().mockResolvedValue({ data: null, error: { message: 'network error' } })
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile()

      expect(await screen.findByRole('status')).toHaveTextContent('Upload failed')
      // The optimistic local-preview layer and the canvas it would have
      // established are both rolled back — back to a genuinely blank
      // canvas, not a mysterious empty freeform one.
      expect(screen.queryByAltText('')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
    })

    it('removes just the new layer, leaving the canvas intact, when a second upload fails', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('first.png')
      await screen.findByAltText('')

      mockStorageUpload.mockReset().mockResolvedValue({ data: null, error: { message: 'network error' } })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('second.png')

      expect(await screen.findByRole('status')).toHaveTextContent('Upload failed')
      // The first image survives untouched — only the failed second one is rolled back.
      expect(screen.getAllByAltText('')).toHaveLength(1)
    })

    it('Add Text now works once a freeform canvas exists (previously a hard no-op)', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile()
      await screen.findByAltText('')

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
    })

    it('Add Text still does nothing on a truly blank canvas (no image uploaded yet)', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0)
    })

    it('selecting an image layer shows Delete and Crop in the property bar but no Font/Size/Color control', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      await userEvent.click(img)

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.getByText('Crop')).toBeInTheDocument()
      expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
      expect(screen.queryByText('Color')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Text color' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Text alignment' })).not.toBeInTheDocument()
    })

    it('clicking Crop in the property bar enters crop mode, same as double-clicking the image', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))
      await userEvent.click(img)

      await userEvent.click(screen.getByText('Crop'))

      expect(img.parentElement).toHaveClass('border-dashed')
      expect(document.querySelectorAll('.border-blue-500.bg-white')).toHaveLength(8)
    })

    it('selecting an image layer shows only the 4 corner resize handles, never the edge midpoints', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      await userEvent.click(img)

      // Layer-resize handles are the blue ones — distinct from the gray
      // canvas-resize handles, which aren't shown here since selecting a
      // layer exits Adjust Canvas mode.
      expect(document.querySelectorAll('.border-blue-500.bg-white')).toHaveLength(4)
    })

    it('double-clicking an image layer enters crop mode: dashed frame, 8 resize handles, no PropertyBar', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      await userEvent.dblClick(img)

      expect(img.parentElement).toHaveClass('border-dashed')
      expect(document.querySelectorAll('.border-blue-500.bg-white')).toHaveLength(8)
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })

    it('a click anywhere outside the frame exits crop mode, accepting whatever was adjusted', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      await userEvent.dblClick(img)
      expect(img.parentElement).toHaveClass('border-dashed')

      await userEvent.click(document.body)

      expect(img.parentElement).not.toHaveClass('border-dashed')
      expect(document.querySelectorAll('.border-blue-500.bg-white')).toHaveLength(0)
    })

    it('dragging a corner handle resizes the crop frame in place, kept after clicking outside to accept', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))
      // MockImage reports 400x300 — this first upload establishes the
      // canvas at that exact size, so the layer starts filling it (100%/100%).
      expect(img.parentElement!.style.width).toBe('100%')
      expect(img.parentElement!.style.height).toBe('100%')

      // jsdom never lays anything out for real (getBoundingClientRect is
      // all-zero by default) — the crop handlers divide the pointer delta
      // by the canvas element's rendered width to convert screen pixels to
      // canvas pixels, so it needs a real width here (same fix the earlier
      // canvas-resize test already needed).
      const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
      vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      await userEvent.dblClick(img)
      // Bottom-right handle, per RESIZE_HANDLES order (tl, tm, tr, lm, rm, bl, bm, br).
      const handles = document.querySelectorAll('.border-blue-500.bg-white')
      const brHandle = handles[handles.length - 1]
      fireEvent.pointerDown(brHandle, { clientX: 0, clientY: 0 })
      fireEvent.pointerMove(brHandle, { clientX: -100, clientY: -50 })
      fireEvent.pointerUp(brHandle)
      await userEvent.click(document.body) // accept

      const resizedImg = await screen.findByAltText('')
      expect(resizedImg.parentElement!.style.width).not.toBe('100%')
      expect(resizedImg.parentElement!.style.height).not.toBe('100%')
    })

    it('pressing Escape while cropping reverts to exactly how the layer was before crop mode started', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
      vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      await userEvent.dblClick(img)
      const handles = document.querySelectorAll('.border-blue-500.bg-white')
      const brHandle = handles[handles.length - 1]
      fireEvent.pointerDown(brHandle, { clientX: 0, clientY: 0 })
      fireEvent.pointerMove(brHandle, { clientX: -100, clientY: -50 })
      fireEvent.pointerUp(brHandle)

      await userEvent.keyboard('{Escape}')

      const revertedImg = await screen.findByAltText('')
      expect(revertedImg.parentElement!.style.width).toBe('100%')
      expect(revertedImg.parentElement!.style.height).toBe('100%')
      expect(revertedImg.parentElement).not.toHaveClass('border-dashed')
    })

    it('canvas resize handles are hidden by default after uploading, and only appear once Adjust Canvas is chosen from the menu', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      const canvasHandleSelector = '.border-neutral-500.bg-white'
      expect(document.querySelectorAll(canvasHandleSelector)).toHaveLength(0)

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Adjust Canvas' }))
      expect(document.querySelectorAll(canvasHandleSelector)).toHaveLength(8) // 4 corners + 4 edges

      await userEvent.click(img) // selecting a layer exits adjust-canvas mode
      expect(document.querySelectorAll(canvasHandleSelector)).toHaveLength(0)
    })

    it('the More Options menu offers Adjust Canvas for a template too, and is unavailable on a blank canvas', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled() // blank canvas: nothing to adjust

      await userEvent.click(screen.getByText('Two Buttons'))
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))

      expect(screen.getByRole('menuitem', { name: 'Adjust Canvas' })).toBeInTheDocument()
    })

    it('dragging the bottom-right canvas handle grows the canvas, persisted through save', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile()
      await screen.findByAltText('')
      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Adjust Canvas' }))

      // jsdom never lays anything out for real (getBoundingClientRect is
      // all-zero by default) — handleCanvasResizePointerMove divides the
      // pointer delta by the canvas element's rendered width to convert
      // screen pixels back to canvas pixels, so it needs a real width here.
      // The freeform canvas container (imgRef) is the sibling <div> with the
      // aspect-ratio inline style, right before the @container layers div —
      // not an ancestor of the <img>, which lives inside that separate
      // @container div as its own layer box.
      const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
      vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      const brHandle = document.querySelector('[data-canvas-handle="br"]') as HTMLElement
      fireEvent.pointerDown(brHandle, { clientX: 0, clientY: 0 })
      fireEvent.pointerMove(brHandle, { clientX: 100, clientY: 50 })
      fireEvent.pointerUp(brHandle)

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      const dialog = screen.getByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      const saved = savedRows.at(-1) as { canvas_data?: { canvasWidth?: number; canvasHeight?: number } }
      expect(saved.canvas_data?.canvasWidth).toBe(500) // 400 + 100
      expect(saved.canvas_data?.canvasHeight).toBe(350) // 300 + 50
    })

    describe('adjusting from any edge or corner', () => {
      async function startAdjusting() {
        renderEditor()
        await screen.findByRole('button', { name: 'Two Buttons' })
        await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
        await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await selectImageFile()
        const img = await screen.findByAltText('')
        await userEvent.click(screen.getByRole('button', { name: 'More options' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Adjust Canvas' }))
        // jsdom lays nothing out, so give the canvas box a real 400px-wide rect
        // (1:1 with the 400x300 canvas) for the pointer math to divide by.
        const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
        vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => {} })
        return { img, canvasEl }
      }
      const handle = (key: string) => document.querySelector(`[data-canvas-handle="${key}"]`) as HTMLElement
      const drag = (key: string, from: [number, number], to: [number, number]) => {
        fireEvent.pointerDown(handle(key), { clientX: from[0], clientY: from[1] })
        fireEvent.pointerMove(handle(key), { clientX: to[0], clientY: to[1] })
      }

      it('hides the floating + button while adjusting, since it sits over the bottom-right handle and would block it', async () => {
        const { img } = await startAdjusting()
        expect(screen.queryByRole('button', { name: 'Open add menu' })).not.toBeInTheDocument()

        await userEvent.click(img) // selecting a layer leaves adjust mode
        expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
      })

      it('has a handle at all 8 spots, not just the right, bottom and bottom-right', async () => {
        await startAdjusting()
        expect([...document.querySelectorAll('[data-canvas-handle]')].map((h) => h.getAttribute('data-canvas-handle')).sort()).toEqual(
          ['bl', 'bm', 'br', 'lm', 'rm', 'tl', 'tm', 'tr'],
        )
      })

      it('dragging the left edge outward widens the canvas and shifts the image right so it stays put on screen', async () => {
        const { img, canvasEl } = await startAdjusting()

        drag('lm', [0, 0], [-50, 0]) // pull the left edge 50px further left

        expect(canvasEl.style.aspectRatio).toBe('450 / 300')
        // The image was at x=0; it now sits 50px in from the new left edge (50/450 = 11.11%).
        expect(parseFloat(img.parentElement!.style.left)).toBeCloseTo((50 / 450) * 100, 3)
        expect(parseFloat(img.parentElement!.style.width)).toBeCloseTo((400 / 450) * 100, 3)
      })

      it('dragging the top edge outward grows the canvas upward and shifts the image down', async () => {
        const { img, canvasEl } = await startAdjusting()

        drag('tm', [0, 0], [0, -30])

        expect(canvasEl.style.aspectRatio).toBe('400 / 330')
        expect(parseFloat(img.parentElement!.style.top)).toBeCloseTo((30 / 330) * 100, 3)
      })

      it('dragging a corner resizes and shifts on both axes at once', async () => {
        const { img, canvasEl } = await startAdjusting()

        drag('tl', [0, 0], [-40, -20])

        expect(canvasEl.style.aspectRatio).toBe('440 / 320')
        expect(parseFloat(img.parentElement!.style.left)).toBeCloseTo((40 / 440) * 100, 3)
        expect(parseFloat(img.parentElement!.style.top)).toBeCloseTo((20 / 320) * 100, 3)
      })

      it('shrinking from the left crops instead of squashing: the image moves off the left edge', async () => {
        const { img, canvasEl } = await startAdjusting()

        drag('lm', [0, 0], [100, 0]) // push the left edge 100px in

        expect(canvasEl.style.aspectRatio).toBe('300 / 300')
        expect(parseFloat(img.parentElement!.style.left)).toBeCloseTo((-100 / 300) * 100, 3)
      })

      it("measures every move from where the drag began, so wandering back and forth doesn't accumulate", async () => {
        const { img, canvasEl } = await startAdjusting()
        fireEvent.pointerDown(handle('lm'), { clientX: 0, clientY: 0 })

        fireEvent.pointerMove(handle('lm'), { clientX: -80, clientY: 0 })
        fireEvent.pointerMove(handle('lm'), { clientX: -20, clientY: 0 })
        fireEvent.pointerMove(handle('lm'), { clientX: -50, clientY: 0 })

        expect(canvasEl.style.aspectRatio).toBe('450 / 300')
        expect(parseFloat(img.parentElement!.style.left)).toBeCloseTo((50 / 450) * 100, 3)
      })

      it('shifts text boxes too, not just images, so everything stays put relative to the artwork', async () => {
        renderEditor()
        await screen.findByRole('button', { name: 'Two Buttons' })
        await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
        await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await selectImageFile()
        await screen.findByAltText('')
        await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
        await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))
        const xBefore = (parseFloat((document.querySelector('[contenteditable]') as HTMLElement).style.left) / 100) * 400 // as canvas px
        await userEvent.click(screen.getByRole('button', { name: 'More options' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Adjust Canvas' }))
        const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
        vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => {} })

        drag('lm', [0, 0], [-100, 0])

        const textBox = document.querySelector('[contenteditable]') as HTMLElement
        expect(canvasEl.style.aspectRatio).toBe('500 / 300')
        expect(parseFloat(textBox.style.left)).toBeCloseTo(((xBefore + 100) / 500) * 100, 3)
      })

      it("converts pointer distance to canvas pixels with the on-screen scale from when the drag began, even though the view zooms out to fit as the canvas grows", async () => {
        const { canvasEl } = await startAdjusting()
        let boxWidth = 400 // at pointer-down the box is 400px wide for a 400px canvas (1:1)...
        vi.spyOn(canvasEl, 'getBoundingClientRect').mockImplementation(
          () => ({ width: boxWidth, height: 300, top: 0, left: 0, right: boxWidth, bottom: 300, x: 0, y: 0, toJSON: () => {} }),
        )
        fireEvent.pointerDown(handle('rm'), { clientX: 0, clientY: 0 })

        boxWidth = 200 // ...then the box shrinks (zoomed out to fit) while dragging.
        // 60px of pointer movement at the STARTING 1:1 scale is 60 canvas px;
        // dividing by the shrunken box would wrongly give 120.
        fireEvent.pointerMove(handle('rm'), { clientX: 60, clientY: 0 })

        expect(canvasEl.style.aspectRatio).toBe('460 / 300')
      })

      it('keeps the box at the canvas true aspect ratio however far it is grown, by sizing to fit the space available', async () => {
        const { canvasEl } = await startAdjusting()

        drag('rm', [0, 0], [4000, 0]) // far wider than any screen

        // The exact ratio (a CSS variable the width formula reads), not a height-fixed guess
        // that a width cap can squash.
        const ratio = parseFloat(canvasEl.style.getPropertyValue('--canvas-ratio'))
        expect(ratio).toBeCloseTo(4400 / 300, 3)
        expect(canvasEl.className).toMatch(/w-\[min\(/)
      })
    })
  })
})
