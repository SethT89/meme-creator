import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreations, useDeleteCreation } from '../../lib/queries/creations'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { canShareFile, downloadBlob, isMobileOrTabletDevice, sanitizeFilename, shareFile } from '../../lib/exportDelivery'
import { GalleryCard } from './GalleryCard'

export function GalleryPage() {
  const { data: creations = [], isLoading } = useCreations()
  const deleteCreation = useDeleteCreation()
  const navigate = useNavigate()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState(false)

  const pendingDelete = creations.find((c) => c.id === pendingDeleteId)
  const pendingDeleteName = pendingDelete?.name

  // Downloads the creation's stored preview PNG — the same file its card
  // thumbnail shows — using the same delivery rule as the editor's Export
  // (native share sheet on a touch device that supports it, otherwise a
  // plain download).
  async function handleDownload(id: string) {
    const creation = creations.find((c) => c.id === id)
    if (!creation?.preview_image_url) return
    setDownloadError(false)
    try {
      const response = await fetch(creation.preview_image_url)
      if (!response.ok) throw new Error(`Preview fetch failed: ${response.status}`)
      const blob = await response.blob()
      // New previews are JPEGs; ones saved earlier are PNGs. Name the file for what it is.
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

      <div className="grid grid-cols-3 gap-3">
        {creations.map((creation) => (
          <GalleryCard
            key={creation.id}
            creation={creation}
            onDownload={handleDownload}
            onOpen={(id) => navigate(`/editor/${id}`)}
            onDelete={(id) => setPendingDeleteId(id)}
          />
        ))}
      </div>

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
