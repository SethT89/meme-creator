import { useState } from 'react'

export interface GalleryCardProps {
  creation: {
    id: string
    name: string
    tags: string[]
    exported_image_url: string | null
  }
  onDownload: (id: string) => void
  onOpen: (id: string) => void
}

export function GalleryCard({ creation, onDownload, onOpen }: GalleryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full overflow-hidden rounded-lg border border-border text-left"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <div className="h-20 bg-muted">
          {creation.exported_image_url && (
            <img src={creation.exported_image_url} alt={creation.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="p-2">
          <p className="text-sm">{creation.name}</p>
          <p className="text-xs text-muted-foreground">{creation.tags.join(', ') || 'no tags'}</p>
        </div>
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-background shadow-lg">
          <div
            className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              setMenuOpen(false)
              onDownload(creation.id)
            }}
          >
            Download
          </div>
          <div
            className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              setMenuOpen(false)
              onOpen(creation.id)
            }}
          >
            Open in editor
          </div>
        </div>
      )}
    </div>
  )
}
