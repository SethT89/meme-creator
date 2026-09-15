import { Link, Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div>
      <header className="flex items-center justify-between p-8">
        <h1 className="text-3xl font-bold">Meme Creator</h1>
        <Link to="/gallery" className="text-sm text-muted-foreground hover:underline">
          My Creations →
        </Link>
      </header>
      <Outlet />
    </div>
  )
}
