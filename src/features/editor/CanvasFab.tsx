import { useEffect, useState } from 'react'
import { Plus, X, Type, Image as ImageIcon, Loader2 } from 'lucide-react'

// Top-to-bottom stacking order when the menu is open — closest to the main
// FAB (rendered last, at the bottom of the stack) is the most likely first
// action a user reaches for.
const FAB_ACTIONS = [
  { key: 'image', label: 'Upload Image', Icon: ImageIcon },
  { key: 'text', label: 'Add Text', Icon: Type },
] as const

interface CanvasFabProps {
  // Add Text and Upload Image are the only actions. Add Emoji and Add
  // Sticker entries were removed until those features are actually built;
  // re-add them to FAB_ACTIONS (they were the two top entries, Emoji first)
  // along with a handler here when they are.
  onAddText?: () => void
  onAddImage?: () => void
  // True while a picked file is uploading — the main toggle button shows a
  // spinner and disables itself for the duration, since there's no other
  // visible feedback between picking a file and it appearing on the canvas
  // (the menu itself has already closed by then; see handleActionClick).
  uploadingImage?: boolean
}

export function CanvasFab({ onAddText, onAddImage, uploadingImage = false }: CanvasFabProps) {
  const [open, setOpen] = useState(false)

  function handleActionClick(key: (typeof FAB_ACTIONS)[number]['key']) {
    if (key === 'text') {
      onAddText?.()
      setOpen(false)
    } else if (key === 'image') {
      onAddImage?.()
      setOpen(false)
    }
  }

  // Closes the menu on a click anywhere outside it — the same document-level
  // pattern EditorPage already uses to deselect the property bar. Only
  // registered while open, and this component's own wrapper calls
  // stopPropagation on every click (see below), so this listener never fires
  // for a click that originated inside the FAB itself — including the main
  // toggle button, which manages open/closed directly via its own onClick.
  useEffect(() => {
    if (!open) return
    function handleDocumentClick() {
      setOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [open])

  return (
    <div
      // Mobile (default): overlays the image's bottom-right corner directly
      // — there isn't reliably room to float outside the image on a narrow
      // viewport. Desktop (sm+): sits just outside the image wrapper's own
      // bottom-right corner, in the checkerboard working-area space, never
      // over the artwork.
      className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2.5 sm:-bottom-4 sm:-right-12"
      onClick={(e) => e.stopPropagation()}
    >
      {open &&
        FAB_ACTIONS.map(({ key, label, Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white">{label}</span>
            <button
              type="button"
              aria-label={label}
              onClick={() => handleActionClick(key)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:opacity-80"
            >
              <Icon className="h-4 w-4" />
            </button>
          </div>
        ))}

      <button
        type="button"
        aria-label={uploadingImage ? 'Uploading image…' : open ? 'Close add menu' : 'Open add menu'}
        disabled={uploadingImage}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:opacity-80 disabled:pointer-events-none disabled:opacity-70"
      >
        {uploadingImage ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : open ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>
    </div>
  )
}
