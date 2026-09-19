import { describe, it, expect, afterEach } from 'vitest'
import { horizontalShiftToFit, verticalShiftToFit, keepInViewport, fitPopover, fitToolbar } from './viewportClamp'

describe('horizontalShiftToFit', () => {
  // A 375px-wide screen, 8px margin: the box may occupy x = 8..367.
  it('leaves a box that already fits alone', () => {
    expect(horizontalShiftToFit(50, 200, 375)).toBe(0)
    expect(horizontalShiftToFit(8, 367, 375)).toBe(0) // exactly on the margins
  })

  it('shifts right by exactly what it sticks out on the left', () => {
    expect(horizontalShiftToFit(-30, 120, 375)).toBe(38) // -30 -> 8
  })

  it('shifts left by exactly what it sticks out on the right', () => {
    expect(horizontalShiftToFit(250, 420, 375)).toBe(-53) // 420 -> 367
  })

  it('keeps a margin from the screen edge, not just inside it', () => {
    expect(horizontalShiftToFit(2, 100, 375)).toBe(6)
    expect(horizontalShiftToFit(300, 372, 375)).toBe(-5)
  })

  it('lines the left edge up with the margin when the box is wider than the screen (the right edge then gets cut, but the start stays reachable)', () => {
    expect(horizontalShiftToFit(-40, 460, 375)).toBe(48)
  })

  it('takes the margin as a parameter', () => {
    expect(horizontalShiftToFit(-30, 120, 375, 0)).toBe(30)
  })
})

describe('keepInViewport', () => {
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
  })

  function elementAt(left: number, right: number) {
    const el = document.createElement('div')
    // jsdom does no layout, so report where the element "is" — as it would be
    // at its natural position, i.e. with no shift applied. It does react to a
    // margin we set, like a real absolutely positioned/fixed box would.
    el.getBoundingClientRect = () => {
      const shift = parseFloat(el.style.marginLeft || '0')
      return { left: left + shift, right: right + shift, width: right - left } as DOMRect
    }
    return el
  }
  const screenWidth = (px: number) => Object.defineProperty(document.documentElement, 'clientWidth', { value: px, configurable: true })

  it('does nothing for null (a ref callback is called with null on unmount)', () => {
    expect(() => keepInViewport(null)).not.toThrow()
  })

  it('shifts an element that sticks out on the right back inside, with a margin', () => {
    screenWidth(375)
    const el = elementAt(250, 420)
    keepInViewport(el)
    expect(el.style.marginLeft).toBe('-53px')
  })

  it('shifts one that sticks out on the left', () => {
    screenWidth(375)
    const el = elementAt(-30, 120)
    keepInViewport(el)
    expect(el.style.marginLeft).toBe('38px')
  })

  it('leaves an element that fits with no shift at all', () => {
    screenWidth(375)
    const el = elementAt(50, 200)
    keepInViewport(el)
    expect(el.style.marginLeft).toBe('0px')
  })

  it('measures from where the element naturally is, so calling it again after a move re-fits it instead of stacking shifts', () => {
    screenWidth(375)
    const el = elementAt(250, 420)
    keepInViewport(el)
    keepInViewport(el)
    keepInViewport(el)
    expect(el.style.marginLeft).toBe('-53px')
  })
})

describe('verticalShiftToFit', () => {
  // An 812px-tall screen, 8px margin: the box may occupy y = 8..804.
  it('leaves a box that fits alone', () => {
    expect(verticalShiftToFit(100, 300, 812)).toBe(0)
  })
  it('shifts down by what it sticks out at the top, keeping a margin', () => {
    expect(verticalShiftToFit(-40, 160, 812)).toBe(48)
    expect(verticalShiftToFit(2, 160, 812)).toBe(6)
  })
  it('shifts up by what it sticks out at the bottom', () => {
    expect(verticalShiftToFit(700, 850, 812)).toBe(-46)
  })
})

describe('elements with a fake layout', () => {
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
    Reflect.deleteProperty(document.documentElement, 'clientHeight')
  })
  const screen = (w: number, h: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: w, configurable: true })
    Object.defineProperty(document.documentElement, 'clientHeight', { value: h, configurable: true })
  }
  // Reports where the element "is" at its natural spot, moving with the margins / flip we apply.
  const elementAt = (rect: { left: number; right: number; top: number; bottom: number }) => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => {
      const dx = parseFloat(el.style.marginLeft || '0')
      const dy = parseFloat(el.style.marginTop || '0')
      const flipped = el.style.top === '100%'
      // when flipped it opens below, which lands it fully on screen
      const height = rect.bottom - rect.top
      const top = flipped ? 300 : rect.top + dy
      return { left: rect.left + dx, right: rect.right + dx, top, bottom: top + height, width: rect.right - rect.left, height } as DOMRect
    }
    return el
  }

  describe('fitPopover (a dropdown that opens upward from its button)', () => {
    it('flips to open downward when opening upward would run off the top of the screen', () => {
      screen(375, 812)
      const el = elementAt({ left: 60, right: 340, top: -60, bottom: 180 })
      fitPopover(el)
      expect(el.style.top).toBe('100%')
      expect(el.style.bottom).toBe('auto')
      expect(el.style.marginBottom).toBe('0px')
    })

    it('stays open upward when it fits', () => {
      screen(375, 812)
      const el = elementAt({ left: 60, right: 340, top: 120, bottom: 300 })
      fitPopover(el)
      expect(el.style.top).toBe('')
      expect(el.style.bottom).toBe('')
    })

    it('also keeps it inside the screen sideways', () => {
      screen(375, 812)
      const el = elementAt({ left: 250, right: 420, top: 120, bottom: 300 })
      fitPopover(el)
      expect(el.style.marginLeft).toBe('-53px')
    })

    it('does nothing for null', () => {
      expect(() => fitPopover(null)).not.toThrow()
    })
  })

  describe('fitToolbar (the floating bar over a caption)', () => {
    it('nudges a bar that would leave the top of the screen back down, and one sticking out the side back in', () => {
      screen(375, 812)
      const el = elementAt({ left: -20, right: 340, top: -30, bottom: 30 })
      fitToolbar(el)
      expect(el.style.marginLeft).toBe('28px')
      expect(el.style.marginTop).toBe('38px')
    })

    it('leaves one that fits', () => {
      screen(375, 812)
      const el = elementAt({ left: 20, right: 340, top: 100, bottom: 160 })
      fitToolbar(el)
      expect(el.style.marginLeft).toBe('0px')
      expect(el.style.marginTop).toBe('0px')
    })

    it('does nothing for null', () => {
      expect(() => fitToolbar(null)).not.toThrow()
    })
  })
})

