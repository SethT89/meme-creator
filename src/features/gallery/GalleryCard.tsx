import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '../../lib/cn'
import { TagChips } from './TagChips'
import { TagsModal } from './TagsModal'
import { TAP_HEIGHT } from '../../lib/touch'

export interface GalleryCardProps {
  creation: {
    id: string
    name: string
    tags: string[]
    preview_image_url: string | null
  }
  onDownload: (id: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

const MENU_ITEM = `block w-full px-3 py-1.5 text-left text-sm hover:bg-muted active:bg-border ${TAP_HEIGHT}`

export function GalleryCard({ creation, onDownload, onOpen, onDelete }: GalleryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  // Wraps the 3-dots button and its dropdown, so a click anywhere outside
  // both counts as "clicked elsewhere".
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleDocumentClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  function runAndClose(action: (id: string) => void) {
    action(creation.id)
    setMenuOpen(false)
  }

  return (
    // `group/card` (named, so it can't be confused with any other group) lets
    // the 3-dots button appear when the card is hovered.
    <div className="group/card relative">
      {/* The pressed state uses has-[...] so it only darkens when the card's
          own main button is pressed — not the 3-dots button or a chip, which
          are separate controls that merely sit inside the same box. Hover and
          pressed grays match the template tiles in the sidebar. */}
      <div
        data-testid="gallery-card"
        className="overflow-hidden rounded-lg border border-border bg-background transition-transform hover:bg-muted has-[[data-card-open]:active]:scale-[0.98] has-[[data-card-open]:active]:bg-border"
      >
        <button
          type="button"
          data-card-open
          onClick={() => onOpen(creation.id)}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          {/* Square, so it scales with the grid column instead of being a fixed
              strip. object-cover still crops memes that aren't square. */}
          <div className="aspect-square bg-muted">
            {creation.preview_image_url && (
              <img src={creation.preview_image_url} alt={creation.name} className="h-full w-full object-cover" />
            )}
          </div>
          {/* One line, ellipsized: a long name must not make this card taller than its neighbors. */}
          <span className="block truncate px-2 pt-2 text-sm">{creation.name}</span>
        </button>

        {/* Outside the button above on purpose: the +N chip is itself a button,
            and buttons can't nest. Always exactly two chip lines tall (h-11 =
            2 x 20px chips + a 4px gap), even with few or no tags, so every
            card in the grid is the same size. */}
        <div className="px-2 pb-2 pt-1">
          <div data-testid="card-tags" className="h-11 overflow-hidden">
            {creation.tags.length > 0 ? (
              <TagChips key={JSON.stringify(creation.tags)} tags={creation.tags} onShowAll={() => setTagsOpen(true)} />
            ) : (
              <p className="text-xs text-muted-foreground">no tags</p>
            )}
          </div>
        </div>
      </div>

      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          aria-label={`More options for ${creation.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            'flex h-8 w-8 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11 rounded-md border border-border bg-background shadow-sm transition-opacity hover:bg-muted active:bg-border focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
            // Shown on hover, and kept visible while its own menu is open.
            // On touch screens there is no hover, so it's always shown there.
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-background py-1 shadow-lg">
            {/* Download saves the stored preview PNG, so it only makes sense once
                one exists (older saves get theirs the next time they're saved). */}
            {creation.preview_image_url && (
              <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => runAndClose(onDownload)}>
                Download
              </button>
            )}
            <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => runAndClose(onOpen)}>
              Open in editor
            </button>
            <button
              type="button"
              role="menuitem"
              className={cn(MENU_ITEM, 'text-red-600 hover:bg-red-50 active:bg-red-100')}
              onClick={() => runAndClose(onDelete)}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {tagsOpen && <TagsModal name={creation.name} tags={creation.tags} onClose={() => setTagsOpen(false)} />}
    </div>
  )
}
