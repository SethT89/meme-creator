import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GalleryCard } from './GalleryCard'

describe('GalleryCard', () => {
  it('shows a menu with Download and Open in editor, wired to the right id', async () => {
    const onDownload = vi.fn()
    const onOpen = vi.fn()
    render(
      <GalleryCard
        creation={{ id: 'abc', name: 'Drake 1', tags: ['funny'], exported_image_url: null }}
        onDownload={onDownload}
        onOpen={onOpen}
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
  })
})
