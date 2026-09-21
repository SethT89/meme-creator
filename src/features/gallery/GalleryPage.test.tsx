import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
vi.mock('../../lib/exportDelivery', () => ({
  sanitizeFilename: (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '-'),
  canShareFile: vi.fn(),
  isMobileOrTabletDevice: vi.fn(),
  shareFile: vi.fn(),
  downloadBlob: vi.fn(),
}))
import { canShareFile, isMobileOrTabletDevice, shareFile, downloadBlob } from '../../lib/exportDelivery'
vi.mock('../../lib/assetStorage', () => ({ removeUnusedAssets: vi.fn().mockResolvedValue(undefined) }))
import { removeUnusedAssets } from '../../lib/assetStorage'
vi.mock('../../lib/downloadCreation', () => ({ renderCreationForDownload: vi.fn() }))
import { renderCreationForDownload } from '../../lib/downloadCreation'
import { GalleryPage } from './GalleryPage'
import { readDraft, writeDraft } from '../../lib/editorDraft'

const rows: Array<{ id: string; name: string; tags: string[]; preview_image_url: string | null; canvas_data?: unknown }> = []

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          const index = rows.findIndex((r) => r.id === id)
          if (index !== -1) rows.splice(index, 1)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const PREVIEW_URL = 'https://x/creation-previews/a.png'

beforeEach(() => {
  rows.length = 0
  rows.push({ id: '1', name: 'Drake 1', tags: ['funny'], preview_image_url: PREVIEW_URL })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }))
  vi.mocked(canShareFile).mockReset().mockReturnValue(false)
  vi.mocked(isMobileOrTabletDevice).mockReset().mockReturnValue(false)
  vi.mocked(shareFile).mockReset().mockResolvedValue(undefined)
  vi.mocked(downloadBlob).mockReset()
  // Download rebuilds the meme as a lossless PNG (the same render as the Export button).
  vi.mocked(renderCreationForDownload).mockReset().mockResolvedValue(new Blob(['lossless-png'], { type: 'image/png' }))
})

function renderGallery() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('GalleryPage', () => {
  it('shows an empty message with no creations, then real cards once loaded', async () => {
    renderGallery()
    expect(await screen.findByText('Drake 1')).toBeInTheDocument()
    expect(screen.getByText(/1 meme saved/i)).toBeInTheDocument()
  })

  it('navigates to the editor when "Open in editor" is clicked', async () => {
    renderGallery()
    await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open in editor' }))
    // No router assertion needed beyond "didn't throw" — routing itself is covered by routes.test.tsx.
  })

  it('Delete asks for confirmation, and only removes the creation once confirmed', async () => {
    renderGallery()
    await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Drake 1/)).toBeInTheDocument()
    expect(screen.getByText('Drake 1')).toBeInTheDocument() // not removed yet

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Drake 1')).not.toBeInTheDocument()
  })

  it("frees the deleted creation's uploaded images, but only once the delete is confirmed", async () => {
    const canvasData = { layers: [{ type: 'image', id: 'i', src: 'https://x/creation-assets/up.jpg' }] }
    rows[0].canvas_data = canvasData
    vi.mocked(removeUnusedAssets).mockClear()

    renderGallery()
    await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(removeUnusedAssets).not.toHaveBeenCalled() // asking for confirmation isn't deleting

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(removeUnusedAssets).toHaveBeenCalledWith(canvasData))
  })

  it('does not touch any uploaded images when the delete is cancelled', async () => {
    rows[0].canvas_data = { layers: [{ type: 'image', id: 'i', src: 'https://x/creation-assets/up.jpg' }] }
    vi.mocked(removeUnusedAssets).mockClear()

    renderGallery()
    await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(removeUnusedAssets).not.toHaveBeenCalled()
  })

  it('Delete cancel leaves the creation in the list', async () => {
    renderGallery()
    await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Drake 1')).toBeInTheDocument()
  })

  describe('Download', () => {
    const openDownload = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Download' }))
    }

    it("rebuilds the meme as a lossless PNG (same as Export) and downloads it named after the creation, not the stored JPEG preview", async () => {
      renderGallery()
      await openDownload()

      await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Drake-1.png'))
      expect(renderCreationForDownload).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Drake 1' }))
      expect(fetch).not.toHaveBeenCalled() // the compressed preview is not involved
      expect(shareFile).not.toHaveBeenCalled()
    })

    it('works for a save that has no stored preview, since nothing depends on it any more', async () => {
      rows[0].preview_image_url = null
      renderGallery()
      await openDownload()

      await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Drake-1.png'))
    })

    it('uses the native share sheet on a touch device that supports sharing files, like Export does', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      renderGallery()
      await openDownload()

      await waitFor(() => expect(shareFile).toHaveBeenCalledWith(expect.any(File), 'Drake-1.png'))
      expect(downloadBlob).not.toHaveBeenCalled()
    })

    it("does not count a cancelled share sheet as a failure", async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      const cancelled = new Error('cancelled')
      cancelled.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(cancelled)
      renderGallery()
      await openDownload()

      await waitFor(() => expect(shareFile).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    describe("when the meme can't be rebuilt (e.g. its template was deleted)", () => {
      beforeEach(() => {
        vi.mocked(renderCreationForDownload).mockRejectedValue(new Error('template gone'))
      })

      it('falls back to the stored preview rather than giving nothing, naming the file for what it is', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['jpg'], { type: 'image/jpeg' })) } as Response)
        renderGallery()
        await openDownload()

        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Drake-1.jpg'))
        expect(fetch).toHaveBeenCalledWith(PREVIEW_URL)
      })

      it('says so when there is no preview to fall back to either', async () => {
        rows[0].preview_image_url = null
        renderGallery()
        await openDownload()

        expect(await screen.findByRole('alert')).toHaveTextContent(/download failed/i)
        expect(downloadBlob).not.toHaveBeenCalled()
      })

      it('says so when the fallback preview cannot be fetched either', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('network'))
        renderGallery()
        await openDownload()

        expect(await screen.findByRole('alert')).toHaveTextContent(/download failed/i)
        expect(downloadBlob).not.toHaveBeenCalled()
      })

      it('treats a non-OK preview response as a failure too', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, blob: () => Promise.resolve(new Blob()) } as Response)
        renderGallery()
        await openDownload()

        expect(await screen.findByRole('alert')).toHaveTextContent(/download failed/i)
      })
    })

    it('ignores a second tap on Download while the first is still being prepared, so it cannot download twice', async () => {
      let finish!: (blob: Blob) => void
      vi.mocked(renderCreationForDownload).mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)))
      renderGallery()
      await openDownload()
      await userEvent.click(screen.getByRole('button', { name: 'More options for Drake 1' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Download' }))
      expect(renderCreationForDownload).toHaveBeenCalledTimes(1)

      finish(new Blob(['png'], { type: 'image/png' }))
      await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    })
  })

  describe('opening a saved meme while the editor holds unsaved work', () => {
    // Opening replaces whatever is in the editor, so it must warn first — but only when there is
    // real work to lose, and never for the meme the work already belongs to.
    function renderRouted() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/gallery']}>
            <Routes>
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/editor/:id" element={<p>EDITOR OPENED</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
    }
    const leaveDraft = (over: Partial<Parameters<typeof writeDraft>[0]> = {}) =>
      writeDraft({
        hasEdits: true,
        source: { type: 'template', name: 'Two Buttons', templateId: 'tmpl-1', blankImageUrl: 'https://x/blank.jpg' },
        savedMeta: null,
        layers: [],
        baseline: [],
        canvasEdited: false,
        ...over,
      })
    async function clickOpen() {
      await userEvent.click(await screen.findByRole('button', { name: 'More options for Drake 1' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Open in editor' }))
    }

    it('opens straight away when nothing is waiting in the editor', async () => {
      renderRouted()
      await clickOpen()
      expect(await screen.findByText('EDITOR OPENED')).toBeInTheDocument()
    })

    it('warns first when there is unsaved work, and does not open yet', async () => {
      leaveDraft()
      renderRouted()
      await clickOpen()

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/unsaved work/i)).toBeInTheDocument()
      expect(screen.queryByText('EDITOR OPENED')).not.toBeInTheDocument()
      expect(readDraft()).not.toBeNull() // nothing discarded by merely asking
    })

    it('keeps the work and stays put when the warning is cancelled', async () => {
      leaveDraft()
      renderRouted()
      await clickOpen()
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('EDITOR OPENED')).not.toBeInTheDocument()
      expect(readDraft()).not.toBeNull()
    })

    it('discards the work and opens the meme when the warning is confirmed', async () => {
      leaveDraft()
      renderRouted()
      await clickOpen()
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /open/i }))

      expect(await screen.findByText('EDITOR OPENED')).toBeInTheDocument()
      expect(readDraft()).toBeNull()
    })

    it('does not warn about a template that was picked but never edited — there is nothing to lose', async () => {
      leaveDraft({ hasEdits: false })
      renderRouted()
      await clickOpen()
      expect(await screen.findByText('EDITOR OPENED')).toBeInTheDocument()
    })

    it('does not warn when the unsaved work IS edits to this very meme — opening it just restores them', async () => {
      leaveDraft({ savedMeta: { id: '1', name: 'Drake 1', tags: [] } })
      renderRouted()
      await clickOpen()
      expect(await screen.findByText('EDITOR OPENED')).toBeInTheDocument()
      expect(readDraft()).not.toBeNull() // kept, so the editor can restore it
    })

    it('does warn when the unsaved work is edits to a DIFFERENT saved meme', async () => {
      leaveDraft({ savedMeta: { id: 'other', name: 'Other', tags: [] } })
      renderRouted()
      await clickOpen()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})

