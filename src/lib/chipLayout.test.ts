import { describe, it, expect } from 'vitest'
import { countVisibleChips } from './chipLayout'

// widths in px; gap 4 between chips; a "+N" chip is 30px wide.
const fit = (widths: number[], container: number, maxLines = 2) => countVisibleChips(widths, 30, container, 4, maxLines)

describe('countVisibleChips', () => {
  it('shows everything when it all fits on one line', () => {
    expect(fit([40, 40], 200)).toBe(2)
  })

  it('shows everything when it fits within the allowed lines, with no +N needed', () => {
    // 40+4+40 = 84 on line 1; the next chip would make 128 > 100, so it wraps.
    // Four chips = two full lines of two, which is exactly the limit.
    expect(fit([40, 40, 40, 40], 100)).toBe(4)
  })

  it('reserves room for the +N chip, dropping chips until it fits on the last line', () => {
    // Six 40px chips can't fit in two lines. Four chips fill both lines, leaving
    // no room for +N on line 2 (84 + 4 + 30 > 100), so it has to stop at three:
    // line 1 = two chips, line 2 = third chip + the +N chip (40 + 4 + 30 = 74).
    expect(fit([40, 40, 40, 40, 40, 40], 100)).toBe(3)
  })

  it('handles chips of different widths', () => {
    // 90 fills line 1 alone (90+4+50 > 100); line 2 = 50, then +N (50+4+30=84).
    expect(fit([90, 50, 50, 50], 100)).toBe(2)
  })

  it('treats a chip wider than the row as exactly one full row (it truncates)', () => {
    // Both chips clamp to 100 wide: line 1 and line 2. No room for +N after
    // them, so with +N required only one chip stays: line 1 = chip, line 2 = +N.
    expect(fit([300, 300, 300], 100)).toBe(1)
  })

  it('can show zero chips when even one plus the +N chip does not fit', () => {
    expect(fit([90, 90], 100, 1)).toBe(0)
  })

  it('shows everything when the row has not been measured yet (zero width)', () => {
    expect(fit([40, 40, 40, 40, 40, 40], 0)).toBe(6)
  })

  it('handles no chips at all', () => {
    expect(fit([], 100)).toBe(0)
  })
})
