import { Link, Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-8">
        <h1 className="text-3xl font-bold">Meme Creator</h1>
        <Link to="/gallery" className="text-sm text-muted-foreground hover:underline">
          My Creations →
        </Link>
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
