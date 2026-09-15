import { useNavigate } from 'react-router-dom'
import { useCreations } from '../../lib/queries/creations'
import { GalleryCard } from './GalleryCard'

export function GalleryPage() {
  const { data: creations = [], isLoading } = useCreations()
  const navigate = useNavigate()

  return (
    <section className="p-8">
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
          />
        ))}
      </div>
    </section>
  )
}
