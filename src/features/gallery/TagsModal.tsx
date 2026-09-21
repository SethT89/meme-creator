import { useEffect, useId } from 'react'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { ModalOverlay } from '../../components/ui/ModalOverlay'

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
    <ModalOverlay aria-labelledby={titleId} onScrimClick={onClose}>
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
    </ModalOverlay>
  )
}
