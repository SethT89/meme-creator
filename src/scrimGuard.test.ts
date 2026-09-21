import { describe, it, expect } from 'vitest'

// Rule for this app: anything that draws a dark scrim over the page must (1) lock page
// scrolling while it is up and (2) sit in the shared layer above every other on-page
// element. `ModalOverlay` does both, so a new modal should just use it. This test fails
// if a component draws its own scrim (`bg-black/…`) without either using ModalOverlay
// or calling useScrollLock itself (the template drawer does the latter — it is a
// slide-out panel, not a centered dialog, and deliberately sits below dialogs).
const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('scrim rule', () => {
  const scrimFiles = Object.entries(sources).filter(([path, code]) => !path.endsWith('.test.tsx') && /bg-black\//.test(code))

  it('finds the components that draw a scrim (so this guard is not silently checking nothing)', () => {
    expect(scrimFiles.map(([path]) => path)).toEqual(
      expect.arrayContaining(['/src/components/ui/ModalOverlay.tsx', '/src/features/editor/TemplateSidebar.tsx']),
    )
  })

  it.each(scrimFiles)('%s locks page scrolling while its scrim is up', (_path, code) => {
    expect(/ModalOverlay|useScrollLock\(/.test(code)).toBe(true)
  })
})
