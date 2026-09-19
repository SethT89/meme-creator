import { useState } from 'react'
import { SWATCH_ROWS } from '../../lib/palette'
import type { TextStylePatch } from '../../lib/layers'
import { fitPopover } from '../../lib/viewportClamp'
import { TAP_SIZE } from '../../lib/touch'

type Tab = 'fill' | 'outline'

interface ColorPickerProps {
  color: string
  // null = the outline is off.
  strokeColor: string | null
  open: boolean
  onToggle: () => void
  onChange: (patch: Pick<TextStylePatch, 'color' | 'strokeColor'>) => void
}

// 20px with a mouse; 32px on touch (and 6 per row there, below) — 11 across at a
// fingertip-friendly size wouldn't fit a phone.
const SWATCH_BASE = 'h-5 w-5 shrink-0 rounded-full border pointer-coarse:h-8 pointer-coarse:w-8'

export function ColorPicker({ color, strokeColor, open, onToggle, onChange }: ColorPickerProps) {
  const [tab, setTab] = useState<Tab>('fill')
  // The swatch to ring: the fill in the Fill tab, the outline (if any) in the
  // Outline tab.
  const selected = (tab === 'fill' ? color : strokeColor)?.toLowerCase() ?? null

  function apply(hex: string) {
    onChange(tab === 'fill' ? { color: hex } : { strokeColor: hex })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Text color"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center justify-center rounded-full px-2 py-1.5 ${TAP_SIZE}`}
        onClick={onToggle}
      >
        {/* Shows both colors at a glance: the fill is the disc, the outline is
            the ring around it (no ring when the outline is off). The faint outer
            ring keeps a dark outline visible against the dark toolbar. */}
        <span
          aria-hidden="true"
          className={`block h-5 w-5 rounded-full ring-1 ring-neutral-600 ${strokeColor ? 'border-[3px] border-solid' : ''}`}
          style={{ backgroundColor: color, ...(strokeColor ? { borderColor: strokeColor } : {}) }}
        />
      </button>
      {open && (
        <div ref={fitPopover} role="dialog" aria-label="Text color" className="absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 rounded-xl bg-neutral-900 p-3 shadow-lg">
          <div className="mb-3 flex items-center gap-2 border-b border-neutral-700 pb-2">
            <div role="tablist" className="flex gap-1">
              {(['fill', 'outline'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  className={`rounded-md px-2.5 py-1 text-sm ${TAP_SIZE} ${tab === name ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
                  onClick={() => setTab(name)}
                >
                  {name === 'fill' ? 'Fill' : 'Outline'}
                </button>
              ))}
            </div>
            {tab === 'outline' && (
              <button
                type="button"
                aria-pressed={strokeColor === null}
                className={`ml-auto rounded-md px-2.5 py-1 text-sm ${TAP_SIZE} ${strokeColor === null ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
                onClick={() => onChange({ strokeColor: null })}
              >
                None
              </button>
            )}
          </div>

          {SWATCH_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="mb-1 grid grid-cols-11 gap-1 last:mb-0 pointer-coarse:mb-2 pointer-coarse:grid-cols-6 pointer-coarse:gap-2">
              {row.map((swatch) => {
                const isSelected = selected === swatch.hex
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    aria-label={swatch.name}
                    aria-pressed={isSelected}
                    className={`${SWATCH_BASE} ${isSelected ? 'border-transparent ring-2 ring-white ring-offset-1 ring-offset-neutral-900' : 'border-neutral-600'}`}
                    style={{ backgroundColor: swatch.hex }}
                    onClick={() => apply(swatch.hex)}
                  />
                )
              })}
              {/* The rainbow "custom color" swatch, last in the tint row: a
                  native color input stretched invisibly over it, so clicking
                  it opens the browser's own picker. */}
              {rowIndex === SWATCH_ROWS.length - 1 && (
                <label
                  className={`${SWATCH_BASE} relative cursor-pointer overflow-hidden border-neutral-600`}
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                >
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={selected ?? '#000000'}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => apply(e.currentTarget.value)}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
