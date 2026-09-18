import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../components/ui/button'
import { RESIZE_HANDLES, getCropRect } from '../../lib/layers'
import type { ImageLayer, ResizeSign } from '../../lib/layers'

interface ImageCropOverlayProps {
  layer: ImageLayer
  onConfirm: (crop: { x: number; y: number; width: number; height: number }) => void
  onCancel: () => void
}

type Rect = { x: number; y: number; width: number; height: number }

// How large the full image renders inside the overlay, in CSS px — fixed
// rather than measured live, so the pixel <-> fraction math below doesn't
// need a ResizeObserver just to stay correct.
const OVERLAY_MAX_SIZE = 600
// Smallest selectable crop, as a fraction of the image's own displayed
// size — small enough to allow a tight crop, large enough to stay grabbable.
const MIN_CROP_FRACTION = 0.05

type DragState =
  | { mode: 'move'; startX: number; startY: number; rectStart: Rect }
  | { mode: 'resize'; startX: number; startY: number; rectStart: Rect; xSign: ResizeSign; ySign: ResizeSign }

export function ImageCropOverlay({ layer, onConfirm, onCancel }: ImageCropOverlayProps) {
  // Fit the source image within OVERLAY_MAX_SIZE on its longer edge,
  // preserving its real aspect ratio — this is the fixed image display the
  // user drags a selection rectangle over.
  const scale = Math.min(OVERLAY_MAX_SIZE / layer.naturalWidth, OVERLAY_MAX_SIZE / layer.naturalHeight)
  const displayWidth = layer.naturalWidth * scale
  const displayHeight = layer.naturalHeight * scale

  const [rect, setRect] = useState<Rect>(() => {
    const initial = getCropRect(layer)
    return {
      x: initial.x * displayWidth,
      y: initial.y * displayHeight,
      width: initial.width * displayWidth,
      height: initial.height * displayHeight,
    }
  })
  const dragState = useRef<DragState | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function clampRect(next: Rect): Rect {
    const minSize = Math.min(displayWidth, displayHeight) * MIN_CROP_FRACTION
    const width = Math.min(displayWidth, Math.max(minSize, next.width))
    const height = Math.min(displayHeight, Math.max(minSize, next.height))
    const x = Math.min(displayWidth - width, Math.max(0, next.x))
    const y = Math.min(displayHeight - height, Math.max(0, next.y))
    return { x, y, width, height }
  }

  function handleMovePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, rectStart: rect }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    dragState.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, rectStart: rect, xSign, ySign }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (drag.mode === 'move') {
      setRect(clampRect({ ...drag.rectStart, x: drag.rectStart.x + dx, y: drag.rectStart.y + dy }))
      return
    }

    let { x, y, width, height } = drag.rectStart
    if (drag.xSign === 1) {
      width = drag.rectStart.width + dx
    } else if (drag.xSign === -1) {
      width = drag.rectStart.width - dx
      x = drag.rectStart.x + dx
    }
    if (drag.ySign === 1) {
      height = drag.rectStart.height + dy
    } else if (drag.ySign === -1) {
      height = drag.rectStart.height - dy
      y = drag.rectStart.y + dy
    }
    setRect(clampRect({ x, y, width, height }))
  }

  function handlePointerUp() {
    dragState.current = null
  }

  function handleConfirm() {
    onConfirm({
      x: rect.x / displayWidth,
      y: rect.y / displayHeight,
      width: rect.width / displayWidth,
      height: rect.height / displayHeight,
    })
  }

  return (
    <div role="dialog" aria-label="Crop image" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70">
      <div
        className="relative select-none"
        style={{ width: displayWidth, height: displayHeight }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img src={layer.src} alt="" draggable={false} className="absolute inset-0 h-full w-full" />

        {/* Dimmed mask outside the crop rect — 4 bars around it rather than
            a single clip-path, since a clip-path polygon mixing this many
            px-based coordinates is harder to read and no simpler to compute. */}
        <div className="pointer-events-none absolute bg-black/60" style={{ left: 0, top: 0, width: displayWidth, height: rect.y }} />
        <div
          className="pointer-events-none absolute bg-black/60"
          style={{ left: 0, top: rect.y + rect.height, width: displayWidth, height: displayHeight - rect.y - rect.height }}
        />
        <div className="pointer-events-none absolute bg-black/60" style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }} />
        <div
          className="pointer-events-none absolute bg-black/60"
          style={{ left: rect.x + rect.width, top: rect.y, width: displayWidth - rect.x - rect.width, height: rect.height }}
        />

        <div
          className="absolute cursor-move touch-none border-2 border-white"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          onPointerDown={handleMovePointerDown}
        >
          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle.key}
              className="absolute h-3 w-3 touch-none border border-neutral-900 bg-white"
              style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
              onPointerDown={(e) => handleResizePointerDown(e, handle.xSign, handle.ySign)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConfirm}>Apply Crop</Button>
      </div>
    </div>
  )
}
