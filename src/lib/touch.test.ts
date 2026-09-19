import { describe, it, expect } from 'vitest'
import { TAP_HEIGHT, TAP_SIZE } from './touch'

describe('touch target tokens', () => {
  it('ask for at least 44px (min-h-11), on touch screens only', () => {
    // Tailwind silently ignores a mistyped class, and jsdom can't measure real
    // sizes — so pin the exact class names. `pointer-coarse:` keeps desktop unchanged.
    expect(TAP_HEIGHT).toBe('pointer-coarse:min-h-11')
    expect(TAP_SIZE.split(' ').sort()).toEqual(['pointer-coarse:min-h-11', 'pointer-coarse:min-w-11'])
  })
})
