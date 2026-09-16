import { useState } from 'react'
import { useTemplatesByUsage, useLogTemplateUsage } from '../../lib/queries/templates'
import { SearchTemplatesModal } from './SearchTemplatesModal'

export interface SelectedTemplate {
  id: string
  name: string
  blankImageUrl: string
  imageWidth: number
  imageHeight: number
}

export interface TemplateSidebarProps {
  selectedTemplateId: string | undefined
  onSelectTemplate: (template: SelectedTemplate) => void
}

export function TemplateSidebar({ selectedTemplateId, onSelectTemplate }: TemplateSidebarProps) {
  const { data: templates = [] } = useTemplatesByUsage()
  const logUsage = useLogTemplateUsage()
  const [searchOpen, setSearchOpen] = useState(false)

  function pick(t: { id: string; name: string; blank_image_url: string; image_width: number; image_height: number }) {
    logUsage.mutate(t.id)
    onSelectTemplate({ id: t.id, name: t.name, blankImageUrl: t.blank_image_url, imageWidth: t.image_width, imageHeight: t.image_height })
  }

  return (
    <div className="flex h-full w-56 shrink-0 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t)}
            className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm ${
              selectedTemplateId === t.id ? 'bg-muted' : 'hover:bg-muted'
            }`}
          >
            <span
              className="h-10 w-10 shrink-0 rounded bg-muted bg-cover bg-center"
              style={{ backgroundImage: `url(${t.blank_image_url})` }}
            />
            {t.name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="mt-2 w-full rounded-md border border-border p-2 text-sm font-medium hover:bg-muted"
      >
        Search All Memes
      </button>

      <SearchTemplatesModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTemplate={(t) => {
          pick({ id: t.id, name: t.name, blank_image_url: t.blankImageUrl, image_width: t.imageWidth, image_height: t.imageHeight })
          setSearchOpen(false)
        }}
      />
    </div>
  )
}
