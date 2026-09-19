import { useEffect, useState } from 'react'
import { Loader2, MoreVertical } from 'lucide-react'
import { TAP_HEIGHT } from '../../lib/touch'

interface CanvasMoreMenuProps {
  // True on a blank canvas — nothing to save or clear yet.
  disabled: boolean
  // True while a save is in flight: the button shows a spinner instead of the
  // dots, so a save started from this menu (which closes right away) is visible.
  saving?: boolean
  // "Save As" only makes sense once there's an existing saved creation to
  // branch a copy from.
  canSaveAs: boolean
  // Only a freeform canvas that already has real dimensions (at least one
  // image uploaded) can be resized — hidden entirely otherwise, same
  // pattern as canSaveAs above.
  canAdjustCanvas: boolean
  onSave: () => void
  onSaveAs: () => void
  onAdjustCanvas: () => void
  onClearCanvas: () => void
}

export function CanvasMoreMenu({ disabled, saving = false, canSaveAs, canAdjustCanvas, onSave, onSaveAs, onAdjustCanvas, onClearCanvas }: CanvasMoreMenuProps) {
  const [open, setOpen] = useState(false)

  // Closes on a click anywhere outside — the same document-level pattern
  // CanvasFab already uses for its own speed-dial menu.
  useEffect(() => {
    if (!open) return
    function handleDocumentClick() {
      setOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [open])

  function runAndClose(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={saving ? 'Saving…' : 'More options'}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || saving}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MoreVertical className="h-4 w-4" />}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-border bg-background py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onSave)}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-muted ${TAP_HEIGHT}`}
          >
            Save
          </button>
          {canSaveAs && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onSaveAs)}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-muted ${TAP_HEIGHT}`}
            >
              Save As
            </button>
          )}
          {canAdjustCanvas && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onAdjustCanvas)}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-muted ${TAP_HEIGHT}`}
            >
              Adjust Canvas
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onClearCanvas)}
            className={`block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 ${TAP_HEIGHT}`}
          >
            Clear Canvas
          </button>
        </div>
      )}
    </div>
  )
}
