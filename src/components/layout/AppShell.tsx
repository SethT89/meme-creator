import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SegmentedControl } from '../ui/segmented-control'

const SECTION_OPTIONS = [
  { value: 'new', label: 'Create' },
  { value: 'saved', label: 'My Saves' },
]

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()

  // Anything under / (including /editor/:id) counts as "Create" — that's
  // the creation flow. /gallery is the only "My Saves" route.
  const activeSection = location.pathname === '/gallery' ? 'saved' : 'new'

  return (
    <div className="flex min-h-screen flex-col">
      {/* Stacked (title above toggle) below the sm breakpoint — a 3-column grid
          truly centers the toggle regardless of title width on wider screens,
          but a fixed-width title's intrinsic size can overlap a narrow center
          column below ~640px, so it falls back to a simple centered stack there. */}
      <header className="flex flex-col items-center gap-3 p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:p-8">
        <h1 className="min-w-0 text-2xl font-bold sm:justify-self-start sm:text-3xl">Meme Creator</h1>
        <div className="sm:justify-self-center">
          <SegmentedControl
            options={SECTION_OPTIONS}
            value={activeSection}
            onChange={(value) => navigate(value === 'saved' ? '/gallery' : '/')}
          />
        </div>
        <div className="hidden sm:block" />
      </header>

      {/* The floating content panel — flat header sits on the page backdrop,
          everything routed renders inside this elevated surface instead.
          flex-1 (parent is flex-col) fills all remaining viewport height/width
          down to the same margins, rather than guessing a fixed min-height;
          if content inside grows taller than that, the panel (and page) just
          grows with it instead of clipping. */}
      <main className="mx-2 mb-2 flex-1 rounded-2xl bg-background shadow-[0_14px_32px_-10px_rgba(15,23,42,0.25)] sm:mx-8 sm:mb-8">
        {/* p-8 (not also max-w-2xl) is what's shared across every page now —
            that's what keeps the left-edge position consistent when
            switching the header toggle, which is all the earlier fix for
            this was actually about. Width is each page's own decision again:
            Gallery keeps a centered max-w-2xl column, the builder page needs
            the full available width for its sidebar+canvas layout. flex
            flex-col h-full lets a page opt into filling all remaining
            height (flex-1 on its own root) without forcing that on pages
            that don't need it. */}
        {/* Tighter on a phone (p-3 inside mx-2) — the desktop p-8 inside mx-8 would
            eat ~96px of a 375px screen. The editor's canvas width formulas
            (EditorPage) budget for exactly these numbers; change them together. */}
        <div className="flex h-full flex-col p-3 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
