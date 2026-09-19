import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollLock } from './useScrollLock'

const scrollTo = vi.fn()
const setScrollY = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true })

beforeEach(() => {
  scrollTo.mockReset()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  setScrollY(0)
})
afterEach(() => {
  document.body.removeAttribute('style')
})

describe('useScrollLock', () => {
  it('does nothing while inactive', () => {
    renderHook(() => useScrollLock(false))
    expect(document.body.style.position).toBe('')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('pins the page in place while active, at the current scroll offset so it does not jump to the top', () => {
    setScrollY(120)
    renderHook(() => useScrollLock(true))
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-120px')
    expect(document.body.style.width).toBe('100%')
  })

  it('puts everything back and restores the scroll position when it stops being active', () => {
    setScrollY(120)
    const { rerender } = renderHook(({ active }) => useScrollLock(active), { initialProps: { active: true } })
    rerender({ active: false })
    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(document.body.style.width).toBe('')
    expect(scrollTo).toHaveBeenCalledWith(0, 120)
  })

  it('restores the page even if it unmounts while locked', () => {
    setScrollY(80)
    const { unmount } = renderHook(() => useScrollLock(true))
    unmount()
    expect(document.body.style.position).toBe('')
    expect(scrollTo).toHaveBeenCalledWith(0, 80)
  })

  it("puts back whatever inline styles the page already had, rather than blanking them", () => {
    document.body.style.overflow = 'auto'
    document.body.style.position = 'relative'
    const { unmount } = renderHook(() => useScrollLock(true))
    unmount()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.body.style.position).toBe('relative')
  })
})
