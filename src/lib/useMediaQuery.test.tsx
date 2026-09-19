import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

// A controllable stand-in for the browser's matchMedia.
function stubMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const removeSpy = vi.fn((_: string, cb: () => void) => listeners.delete(cb))
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: removeSpy,
  })) as unknown as typeof window.matchMedia
  return {
    set(value: boolean) {
      matches = value
      listeners.forEach((cb) => cb())
    },
    listeners,
    removeSpy,
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('useMediaQuery', () => {
  it('reports whether the query matches right now', () => {
    stubMatchMedia(true)
    expect(renderHook(() => useMediaQuery('(max-width: 639px)')).result.current).toBe(true)
    stubMatchMedia(false)
    expect(renderHook(() => useMediaQuery('(max-width: 639px)')).result.current).toBe(false)
  })

  it('asks the browser about the query it was given', () => {
    stubMatchMedia(false)
    renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 639px)')
  })

  it('updates when the screen changes (e.g. rotating a phone)', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(result.current).toBe(false)
    act(() => media.set(true))
    expect(result.current).toBe(true)
    act(() => media.set(false))
    expect(result.current).toBe(false)
  })

  it('stops listening when the component goes away', () => {
    const media = stubMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(media.listeners.size).toBe(1)
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('says no where matchMedia does not exist (tests, very old browsers)', () => {
    expect(renderHook(() => useMediaQuery('(max-width: 639px)')).result.current).toBe(false)
  })
})
