import { FONT_OPTIONS, fontFamilyCss, getFontOption } from '../../lib/fonts'
import type { FontId } from '../../lib/fonts'

interface FontPickerProps {
  // null = a legacy layer on the system font (no chosen typeface).
  fontId: FontId | null
  // The layer's resolved CSS font-family/weight, so the button previews the
  // typeface that is actually applied.
  fontFamily: string
  fontWeight: number
  open: boolean
  onToggle: () => void
  onChange: (id: FontId) => void
}

export function FontPicker({ fontId, fontFamily, fontWeight, open, onToggle, onChange }: FontPickerProps) {
  const label = getFontOption(fontId ?? undefined)?.label ?? 'System'

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Font: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The name is set in its own typeface so the current choice is
        // legible at a glance — that's the point of this control.
        style={{ fontFamily, fontWeight }}
        className="max-w-36 truncate rounded-full px-2 py-1 text-sm"
        onClick={onToggle}
      >
        {label}
      </button>
      {open && (
        <div role="menu" aria-label="Fonts" className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              type="button"
              role="menuitemradio"
              aria-checked={font.id === fontId}
              style={{ fontFamily: fontFamilyCss(font), fontWeight: font.weight }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-base hover:bg-neutral-700 ${
                font.id === fontId ? 'bg-neutral-800' : ''
              }`}
              onClick={() => onChange(font.id)}
            >
              {font.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
