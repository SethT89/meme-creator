import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreations, useDeleteCreation } from '../../lib/queries/creations'
import type { CreationRow } from '../../lib/queries/creations'
import { renderCreationForDownload } from '../../lib/downloadCreation'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { canShareFile, downloadBlob, isMobileOrTabletDevice, sanitizeFilename, shareFile } from '../../lib/exportDelivery'
import { clearDraft, readDraft } from '../../lib/editorDraft'
import { GalleryCard } from './GalleryCard'

export function GalleryPage() {
  const { data: creations = [], isLoading } = useCreations()
  const deleteCreation = useDeleteCreation()
  const navigate = useNavigate()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState(false)
  // A saved meme waiting on "discard your unsaved work?" before it opens.
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)

  // Opening a saved meme replaces whatever is in the editor. If that is unsaved work worth
  // keeping, ask first — but not for a template that was only picked (nothing to lose), and
  // not when the work IS edits to this very meme (opening it just restores them).
  function handleOpen(id: string) {
    const draft = readDraft()
    if (draft?.hasEdits && draft.savedMeta?.id !== id) setPendingOpenId(id)
    else navigate(`/editor/${id}`)
  }

  function confirmOpen() {
    if (pendingOpenId) {
      clearDraft()
      navigate(`/editor/${pendingOpenId}`)
    }
    setPendingOpenId(null)
  }

  const pendingDelete = creations.find((c) => c.id === pendingDeleteId)
  const pendingDeleteName = pendingDelete?.name

  // Downloads the creation's stored preview PNG — the same file its card
  // thumbnail shows — using the same delivery rule as the editor's Export
  // (native share sheet on a touch device that supports it, otherwise a
  // plain download).
  // The file to hand over: the meme rebuilt from its saved data as a lossless full-size PNG — the same
  // render as the Export button. (It used to be the stored preview, a compressed JPEG whose text picked
  // up JPEG noise.) If it can't be rebuilt — say its template was deleted — the stored preview is better
  // than nothing.
  async function fileForDownload(creation: CreationRow): Promise<Blob> {
    try {
      return await renderCreationForDownload(creation)
    } catch (renderError) {
      if (!creation.preview_image_url) throw renderError
      const response = await fetch(creation.preview_image_url)
      if (!response.ok) throw new Error(`Preview fetch failed: ${response.status}`, { cause: renderError })
      return response.blob()
    }
  }

  // Rebuilding a big meme takes a moment, so a second tap while one is under way must not start another.
  const downloading = useRef(false)

  async function handleDownload(id: string) {
    const creation = creations.find((c) => c.id === id)
    if (!creation || downloading.current) return
    downloading.current = true
    setDownloadError(false)
    try {
      const blob = await fileForDownload(creation)
      // The rebuilt file is a PNG; only the fallback preview can be a JPEG. Name the file for what it is.
      const isJpeg = blob.type === 'image/jpeg'
      const filename = `${sanitizeFilename(creation.name)}.${isJpeg ? 'jpg' : 'png'}`
      const file = new File([blob], filename, { type: isJpeg ? 'image/jpeg' : 'image/png' })
      if (isMobileOrTabletDevice() && canShareFile(file)) {
        try {
          await shareFile(file, filename)
        } catch (err) {
          // Cancelling the native share sheet rejects with AbortError — not a failure.
          if ((err as Error)?.name !== 'AbortError') throw err
        }
      } else {
        downloadBlob(blob, filename)
      }
    } catch {
      setDownloadError(true)
    } finally {
      downloading.current = false
    }
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      deleteCreation.mutate({
        id: pendingDeleteId,
        previewImageUrl: pendingDelete?.preview_image_url ?? null,
        // So the delete can also free the images this creation uploaded.
        canvasData: pendingDelete?.canvas_data ?? null,
      })
    }
    setPendingDeleteId(null)
  }

  return (
    <section className="max-w-2xl">
      <h2 className="text-xl font-semibold">My Creations</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {isLoading ? 'Loading…' : `${creations.length} ${creations.length === 1 ? 'meme' : 'memes'} saved`}
      </p>

      {downloadError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          Download failed — try again.
        </p>
      )}

      {!isLoading && creations.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing saved yet — go make something.</p>
      )}

      {/* 2 columns on a phone: 3 made each card ~100px wide, too narrow for a
          readable name or its tags. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {creations.map((creation) => (
          <GalleryCard
            key={creation.id}
            creation={creation}
            onDownload={handleDownload}
            onOpen={handleOpen}
            onDelete={(id) => setPendingDeleteId(id)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingOpenId !== null}
        title="Open this meme?"
        message="You have unsaved work in the editor. Opening this meme will discard it. This can't be undone."
        confirmLabel="Discard and Open"
        onConfirm={confirmOpen}
        onCancel={() => setPendingOpenId(null)}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this creation?"
        message={`"${pendingDeleteName}" will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  )
}
