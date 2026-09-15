import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SegmentedControl } from '../ui/segmented-control'

const SECTION_OPTIONS = [
  { value: 'new', label: 'New Meme' },
  { value: 'saved', label: 'My Saved Memes' },
]

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()

  // Anything under / (including /editor/:id) counts as "New Meme" — that's
  // the creation flow. /gallery is the only "My Saved Memes" route.
  const activeSection = location.pathname === '/gallery' ? 'saved' : 'new'

  return (
    <div className="flex min-h-screen flex-col">
      {/* Stacked (title above toggle) below the sm breakpoint — a 3-column grid
          truly centers the toggle regardless of title width on wider screens,
          but a fixed-width title's intrinsic size can overlap a narrow center
          column below ~640px, so it falls back to a simple centered stack there. */}
      <header className="flex flex-col items-center gap-4 p-8 sm:grid sm:grid-cols-3">
        <h1 className="min-w-0 text-3xl font-bold sm:justify-self-start">Meme Creator</h1>
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
      <main className="mx-4 mb-4 flex-1 rounded-2xl bg-background shadow-[0_14px_32px_-10px_rgba(15,23,42,0.25)] sm:mx-8 sm:mb-8">
        <Outlet />
      </main>
    </div>
  )
}
