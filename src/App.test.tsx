import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('renders the app heading', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Meme Creator' })).toBeInTheDocument()
  })

  it('renders a link to the gallery', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /my creations/i })).toHaveAttribute('href', '/gallery')
  })
})
