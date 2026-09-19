import { useState } from 'react'
import { Layers, Trash2 } from 'lucide-react'
import { fitPopover } from '../../lib/viewportClamp'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'
import type { ReorderAction, ResolvedTextStyle, TextStylePatch } from '../../lib/layers'
import { AlignPicker } from './AlignPicker'
import { ColorPicker } from './ColorPicker'
import { FontPicker } from './FontPicker'
import { TAP_HEIGHT, TAP_SIZE } from '../../lib/touch'

interface PropertyBarProps {
  // The four props below are present for a text layer and omitted for an
  // image layer — the Font/Size/Color/Align controls only render when all
  // four are given.
  fontSize?: number
  onChangeFontSize?: (px: number) => void
  textStyle?: ResolvedTextStyle
  onChangeTextStyle?: (patch: TextStylePatch) => void
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
  // On a phone the bar is docked to the bottom of the screen (EditorPage decides): a
  // full-width, evenly spaced row attached to the bottom edge, instead of the floating
  // pill that follows the selected layer around on larger screens.
  docked?: boolean
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

type MenuName = 'font' | 'size' | 'color' | 'align' | 'layering'

const DIVIDER = <div className="h-4 w-px bg-neutral-700" />

// Icon-only buttons (Layering, Delete): a 16px icon in a compact hit area — words made the bar
// wide. Each still has an aria-label and a title tooltip so it stays understandable.
const ICON_BUTTON = `flex items-center justify-center rounded-full px-2 py-1.5 ${TAP_SIZE}`

export function PropertyBar({
  fontSize,
  onChangeFontSize,
  textStyle,
  onChangeTextStyle,
  onCrop,
  onDelete,
  onReorder,
  canMoveForward,
  canMoveBackward,
  docked = false,
}: PropertyBarProps) {
  // The thin lines between groups cost width; a docked bar spaces its groups evenly instead.
  const divider = docked ? null : DIVIDER
  // One menu open at a time: opening any menu replaces whichever was open.
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null)
  const toggleMenu = (name: MenuName) => setOpenMenu((current) => (current === name ? null : name))

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
    // flex-wrap + a viewport-relative max width: on a narrow screen the
    // (now wider) bar wraps onto a second row instead of running off-screen.
    <div
      className={
        docked
          ? 'flex w-full flex-wrap items-center justify-around gap-1 rounded-t-2xl bg-neutral-900 px-2 py-1 text-white shadow-[0_-6px_18px_rgba(0,0,0,0.3)]'
          : 'flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 rounded-3xl bg-neutral-900 px-2 py-1.5 text-white shadow-lg'
      }
    >
      {fontSize !== undefined && onChangeFontSize !== undefined && textStyle !== undefined && onChangeTextStyle !== undefined && (
        <>
          <FontPicker
            fontId={textStyle.fontId}
            open={openMenu === 'font'}
            onToggle={() => toggleMenu('font')}
            onChange={(id) => {
              onChangeTextStyle({ fontFamily: id })
              setOpenMenu(null)
            }}
          />
          {divider}

          <div className="relative">
            <button
              type="button"
              className={`rounded-full px-2 py-1 text-xs ${TAP_HEIGHT}`}
              // Docked, the label is just the value ("22px") so the whole row fits one line even
              // on a 320px phone; the full "Size: Medium" stays as its accessible name.
              aria-label={docked ? `Size: ${sizeLabel(fontSize)}` : undefined}
              onClick={() => toggleMenu('size')}
            >
              {docked ? `${fontSize}px` : `Size: ${sizeLabel(fontSize)}`}
            </button>
            {openMenu === 'size' && (
              <div ref={fitPopover} className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
                {SIZE_PRESETS.map((preset) => (
                  <div
                    key={preset.label}
                    className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm hover:bg-neutral-700 ${TAP_HEIGHT}`}
                    onClick={() => {
                      onChangeFontSize(preset.px)
                      setOpenMenu(null)
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
                    className={`w-full rounded-md bg-neutral-800 px-2 py-1 text-base text-white sm:text-sm ${TAP_HEIGHT}`}
                    // The on-canvas preview should track every keystroke, not
                    // just the final committed value — onBlur/Enter below are
                    // now just redundant convenience (harmless to keep; Enter
                    // also closes the panel).
                    onChange={(e) => applyCustomSize(e.currentTarget.value)}
                    onBlur={(e) => applyCustomSize(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyCustomSize(e.currentTarget.value)
                        setOpenMenu(null)
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {divider}

          <ColorPicker
            color={textStyle.color}
            strokeColor={textStyle.strokeColor}
            open={openMenu === 'color'}
            onToggle={() => toggleMenu('color')}
            onChange={onChangeTextStyle}
          />
          <AlignPicker
            value={textStyle.textAlign}
            open={openMenu === 'align'}
            onToggle={() => toggleMenu('align')}
            onChange={(textAlign) => {
              onChangeTextStyle({ textAlign })
              setOpenMenu(null)
            }}
          />
          {divider}
        </>
      )}

      {onCrop && (
        <>
          <button type="button" className={`rounded-full px-2 py-1 text-xs ${TAP_HEIGHT}`} onClick={onCrop}>
            Crop
          </button>
          {divider}
        </>
      )}

      <div className="relative">
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Layering"
          title="Layering"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'layering'}
          onClick={() => toggleMenu('layering')}
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
        </button>
        {openMenu === 'layering' && (
          <div ref={fitPopover} role="menu" className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
            {LAYERING_OPTIONS.map((option) => (
              <button
                key={option.action}
                type="button"
                role="menuitem"
                disabled={!(option.needs === 'forward' ? canMoveForward : canMoveBackward)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-700 ${TAP_HEIGHT} disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent`}
                onClick={() => {
                  onReorder(option.action)
                  setOpenMenu(null)
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
      {divider}
      <button type="button" className={`${ICON_BUTTON} text-red-400`} aria-label="Delete" title="Delete" onClick={onDelete}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
