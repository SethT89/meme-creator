import { Link, Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between p-8">
        <h1 className="text-3xl font-bold">Meme Creator</h1>
        <Link to="/gallery" className="text-sm text-muted-foreground hover:underline">
          My Creations →
        </Link>
      </header>

      {/* The floating content panel — flat header sits on the page backdrop,
          everything routed renders inside this elevated surface instead. */}
      <main className="mx-4 mb-4 min-h-[60vh] rounded-2xl bg-background shadow-[0_14px_32px_-10px_rgba(15,23,42,0.25)] sm:mx-8 sm:mb-8">
        <Outlet />
      </main>
    </div>
  )
}
