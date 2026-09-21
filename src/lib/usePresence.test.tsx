import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresence } from './usePresence'

const EXIT_MS = 200

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

// Two frames: the element has to be painted in its starting position before it is moved,
// or the browser has nothing to animate from.
const twoFrames = () => act(() => void vi.advanceTimersByTime(40))

describe('usePresence', () => {
  it('is absent while closed', () => {
    const { result } = renderHook(() => usePresence(false, EXIT_MS))
    expect(result.current).toEqual({ mounted: false, shown: false })
  })

  it('mounts at once when opened, but only shows it a couple of frames later so the CSS transition has a start to animate from', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, EXIT_MS), { initialProps: { open: false } })
    rerender({ open: true })
    expect(result.current).toEqual({ mounted: true, shown: false })

    twoFrames()
    expect(result.current).toEqual({ mounted: true, shown: true })
  })

  it('starts hiding at once when closed, but stays mounted until the exit animation has had time to play', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, EXIT_MS), { initialProps: { open: false } })
    rerender({ open: true })
    twoFrames()

    rerender({ open: false })
    expect(result.current).toEqual({ mounted: true, shown: false })

    act(() => void vi.advanceTimersByTime(EXIT_MS - 1))
    expect(result.current.mounted).toBe(true)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toEqual({ mounted: false, shown: false })
  })

  it('plays the entrance again on the next open', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, EXIT_MS), { initialProps: { open: true } })
    twoFrames()
    rerender({ open: false })
    act(() => void vi.advanceTimersByTime(EXIT_MS))

    rerender({ open: true })
    expect(result.current).toEqual({ mounted: true, shown: false }) // back at the start position
    twoFrames()
    expect(result.current.shown).toBe(true)
  })

  it('reopening mid-exit brings it straight back and cancels the pending removal', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, EXIT_MS), { initialProps: { open: true } })
    twoFrames()
    rerender({ open: false })
    act(() => void vi.advanceTimersByTime(EXIT_MS / 2))

    rerender({ open: true })
    expect(result.current).toEqual({ mounted: true, shown: true })
    act(() => void vi.advanceTimersByTime(EXIT_MS * 2))
    expect(result.current.mounted).toBe(true)
  })

  it('skips the exit delay for people who asked their device to reduce motion', () => {
    window.matchMedia = vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })) as unknown as typeof window.matchMedia
    const { result, rerender } = renderHook(({ open }) => usePresence(open, EXIT_MS), { initialProps: { open: true } })
    twoFrames()

    rerender({ open: false })
    act(() => void vi.advanceTimersByTime(0))
    expect(result.current.mounted).toBe(false)
  })

  it('still shows it if animation frames are throttled (a background tab, a busy phone) — it must never stay parked off-screen', () => {
    const realRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (() => 0) as unknown as typeof window.requestAnimationFrame // frames never arrive
    try {
      const { result } = renderHook(() => usePresence(true, EXIT_MS))
      expect(result.current.shown).toBe(false)
      act(() => void vi.advanceTimersByTime(200))
      expect(result.current).toEqual({ mounted: true, shown: true })
    } finally {
      window.requestAnimationFrame = realRaf
    }
  })
})
