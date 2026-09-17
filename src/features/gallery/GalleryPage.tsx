import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreations, useDeleteCreation } from '../../lib/queries/creations'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { GalleryCard } from './GalleryCard'

export function GalleryPage() {
  const { data: creations = [], isLoading } = useCreations()
  const deleteCreation = useDeleteCreation()
  const navigate = useNavigate()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const pendingDeleteName = creations.find((c) => c.id === pendingDeleteId)?.name

  function confirmDelete() {
    if (pendingDeleteId) deleteCreation.mutate(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <section className="max-w-2xl">
      <h2 className="text-xl font-semibold">My Creations</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {isLoading ? 'Loading…' : `${creations.length} ${creations.length === 1 ? 'meme' : 'memes'} saved`}
      </p>

      {!isLoading && creations.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing saved yet — go make something.</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {creations.map((creation) => (
          <GalleryCard
            key={creation.id}
            creation={creation}
            onDownload={() => {
              // Real download requires real canvas export rendering, which is
              // out of scope for this plan (see the deferred list in the spec).
            }}
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
