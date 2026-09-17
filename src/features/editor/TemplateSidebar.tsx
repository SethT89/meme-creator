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
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="mb-2 w-full shrink-0 rounded-md border border-border p-2 text-sm font-medium hover:bg-muted"
      >
        Search All Memes
      </button>

      {/* min-h-0 flex-1 alone doesn't get this div a real internal
          scrollbar here — the app's root uses min-h-screen (a floor, not a
          cap), and a flex container sized that way asks each descendant for
          its own natural/max-content size when computing its own height,
          regardless of flex-grow/min-height on the way down (confirmed
          live: even overflow:hidden + min-height:0 on every ancestor up to
          <main> didn't stop the page from growing to fit 10 templates —
          only a *hard*, non-flex-grow height cap on some element in the
          chain breaks that). sm:max-h-[calc(100vh-238px)] is that cap,
          scoped to just this list (not a page-wide layout change, since
          only this panel needs to scroll independently — the page growing
          for other tall content is otherwise still fine). 238px = the
          fixed chrome above and below this list (header + padding + the
          Search button + margins), measured live; same "wrong shape of
          formula" trap as CanvasFab's image sizing applies here too if this
          ever needs adjusting — it must scale at 1x viewport height minus a
          constant, not some fraction of vh. Cards themselves are never
          resized to fit more in view — this scrolls instead, at a fixed
          card size. Not applied below sm: the mobile drawer is a fixed
          h-full overlay already, not subject to this. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto sm:max-h-[calc(100vh-238px)]">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t)}
            // Selected is its own persistent indicator (blue border), kept
            // deliberately separate from hover/active — those two use a
            // plain background change so they read as momentary, ordinary
            // button feedback rather than the card looking permanently
            // "pressed in" once picked. active: is inherently momentary
            // (only applies while the mouse button is actually down), so
            // clicking never leaves the card visually stuck.
            className={`flex w-full scale-100 flex-col rounded-md border p-2 text-left text-sm shadow-sm outline-none transition-transform hover:bg-muted focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:scale-[0.98] active:bg-border ${
              selectedTemplateId === t.id ? 'border-blue-500' : 'border-border'
            }`}
          >
            <div className="flex w-full items-center gap-3">
              <span
                className="h-14 w-14 shrink-0 rounded bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url(${t.blank_image_url})` }}
              />
              {t.name}
            </div>
            {/* Expands only the selected card, only when it actually has a
                summary — most templates don't yet (description is nullable,
                hand-written per template as they get one). */}
            {selectedTemplateId === t.id && t.description && (
              <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>
            )}
          </button>
        ))}
      </div>
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
