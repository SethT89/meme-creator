import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTemplatesByUsage, useLogTemplateUsage } from '../../lib/queries/templates'
import { searchTemplates } from '../../lib/templateSearch'
import { prefetchImage } from '../../lib/prefetchImage'
import { useScrollLock } from '../../lib/useScrollLock'
import { usePresence } from '../../lib/usePresence'
import { TemplateSearchInput } from './TemplateSearchInput'
import { Button } from '../../components/ui/button'

export interface SelectedTemplate {
  id: string
  name: string
  blankImageUrl: string
  // The small thumbnail the list already loaded: the canvas shows it instantly
  // as a placeholder while the full-size blankImageUrl downloads.
  thumbnailUrl?: string | null
  imageWidth: number
  imageHeight: number
}

export interface TemplateSidebarProps {
  selectedTemplateId: string | undefined
  onSelectTemplate: (template: SelectedTemplate) => void
  // Whether the phone's slide-out drawer is open. The page owns this, because the button that
  // toggles it (TemplatesButton) sits in the toolbar row beside Export, not inside the sidebar.
  // Closed when not given.
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}

const ignoreDrawerChange = () => {}

// How long the drawer takes to slide out. It stays mounted this long after closing, so it must
// match the closing `duration-200` on the panel and scrim below.
const DRAWER_EXIT_MS = 200

// The phone's "Templates" button: a plain outlined button, the same look and height as Export
// beside it (its width comes from its label and the button's padding). Below `sm` only —
// desktop shows the templates as a permanent column instead.
export function TemplatesButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={onToggle} className="sm:hidden">
      Templates
    </Button>
  )
}

export function TemplateSidebar({
  selectedTemplateId,
  onSelectTemplate,
  drawerOpen = false,
  onDrawerOpenChange = ignoreDrawerChange,
}: TemplateSidebarProps) {
  const { data: templates = [] } = useTemplatesByUsage()
  const logUsage = useLogTemplateUsage()
  const [query, setQuery] = useState('')
  const setDrawerOpen = onDrawerOpenChange
  // The page must not scroll behind the open drawer.
  useScrollLock(drawerOpen)
  // Slides in and out rather than popping: stays mounted while the exit plays.
  const { mounted: drawerMounted, shown: drawerShown } = usePresence(drawerOpen, DRAWER_EXIT_MS)
  // The drawer only exists below the `sm` breakpoint (640px). If the screen grows
  // past it while open (rotating a phone), the drawer disappears — close it too,
  // or the page would stay frozen behind something that is no longer there.
  useEffect(() => {
    const wide = window.matchMedia?.('(min-width: 640px)')
    if (!wide) return
    const closeWhenWide = (e: { matches: boolean }) => {
      if (e.matches) setDrawerOpen(false)
    }
    wide.addEventListener('change', closeWhenWide)
    return () => wide.removeEventListener('change', closeWhenWide)
  }, [setDrawerOpen])
  // `templates` arrives sorted by usage, and searchTemplates keeps that order
  // between equally good matches, so popular templates lead among ties.
  const visible = useMemo(() => searchTemplates(templates, query), [templates, query])
  const searching = query.trim() !== ''
  const status = !searching ? '' : visible.length === 0 ? 'No memes match' : `${visible.length} ${visible.length === 1 ? 'meme' : 'memes'}`

  function pick(t: {
    id: string
    name: string
    blank_image_url: string
    thumbnail_url?: string | null
    image_width: number
    image_height: number
  }) {
    logUsage.mutate(t.id)
    onSelectTemplate({
      id: t.id,
      name: t.name,
      blankImageUrl: t.blank_image_url,
      thumbnailUrl: t.thumbnail_url ?? null,
      imageWidth: t.image_width,
      imageHeight: t.image_height,
    })
    setDrawerOpen(false)
  }

  function focusCard(card: HTMLElement | null | undefined) {
    card?.focus()
  }

  // Arrow keys walk the result cards; ArrowUp from the first one goes back to
  // the search box (the box is the list's previous sibling).
  function handleListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-template-card]'))
    const current = cards.indexOf(document.activeElement as HTMLElement)
    if (current === -1) return
    e.preventDefault()
    if (e.key === 'ArrowDown') focusCard(cards[Math.min(current + 1, cards.length - 1)])
    else if (current === 0) e.currentTarget.previousElementSibling?.querySelector('input')?.focus()
    else focusCard(cards[current - 1])
  }

  const listContent = (
    <>
      <TemplateSearchInput
        value={query}
        onChange={setQuery}
        onSubmit={() => {
          // Enter picks the top result — but only for a real query, so a stray
          // Enter in an empty box doesn't silently load the most-used template.
          if (searching && visible[0]) pick(visible[0])
        }}
        onArrowDown={(input) => focusCard(input.parentElement?.nextElementSibling?.querySelector<HTMLElement>('[data-template-card]'))}
      />

      {/* pr-3 leaves a gutter to the right of the cards for the scrollbar to
          live in — the cards are w-full, so without it a scrollbar (overlay
          ones on macOS, or a classic one that appears) sits on top of the
          card text. The column's own width is unchanged, so the cards are
          12px narrower rather than the canvas losing room.
          min-h-0 flex-1 alone doesn't get this div a real internal
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
          search box + margins), measured live; same "wrong shape of
          formula" trap as CanvasFab's image sizing applies here too if this
          ever needs adjusting — it must scale at 1x viewport height minus a
          constant, not some fraction of vh. Cards themselves are never
          resized to fit more in view — this scrolls instead, at a fixed
          card size. Not applied below sm: the mobile drawer is a fixed
          h-full overlay already, not subject to this. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-3 sm:max-h-[calc(100vh-238px)]" onKeyDown={handleListKeyDown}>
        {/* Always rendered (a live region has to exist before its text changes
            to be announced). Out of flow, so it doesn't disturb the list.
            aria-live rather than role="status": the app's toasts already use
            role="status", and screens/tests locate them by it. */}
        <p aria-live="polite" data-search-status className="sr-only">
          {status}
        </p>
        {searching && visible.length === 0 && (
          <div className="px-1 py-2 text-sm text-muted-foreground">
            <p>No memes match "{query.trim()}".</p>
            <button type="button" onClick={() => setQuery('')} className="mt-1 underline hover:text-foreground">
              Show all memes
            </button>
          </div>
        )}
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            data-template-card
            onClick={() => pick(t)}
            // The list itself only loads small thumbnails, so start fetching
            // the full image the moment there's a sign of intent — hover or
            // keyboard focus on desktop, the press itself on touch — instead
            // of when the click lands. Usually that hides most of the wait.
            onPointerEnter={() => prefetchImage(t.blank_image_url)}
            onPointerDown={() => prefetchImage(t.blank_image_url)}
            onFocus={() => prefetchImage(t.blank_image_url)}
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
                // The 56px card shows a small thumbnail (~5 KB), not the full
                // image (~160 KB+): the list loads every template at once, so
                // this is what keeps visitors' data use (Supabase egress) low
                // as the library grows. Templates without one yet fall back to
                // the full image. The canvas still loads the full image on pick.
                style={{ backgroundImage: `url(${t.thumbnail_url ?? t.blank_image_url})` }}
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
    // Below `sm` this wrapper is `display: contents`: on a phone the sidebar is only the slide-out
    // drawer (fixed, so out of flow) and its toggle lives in the page's toolbar row, so the
    // wrapper must take no room — as a real box it would add an empty flex item, and the page's
    // gap would open a blank strip above the canvas. From `sm` up it is the permanent sidebar
    // column, exactly one flex item in EditorPage's row (sm:w-56).
    <div className="contents sm:block sm:h-full sm:w-56 sm:shrink-0">
      {drawerMounted && (
        // z-30: above the canvas's floating + button (z-10), which comes later in
        // the page and would otherwise paint over the drawer. Below dialogs (z-60)
        // and toasts (z-70) — see lib/stacking.ts for the whole scale.
        // pointer-events-none once it starts closing: the fading overlay must not eat taps meant
        // for the page underneath.
        <div className={`fixed inset-0 z-30 flex sm:hidden ${drawerShown ? '' : 'pointer-events-none'}`}>
          {/* touch-none: dragging on the dark strip must not scroll anything. Fades with the panel's
              slide: a touch slower coming in (300ms) than going out (200ms). */}
          <div
            className={`absolute inset-0 touch-none bg-black/50 transition-opacity ease-out motion-reduce:transition-none ${
              drawerShown ? 'opacity-100 duration-300' : 'opacity-0 duration-200'
            }`}
            onClick={() => setDrawerOpen(false)}
          />
          {/* Nearly the full width, leaving just a slim strip of scrim to tap to
              close — the old fixed 256px felt cramped on a 375px+ screen. Slides in from the left;
              a transform (not left/width), so it animates smoothly on the GPU. */}
          <div
            className={`relative flex h-full w-[calc(100vw-3rem)] max-w-md flex-col bg-background p-3 shadow-lg transition-transform motion-reduce:transition-none ${
              drawerShown ? 'translate-x-0 duration-300 ease-out' : '-translate-x-full duration-200 ease-in'
            }`}
          >
            {listContent}
          </div>
        </div>
      )}

      <div className="hidden h-full flex-col sm:flex">{listContent}</div>
    </div>
  )
}
