import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

  it('shows Create active by default, with My Saves as the other option', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'My Saves' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows My Saves active when already on /gallery', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'My Saves' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders routed content inside a main landmark, separate from the header', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(within(main).queryByRole('heading', { name: 'Meme Creator' })).not.toBeInTheDocument()
  })
})
