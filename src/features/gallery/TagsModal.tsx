import { useEffect, useId } from 'react'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'

interface TagsModalProps {
  name: string
  tags: string[]
  onClose: () => void
}

// Every tag on a creation, opened from a card's "+N" chip. Rendered only
// while open (the caller decides), like ConfirmDialog.
export function TagsModal({ name, tags, onClose }: TagsModalProps) {
  const titleId = useId()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    // The backdrop is the dialog element itself, so a click that lands on it
    // (rather than bubbling up from the panel) means "clicked outside".
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-background p-4 shadow-lg">
        <h2 id={titleId} className="mb-3 text-sm font-semibold">
          Tags — {name}
        </h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
