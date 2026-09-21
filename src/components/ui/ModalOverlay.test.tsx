import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalOverlay } from './ModalOverlay'

describe('ModalOverlay', () => {
  it('is a modal dialog with the scrim behind its content', () => {
    render(
      <ModalOverlay aria-label="Example">
        <p>Hello</p>
      </ModalOverlay>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Example' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('fixed', 'inset-0', 'bg-black/50')
    expect(dialog).toContainElement(screen.getByText('Hello'))
  })

  it('sits above every other on-page layer (the + button, toolbars, the template drawer)', () => {
    render(<ModalOverlay aria-label="Example">x</ModalOverlay>)
    expect(screen.getByRole('dialog')).toHaveClass('z-60')
  })

  it('renders directly under <body>, so no parent can trap it in a lower stacking context', () => {
    render(
      <div data-testid="page" style={{ transform: 'translateX(0)' }}>
        <ModalOverlay aria-label="Example">x</ModalOverlay>
      </div>,
    )
    expect(screen.getByRole('dialog').parentElement).toBe(document.body)
    expect(screen.getByTestId('page')).not.toContainElement(screen.getByRole('dialog'))
  })

  it('locks page scrolling while open and releases it when it goes away', () => {
    const { unmount } = render(<ModalOverlay aria-label="Example">x</ModalOverlay>)
    expect(document.body.style.position).toBe('fixed')
    unmount()
    expect(document.body.style.position).toBe('')
  })

  it('reports a click on the scrim itself, but not a click inside the content', async () => {
    const onScrimClick = vi.fn()
    render(
      <ModalOverlay aria-label="Example" onScrimClick={onScrimClick}>
        <button>Inside</button>
      </ModalOverlay>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(onScrimClick).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('dialog'))
    expect(onScrimClick).toHaveBeenCalledTimes(1)
  })
})
