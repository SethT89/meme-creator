import { useState } from 'react'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'
import type { ReorderAction } from '../../lib/layers'

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
  // Layering applies to every object, so unlike the props above these are
  // never optional. The can* flags come from the layer's position in the
  // stack: an entry that would change nothing is shown but disabled.
  onReorder: (action: ReorderAction) => void
  canMoveForward: boolean
  canMoveBackward: boolean
}

// Order matches the dropdown top-to-bottom. `needs` is which direction the
// layer must still be able to move for the entry to do anything. Hints are
// the keyboard shortcuts wired up in EditorPage.
const LAYERING_OPTIONS: { action: ReorderAction; label: string; hint: string; needs: 'forward' | 'backward' }[] = [
  { action: 'front', label: 'Bring to front', hint: '⌘⇧]', needs: 'forward' },
  { action: 'forward', label: 'Bring forward', hint: '⌘]', needs: 'forward' },
  { action: 'backward', label: 'Send backward', hint: '⌘[', needs: 'backward' },
  { action: 'back', label: 'Send to back', hint: '⌘⇧[', needs: 'backward' },
]

export function PropertyBar({ fontSize, onChangeFontSize, onCrop, onDelete, onReorder, canMoveForward, canMoveBackward }: PropertyBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [layeringOpen, setLayeringOpen] = useState(false)

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

      <div className="relative">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs"
          aria-haspopup="menu"
          aria-expanded={layeringOpen}
          onClick={() => setLayeringOpen((open) => !open)}
        >
          Layering
        </button>
        {layeringOpen && (
          <div role="menu" className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
            {LAYERING_OPTIONS.map((option) => (
              <button
                key={option.action}
                type="button"
                role="menuitem"
                disabled={!(option.needs === 'forward' ? canMoveForward : canMoveBackward)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent"
                onClick={() => {
                  onReorder(option.action)
                  setLayeringOpen(false)
                }}
              >
                {option.label}
                <span aria-hidden="true" className="ml-3 text-xs text-neutral-400">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-4 w-px bg-neutral-700" />
      <button type="button" className="rounded-full px-2 py-1 text-xs text-red-400" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
