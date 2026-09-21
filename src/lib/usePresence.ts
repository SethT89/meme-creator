import { useEffect, useState } from 'react'

// Lets something animate in AND out, when it is otherwise shown/hidden by mounting/unmounting.
//
//   mounted  render it: true from the moment `open` turns true until its exit has had time to play
//   shown    apply its on-screen styles. It is false for the first couple of frames after mounting so
//            the browser paints the element in its STARTING position first — without that there is
//            nothing to animate from — and false again as soon as `open` turns false, which is what
//            starts the exit transition (the element stays mounted for `exitMs` while it plays).
//
// People who asked their device to reduce motion get no exit delay (their CSS has no transition).
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  // Mount in the very render that `open` turns true, so there is no blank frame first. Adjusting
  // state while rendering is React's supported way to derive state from a changing prop.
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!open) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true))
    })
    // Frames can be throttled or paused (a background tab, a very busy phone). Show it anyway
    // after a beat — it must never stay parked off-screen; at worst it just appears without sliding.
    const fallback = setTimeout(() => setEntered(true), 120)
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      clearTimeout(fallback)
    }
  }, [open])

  useEffect(() => {
    if (open || !mounted) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timer = setTimeout(
      () => {
        setMounted(false)
        setEntered(false)
      },
      reducedMotion ? 0 : exitMs,
    )
    return () => clearTimeout(timer)
  }, [open, mounted, exitMs])

  return { mounted, shown: open && entered }
}
