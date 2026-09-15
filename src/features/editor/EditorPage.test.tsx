import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './EditorPage'

const savedRows: Array<{ id: string; name: string; tags: string[]; source_type: string; template_id: string | null }> = []
let nextId = 1

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
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
    }),
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
  it('shows the empty state first, then the canvas after picking a template', async () => {
    renderEditor()
    expect(screen.getByRole('heading', { name: 'Start a New Meme' })).toBeInTheDocument()

    await userEvent.click(screen.getByText('Drake'))

    expect(screen.getByText(/Drake template \(blank\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Text' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('selecting the layer shows the property bar; clicking empty canvas hides it', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('Drake'))

    expect(screen.queryByText(/size: medium/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('TOP TEXT GOES HERE'))
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('saves a new creation, then shows the Save/Save As split on subsequent saves', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('Drake'))
    await userEvent.click(screen.getByRole('button', { name: 'Save to Gallery' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Drake 1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▾' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save to Gallery' })).not.toBeInTheDocument()
  })

  it('loads an existing creation at /editor/:id with the Save/Save As split from the start', async () => {
    savedRows.push({ id: 'existing-1', name: 'Drake 1', tags: ['funny'], source_type: 'template', template_id: null })

    renderEditor('/editor/existing-1')

    expect(await screen.findByRole('heading', { name: 'Drake 1' })).toBeInTheDocument()
    expect(screen.getByText(/Drake template \(blank\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▾' })).toBeInTheDocument()
  })
})
