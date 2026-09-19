import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveDialog } from './SaveDialog'

describe('SaveDialog', () => {
  it('is hidden when closed', () => {
    render(
      <SaveDialog
        open={false}
        title="Save to My Creations"
        defaultName="Drake 1"
        defaultTags={[]}
        existingCreations={[]}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pre-fills the name and lets the user add a tag, then saves both', async () => {
    const onSave = vi.fn()
    render(
      <SaveDialog
        open
        title="Save to My Creations"
        defaultName="Drake 1"
        defaultTags={['work']}
        existingCreations={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    expect(screen.getByLabelText('Name')).toHaveValue('Drake 1')
    expect(screen.getByText('work')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('add a tag...'), 'funny{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith('Drake 1', ['work', 'funny'])
  })

  it('suggests previously-used tags as you type, and clicking one adds it as a chip', async () => {
    render(
      <SaveDialog
        open
        title="Save to My Creations"
        defaultName="Drake 1"
        defaultTags={[]}
        existingCreations={[{ tags: ['funny', 'work'] }, { tags: ['funny'] }]}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    await userEvent.type(screen.getByPlaceholderText('add a tag...'), 'fu')
    expect(screen.getByText('funny')).toBeInTheDocument()

    await userEvent.click(screen.getByText('funny'))
    expect(screen.getAllByText('funny')).toHaveLength(1)
  })

  it('focuses the tag input when the empty space of the tag box is tapped, so the whole box is one target rather than just the thin input inside it', async () => {
    render(
      <SaveDialog open title="Save" defaultName="Drake 1" defaultTags={['work']} existingCreations={[]} onCancel={vi.fn()} onSave={vi.fn()} />,
    )
    const input = screen.getByPlaceholderText('add a tag...')
    const box = input.parentElement as HTMLElement
    expect(input).not.toHaveFocus()

    await userEvent.click(box)

    expect(input).toHaveFocus()
  })

  it("does not steal the click from a chip's own remove button", async () => {
    render(
      <SaveDialog open title="Save" defaultName="Drake 1" defaultTags={['work']} existingCreations={[]} onCancel={vi.fn()} onSave={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove work' }))
    expect(screen.queryByText('work')).not.toBeInTheDocument()
  })
})
