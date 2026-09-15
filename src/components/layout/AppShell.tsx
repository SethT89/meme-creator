import { Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div>
      <header className="p-8">
        <h1 className="text-3xl font-bold">Meme Creator</h1>
      </header>
      <Outlet />
    </div>
  )
}
