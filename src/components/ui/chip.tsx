interface ChipProps {
  label: string
  // Present only where a chip can be removed (e.g. the Save dialog's tag
  // editor) — a display-only chip, like on a gallery card, omits it.
  onRemove?: () => void
  // Makes the whole chip a button (e.g. a card's "+3" overflow chip). Give it
  // an ariaLabel when the visible label isn't descriptive on its own.
  onClick?: () => void
  ariaLabel?: string
}

// max-w-full + truncate: a single very long tag ellipsizes within whatever
// row it's in rather than stretching or overflowing it.
// A fixed color (not the neutral muted gray): the chip sits on a card whose own
// background changes on hover/press, and it has to read the same on all of them.
const BASE = 'inline-block max-w-full truncate rounded-full bg-blue-100 px-2 py-0.5 align-top text-xs text-blue-800'

export function Chip({ label, onRemove, onClick, ariaLabel }: ChipProps) {
  if (onClick) {
    return (
      <button type="button" aria-label={ariaLabel} onClick={onClick} className={`${BASE} hover:bg-blue-200`}>
        {label}
      </button>
    )
  }
  return (
    <span className={BASE}>
      {label}
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="ml-1">
          ✕
        </button>
      )}
    </span>
  )
}
