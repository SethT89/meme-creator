import { useState } from 'react'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'

interface PropertyBarProps {
  // Present for a text layer, omitted for an image layer — the Font/Size
  // (and Color, which only makes sense alongside text) section only
  // renders when both are given.
  fontSize?: number
  onChangeFontSize?: (px: number) => void
  // Present for an image layer, omitted for a text layer — the Crop
  // button only renders when given.
  onCrop?: () => void
  onDelete: () => void
}

export function PropertyBar({ fontSize, onChangeFontSize, onCrop, onDelete }: PropertyBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  function applyCustomSize(raw: string) {
    // Empty is a normal in-progress state (cleared the field to type a
    // fresh number) — Number('') is 0, not NaN, so without this guard it'd
    // flash the on-canvas text down to MIN_FONT_SIZE for a moment.
    if (raw === '') return
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    onChangeFontSize?.(clampFontSize(parsed))
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1.5 text-white shadow-lg">
      {fontSize !== undefined && onChangeFontSize !== undefined && (
        <>
          <span className="rounded-full px-2 py-1 text-xs">Font</span>
          <div className="h-4 w-px bg-neutral-700" />

          <div className="relative">
            <button
              type="button"
              className="rounded-full px-2 py-1 text-xs"
              onClick={() => setPanelOpen((open) => !open)}
            >
              Size: {sizeLabel(fontSize)}
            </button>
            {panelOpen && (
              <div className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
                {SIZE_PRESETS.map((preset) => (
                  <div
                    key={preset.label}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-neutral-700"
                    onClick={() => {
                      onChangeFontSize(preset.px)
                      setPanelOpen(false)
                    }}
                  >
                    {preset.label}
                  </div>
                ))}
                <div className="mt-1 border-t border-neutral-700 pt-1.5">
                  <label className="block px-2 pb-1 text-[10px] uppercase text-neutral-400" htmlFor="custom-font-size">
                    Custom
                  </label>
                  <input
                    id="custom-font-size"
                    aria-label="Custom font size"
                    type="number"
                    defaultValue={fontSize}
                    className="w-full rounded-md bg-neutral-800 px-2 py-1 text-sm text-white"
                    // The on-canvas preview should track every keystroke, not
                    // just the final committed value — onBlur/Enter below are
                    // now just redundant convenience (harmless to keep; Enter
                    // also closes the panel).
                    onChange={(e) => applyCustomSize(e.currentTarget.value)}
                    onBlur={(e) => applyCustomSize(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyCustomSize(e.currentTarget.value)
                        setPanelOpen(false)
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <span className="rounded-full px-2 py-1 text-xs">Color</span>
          <div className="h-4 w-px bg-neutral-700" />
        </>
      )}

      {onCrop && (
        <>
          <button type="button" className="rounded-full px-2 py-1 text-xs" onClick={onCrop}>
            Crop
          </button>
          <div className="h-4 w-px bg-neutral-700" />
        </>
      )}

      <span className="rounded-full px-2 py-1 text-xs">⬆ Front</span>
      <div className="h-4 w-px bg-neutral-700" />
      <button type="button" className="rounded-full px-2 py-1 text-xs text-red-400" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
