import { describe, it, expect, afterEach } from 'vitest'
import { horizontalShiftToFit, keepInViewport } from './viewportClamp'

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
