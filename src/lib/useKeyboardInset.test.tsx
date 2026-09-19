import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardInset } from './useKeyboardInset'

// The part of the screen the on-screen keyboard covers is the gap between the
// layout viewport (window.innerHeight — doesn't change when the keyboard opens) and
// the visual viewport (what's actually visible — shrinks).
function stubVisualViewport(initial: { height: number; offsetTop?: number; scale?: number }) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number; scale: number }
  target.height = initial.height
  target.offsetTop = initial.offsetTop ?? 0
  target.scale = initial.scale ?? 1
  Object.defineProperty(window, 'visualViewport', { value: target, configurable: true })
  return {
    change(next: Partial<{ height: number; offsetTop: number; scale: number }>) {
      Object.assign(target, next)
      target.dispatchEvent(new Event('resize'))
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
})
afterEach(() => {
  Reflect.deleteProperty(window, 'visualViewport')
})

describe('useKeyboardInset', () => {
  it('is 0 when the whole screen is visible', () => {
    stubVisualViewport({ height: 800 })
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0)
  })

  it('is the height of the keyboard once it opens, and back to 0 when it closes', () => {
    const vv = stubVisualViewport({ height: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    act(() => vv.change({ height: 480 }))
    expect(result.current).toBe(320)
    act(() => vv.change({ height: 800 }))
    expect(result.current).toBe(0)
  })

  it('accounts for the page having been scrolled up by the browser to keep the caret in view', () => {
    const vv = stubVisualViewport({ height: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    act(() => vv.change({ height: 480, offsetTop: 60 }))
    expect(result.current).toBe(260) // 800 - 480 - 60
  })

  it('ignores small differences, like the browser toolbar collapsing, which are not a keyboard', () => {
    const vv = stubVisualViewport({ height: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    act(() => vv.change({ height: 740 }))
    expect(result.current).toBe(0)
  })

  it('ignores pinch-zoom, which also shrinks the visual viewport without any keyboard', () => {
    const vv = stubVisualViewport({ height: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    act(() => vv.change({ height: 400, scale: 2 }))
    expect(result.current).toBe(0)
  })

  it('is 0 where the browser has no visualViewport', () => {
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0)
  })
})
