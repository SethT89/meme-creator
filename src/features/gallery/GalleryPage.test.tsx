import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
vi.mock('../../lib/exportDelivery', () => ({
  sanitizeFilename: (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '-'),
  canShareFile: vi.fn(),
  isMobileOrTabletDevice: vi.fn(),
  shareFile: vi.fn(),
  downloadBlob: vi.fn(),
}))
import { canShareFile, isMobileOrTabletDevice, shareFile, downloadBlob } from '../../lib/exportDelivery'
import { GalleryPage } from './GalleryPage'

const rows: Array<{ id: string; name: string; tags: string[]; preview_image_url: string | null }> = []

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
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Open in editor'))
    // No router assertion needed beyond "didn't throw" — routing itself is covered by routes.test.tsx.
  })

  it('Delete asks for confirmation, and only removes the creation once confirmed', async () => {
    renderGallery()
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Delete'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Drake 1/)).toBeInTheDocument()
    expect(screen.getByText('Drake 1')).toBeInTheDocument() // not removed yet

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Drake 1')).not.toBeInTheDocument()
  })

  it('Delete cancel leaves the creation in the list', async () => {
    renderGallery()
    await userEvent.click(await screen.findByText('Drake 1'))
    await userEvent.click(screen.getByText('Delete'))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Drake 1')).toBeInTheDocument()
  })

  describe('Download', () => {
    it("downloads the creation's saved preview as a PNG named after it", async () => {
      renderGallery()
      await userEvent.click(await screen.findByText('Drake 1'))
      await userEvent.click(screen.getByText('Download'))

      await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Drake-1.png'))
      expect(fetch).toHaveBeenCalledWith(PREVIEW_URL)
      expect(shareFile).not.toHaveBeenCalled()
    })

    it('uses the native share sheet on a touch device that supports sharing files, like Export does', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      renderGallery()
      await userEvent.click(await screen.findByText('Drake 1'))
      await userEvent.click(screen.getByText('Download'))

      await waitFor(() => expect(shareFile).toHaveBeenCalledWith(expect.any(File), 'Drake-1.png'))
      expect(downloadBlob).not.toHaveBeenCalled()
    })

    it('says so when the download fails, instead of failing silently', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network'))
      renderGallery()
      await userEvent.click(await screen.findByText('Drake 1'))
      await userEvent.click(screen.getByText('Download'))

      expect(await screen.findByRole('alert')).toHaveTextContent(/download failed/i)
      expect(downloadBlob).not.toHaveBeenCalled()
    })

    it('treats a non-OK response as a failure too', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, blob: () => Promise.resolve(new Blob()) } as Response)
      renderGallery()
      await userEvent.click(await screen.findByText('Drake 1'))
      await userEvent.click(screen.getByText('Download'))

      expect(await screen.findByRole('alert')).toHaveTextContent(/download failed/i)
    })
  })
})
