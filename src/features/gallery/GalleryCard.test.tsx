import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GalleryCard } from './GalleryCard'

describe('GalleryCard', () => {
  it('shows a menu with Download, Open in editor, and Delete, wired to the right id', async () => {
    const onDownload = vi.fn()
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    render(
      <GalleryCard
        creation={{ id: 'abc', name: 'Drake 1', tags: ['funny'], preview_image_url: 'https://x/creation-previews/a.png' }}
        onDownload={onDownload}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Drake 1')).toBeInTheDocument()
    expect(screen.getByText('funny')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Drake 1'))
    await userEvent.click(screen.getByText('Open in editor'))
    expect(onOpen).toHaveBeenCalledWith('abc')

    await userEvent.click(screen.getByText('Drake 1'))
    await userEvent.click(screen.getByText('Download'))
    expect(onDownload).toHaveBeenCalledWith('abc')

    await userEvent.click(screen.getByText('Drake 1'))
    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith('abc')
  })

  it('shows the saved preview image in the card', () => {
    render(
      <GalleryCard
        creation={{ id: 'abc', name: 'Drake 1', tags: [], preview_image_url: 'https://x/creation-previews/a.png' }}
        onDownload={() => {}}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByRole('img', { name: 'Drake 1' })).toHaveAttribute('src', 'https://x/creation-previews/a.png')
  })

  it('offers no Download until a preview exists to download', async () => {
    render(
      <GalleryCard
        creation={{ id: 'abc', name: 'Drake 1', tags: [], preview_image_url: null }}
        onDownload={() => {}}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    )
    await userEvent.click(screen.getByText('Drake 1'))

    expect(screen.queryByText('Download')).not.toBeInTheDocument()
    expect(screen.getByText('Open in editor')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })
})
