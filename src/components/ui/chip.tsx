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
const COLORS = 'rounded-full bg-blue-100 px-2 py-0.5 align-top text-xs text-blue-800'
const BASE = `inline-block max-w-full truncate ${COLORS}`

// Where a chip contains a button, the ellipsizing (overflow: hidden) has to live on
// an INNER label — overflow: hidden on the chip itself would clip the invisible
// touch hit area a ::before stretches past the button's edges, making it pointless.
const WITH_BUTTON = `inline-flex max-w-full items-center ${COLORS}`

export function Chip({ label, onRemove, onClick, ariaLabel }: ChipProps) {
  if (onClick) {
    return (
      // A small chip on a card: on touch, its tap area is stretched past its edges
      // by an invisible ::before, without changing how it looks.
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className={`${WITH_BUTTON} relative hover:bg-blue-200 pointer-coarse:before:absolute pointer-coarse:before:-inset-2`}
      >
        <span className="truncate">{label}</span>
      </button>
    )
  }
  if (onRemove) {
    return (
      <span className={WITH_BUTTON}>
        <span className="truncate">{label}</span>
        {/* The ✕ is ~12px wide: on touch, an invisible ::before makes the tappable
            area roughly 36px around it. */}
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="relative ml-1 shrink-0 pointer-coarse:before:absolute pointer-coarse:before:-inset-3"
        >
          ✕
        </button>
      </span>
    )
  }
  return <span className={BASE}>{label}</span>
}
