import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useScrollLock } from '../../lib/useScrollLock'
import { MODAL_Z } from '../../lib/stacking'

interface ModalOverlayProps {
  children: ReactNode
  // Called when the scrim itself (not the content on top of it) is clicked.
  onScrimClick?: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
}

// The scrim + centering wrapper for every dialog. Use this for anything that darkens the
// page, so it always behaves the same:
//   - the page behind it can't scroll (useScrollLock),
//   - it sits above every other on-page layer (MODAL_Z, see lib/stacking.ts) — a floating
//     button or toolbar must never show through the scrim,
//   - it is rendered directly under <body>, so no parent's transform/overflow/z-index can
//     trap it in a lower stacking context.
// Mount it only while the dialog is open. (src/scrimGuard.test.ts fails if a component draws
// its own scrim without one of these guarantees.)
export function ModalOverlay({ children, onScrimClick, ...aria }: ModalOverlayProps) {
  useScrollLock(true)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      {...aria}
      className={`fixed inset-0 ${MODAL_Z} flex items-center justify-center bg-black/50`}
      // The scrim is the dialog element itself, so a click that lands on it (rather than
      // bubbling up from the content) means "clicked outside".
      onClick={
        onScrimClick
          ? (e) => {
              if (e.target === e.currentTarget) onScrimClick()
            }
          : undefined
      }
    >
      {children}
    </div>,
    document.body,
  )
}
