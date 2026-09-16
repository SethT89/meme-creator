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
  const [drawerOpen, setDrawerOpen] = useState(false)

  function pick(t: { id: string; name: string; blank_image_url: string; image_width: number; image_height: number }) {
    logUsage.mutate(t.id)
    onSelectTemplate({ id: t.id, name: t.name, blankImageUrl: t.blank_image_url, imageWidth: t.image_width, imageHeight: t.image_height })
    setDrawerOpen(false)
  }

  const listContent = (
    <>
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
    </>
  )

  return (
    // A single wrapping element so this whole sidebar (toggle + drawer +
    // desktop column) is exactly one flex item in EditorPage's row. Without
    // this, the mobile toggle button's own `w-full` was computing against
    // the *entire row* (its flex-basis, as a direct sibling of the canvas
    // column) instead of a sidebar-sized area — it claimed all the row's
    // width for itself and left the canvas at 0px. Shrink-to-fit content
    // sizing on this wrapper (no explicit width) is exactly right: narrow
    // (just the toggle button) on mobile, sm:w-56 on desktop.
    <div className="shrink-0 sm:h-full sm:w-56">
      {/* Mobile: a toggle that expands the list as a slide-out overlay
          instead of permanently occupying layout width. Desktop keeps the
          permanent column; both render the same listContent underneath. */}
      <button
        type="button"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((open) => !open)}
        className="mb-2 w-full rounded-md border border-border p-2 text-left text-sm font-medium sm:hidden"
      >
        {drawerOpen ? '✕ Close Templates' : '☰ Templates'}
      </button>
      {drawerOpen && (
        <div className="fixed inset-0 z-10 flex sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-64 flex-col bg-background p-3 shadow-lg">{listContent}</div>
        </div>
      )}

      <div className="hidden h-full flex-col sm:flex">{listContent}</div>

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
