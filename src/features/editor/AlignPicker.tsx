import type { TextAlign } from '../../lib/layers'

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Align left' },
  { value: 'center', label: 'Align center' },
  { value: 'right', label: 'Align right' },
]

// Three stacked lines of different lengths, pushed to the left, middle or
// right edge — the usual alignment glyph.
function AlignIcon({ align }: { align: TextAlign }) {
  const widths = [14, 9, 12]
  return (
    <svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {widths.map((width, i) => {
        const start = align === 'left' ? 0 : align === 'center' ? (14 - width) / 2 : 14 - width
        const y = 2 + i * 4
        return <line key={i} x1={start + 0.75} x2={start + width - 0.75} y1={y} y2={y} />
      })}
    </svg>
  )
}

interface AlignPickerProps {
  value: TextAlign
  open: boolean
  onToggle: () => void
  onChange: (value: TextAlign) => void
}

export function AlignPicker({ value, open, onToggle, onChange }: AlignPickerProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Text alignment"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full px-2 py-1.5"
        onClick={onToggle}
      >
        <AlignIcon align={value} />
      </button>
      {open && (
        <div role="menu" aria-label="Text alignment options" className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
          {ALIGN_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-700 ${
                option.value === value ? 'bg-neutral-800' : ''
              }`}
              onClick={() => onChange(option.value)}
            >
              <AlignIcon align={option.value} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
