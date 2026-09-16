import { useState } from 'react'
import { useTemplates } from '../../lib/queries/templates'
import type { SelectedTemplate } from './TemplateSidebar'

export interface SearchTemplatesModalProps {
  open: boolean
  onClose: () => void
  onSelectTemplate: (template: SelectedTemplate) => void
}

export function SearchTemplatesModal({ open, onClose, onSelectTemplate }: SearchTemplatesModalProps) {
  const { data: templates = [] } = useTemplates()
  const [search, setSearch] = useState('')

  if (!open) return null

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-[36rem] max-w-[90vw] flex-col rounded-lg bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <input
            type="text"
            placeholder="Search all memes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
          />
          <button type="button" aria-label="Close" onClick={onClose} className="px-2 text-sm text-muted-foreground">
            ✕
          </button>
        </div>

        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No templates match "{search}".</p>}

        <div className="grid grid-cols-4 gap-2.5 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                onSelectTemplate({
                  id: t.id,
                  name: t.name,
                  blankImageUrl: t.blank_image_url,
                  imageWidth: t.image_width,
                  imageHeight: t.image_height,
                })
              }
              className="flex aspect-square items-end overflow-hidden rounded-md bg-muted bg-cover bg-center p-1.5 text-left text-xs font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
              style={{ backgroundImage: `url(${t.blank_image_url})` }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
