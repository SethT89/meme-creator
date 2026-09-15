import { useState } from 'react'

const SIZE_PRESETS = ['Small', 'Medium', 'Large', 'Extra Large', 'Huge'] as const

export function PropertyBar() {
  const [size, setSize] = useState<(typeof SIZE_PRESETS)[number]>('Medium')
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1.5 text-white shadow-lg">
      <span className="rounded-full px-2 py-1 text-xs">Font</span>
      <div className="h-4 w-px bg-neutral-700" />

      <div className="relative">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs"
          onClick={() => setPanelOpen((open) => !open)}
        >
          Size: {size}
        </button>
        {panelOpen && (
          <div className="absolute bottom-full left-1/2 mb-2 w-36 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
            {SIZE_PRESETS.map((preset) => (
              <div
                key={preset}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-neutral-700"
                onClick={() => {
                  setSize(preset)
                  setPanelOpen(false)
                }}
              >
                {preset}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-neutral-700" />
      <span className="rounded-full px-2 py-1 text-xs">Color</span>
      <div className="h-4 w-px bg-neutral-700" />
      <span className="rounded-full px-2 py-1 text-xs">⬆ Front</span>
      <div className="h-4 w-px bg-neutral-700" />
      <span className="rounded-full px-2 py-1 text-xs text-red-400">Delete</span>
    </div>
  )
}
