import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageCropOverlay } from './ImageCropOverlay'
import type { ImageLayer } from '../../lib/layers'

// 800x600 (4:3) source, uncropped by default — matches getCropRect's own
// "undefined means the whole image" default.
const baseLayer: ImageLayer = {
  type: 'image',
  id: 'img1',
  src: 'https://example.com/photo.png',
  naturalWidth: 800,
  naturalHeight: 600,
  x: 0,
  y: 0,
  width: 800,
  height: 600,
}

describe('ImageCropOverlay', () => {
  it('renders the full source image and a dialog role', () => {
    render(<ImageCropOverlay layer={baseLayer} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Crop image' })).toBeInTheDocument()
    // Empty alt gives the <img> role "presentation," not "img" — same
    // pattern EditorPage.test.tsx already works around for image layers.
    expect(screen.getByAltText('')).toHaveAttribute('src', baseLayer.src)
  })

  it('starts with the crop rectangle covering the whole image when the layer has no crop yet', () => {
    render(<ImageCropOverlay layer={baseLayer} onConfirm={() => {}} onCancel={() => {}} />)
    // OVERLAY_MAX_SIZE (600) / max(800,600) = 0.75 scale -> 600x450 display.
    const rect = document.querySelector('.border-white') as HTMLElement
    expect(rect).toHaveStyle({ width: '600px', height: '450px' })
  })

  it('clicking Cancel calls onCancel without calling onConfirm', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ImageCropOverlay layer={baseLayer} onConfirm={onConfirm} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('pressing Escape calls onCancel', () => {
    const onCancel = vi.fn()
    render(<ImageCropOverlay layer={baseLayer} onConfirm={() => {}} onCancel={onCancel} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalled()
  })

  it('clicking Apply Crop with no changes confirms the full-image crop (0,0,1,1)', async () => {
    const onConfirm = vi.fn()
    render(<ImageCropOverlay layer={baseLayer} onConfirm={onConfirm} onCancel={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Apply Crop' }))

    expect(onConfirm).toHaveBeenCalledWith({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('dragging the crop rectangle (not a handle) pans it without resizing, clamped to the image bounds', () => {
    // Start from an existing crop smaller than the full image so there's
    // room to pan without immediately hitting the clamp.
    const layer: ImageLayer = { ...baseLayer, cropX: 0.25, cropY: 0.25, cropWidth: 0.5, cropHeight: 0.5 }
    render(<ImageCropOverlay layer={layer} onConfirm={vi.fn()} onCancel={() => {}} />)

    // The crop rectangle is the bordered div directly containing the resize handles.
    const rect = document.querySelector('.border-white') as HTMLElement
    fireEvent.pointerDown(rect, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(rect, { clientX: 30, clientY: 0 })
    fireEvent.pointerUp(rect)

    // Display is 600x450 (0.75 scale) — crop starts at x=0.25*600=150,
    // width=0.5*600=300. Panning right by 30px moves it to left=180px.
    expect(rect).toHaveStyle({ left: '180px' })
  })

  it('dragging a corner handle resizes the crop rectangle', () => {
    render(<ImageCropOverlay layer={baseLayer} onConfirm={vi.fn()} onCancel={() => {}} />)

    // bottom-right corner handle, per RESIZE_HANDLES order: tl, tm, tr, lm, rm, bl, bm, br.
    const handles = document.querySelectorAll('.border-neutral-900')
    const brHandle = handles[handles.length - 1] as HTMLElement

    fireEvent.pointerDown(brHandle, { clientX: 0, clientY: 0 })
    // Shrink from the full 600x450 by 100px on each axis.
    fireEvent.pointerMove(brHandle, { clientX: -100, clientY: -100 })
    fireEvent.pointerUp(brHandle)

    const rect = document.querySelector('.border-white') as HTMLElement
    expect(rect).toHaveStyle({ width: '500px', height: '350px' })
  })
})
