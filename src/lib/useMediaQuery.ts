import { useSyncExternalStore } from 'react'

// Whether a CSS media query currently matches, kept live as the screen changes
// (rotating a phone, resizing a window). False where matchMedia doesn't exist
// (tests, very old browsers), so callers fall back to the non-matching layout.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(query)
      media?.addEventListener('change', onChange)
      return () => media?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
