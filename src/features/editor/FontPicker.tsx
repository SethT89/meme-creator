import { FONT_OPTIONS, fontFamilyCss, getFontOption } from '../../lib/fonts'
import type { FontId } from '../../lib/fonts'
import { fitPopover } from '../../lib/viewportClamp'
import { TAP_HEIGHT } from '../../lib/touch'

interface FontPickerProps {
  // null = a legacy layer on the system font (no chosen typeface).
  fontId: FontId | null
  open: boolean
  onToggle: () => void
  onChange: (id: FontId) => void
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 2.5 4 5.5 7 2.5" />
    </svg>
  )
}

function Check() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
    </svg>
  )
}

export function FontPicker({ fontId, open, onToggle, onChange }: FontPickerProps) {
  const label = getFontOption(fontId ?? undefined)?.label ?? 'System'

  return (
    <div className="relative">
      <button
        type="button"
        // The button is a constant "Aa" so the toolbar never changes width as
        // the font changes; the current font is named in the dropdown (checked),
        // on hover, and to screen readers.
        aria-label={`Font: ${label}`}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-base ${TAP_HEIGHT}`}
        onClick={onToggle}
      >
        Aa
        <Chevron />
      </button>
      {open && (
        <div ref={fitPopover} role="menu" aria-label="Fonts" className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              type="button"
              role="menuitemradio"
              aria-checked={font.id === fontId}
              // Each name in its own typeface. The check column is always
              // reserved so the names line up whether or not one is checked.
              style={{ fontFamily: fontFamilyCss(font), fontWeight: font.weight }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base hover:bg-neutral-700 ${TAP_HEIGHT}`}
              onClick={() => onChange(font.id)}
            >
              <span className="flex w-4 shrink-0 justify-center">{font.id === fontId && <Check />}</span>
              {font.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
