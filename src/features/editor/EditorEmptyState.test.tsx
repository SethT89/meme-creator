import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorEmptyState } from './EditorEmptyState'

describe('EditorEmptyState', () => {
  it('calls onUpload when the dropzone is clicked', async () => {
    const onUpload = vi.fn()
    render(<EditorEmptyState onUpload={onUpload} onSelectTemplate={vi.fn()} />)
    await userEvent.click(screen.getByText(/drag an image here/i))
    expect(onUpload).toHaveBeenCalled()
  })

  it('calls onSelectTemplate with the template name when a tile is clicked', async () => {
    const onSelectTemplate = vi.fn()
    render(<EditorEmptyState onUpload={vi.fn()} onSelectTemplate={onSelectTemplate} />)
    await userEvent.click(screen.getByText('Drake'))
    expect(onSelectTemplate).toHaveBeenCalledWith('Drake')
  })
})
