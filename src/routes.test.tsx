import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'

describe('routes', () => {
  it('renders the gallery page at /', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('renders the editor page at /editor/:creationId', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/editor/abc123'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument()
  })
})
