import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Clear canvas?"
        message="This will discard your current work."
        confirmLabel="Clear"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the title, message, and confirm label when open', () => {
    render(
      <ConfirmDialog
        open
        title="Clear canvas?"
        message="This will discard your current work."
        confirmLabel="Clear"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Clear canvas?')).toBeInTheDocument()
    expect(screen.getByText('This will discard your current work.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Do it" onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Do it" onConfirm={vi.fn()} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('locks the page behind it while open, and releases it when closed', () => {
    const props = { title: 'Clear canvas?', message: 'Sure?', confirmLabel: 'Clear', onConfirm: vi.fn(), onCancel: vi.fn() }
    const { rerender } = render(<ConfirmDialog open {...props} />)
    expect(document.body.style.position).toBe('fixed')
    rerender(<ConfirmDialog open={false} {...props} />)
    expect(document.body.style.position).toBe('')
  })

  it('layers above the canvas + button and every toolbar', () => {
    render(<ConfirmDialog open title="t" message="m" confirmLabel="ok" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveClass('z-60')
  })
})
