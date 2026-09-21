import { useEffect } from 'react'

// Stops the page behind an overlay (a dialog, the mobile template drawer) from scrolling
// while `active`.
//
// `overflow: hidden` on the body isn't enough: iOS Safari lets you keep scrolling
// the page underneath. Pinning the body with position:fixed is the version that
// works everywhere, but it snaps the page to the top — so the scroll offset is
// carried into `top` while locked and restored with scrollTo afterwards.
// Whatever inline styles the body had are put back exactly.
//
// Locks can overlap (a dialog opens in the same moment the drawer closes), so this is
// counted: the page is pinned by the first lock and released by the last. Without that, a
// second lock would record the already-pinned body (scroll offset 0) as "how the page was",
// and the page would jump to the top when it finally released.
let activeLocks = 0
let saved: { scrollY: number; previous: Record<'position' | 'top' | 'left' | 'right' | 'width', string> } | null = null

function lock() {
  activeLocks += 1
  if (activeLocks > 1) return
  const body = document.body
  saved = {
    scrollY: window.scrollY,
    previous: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    },
  }
  body.style.position = 'fixed'
  body.style.top = `-${saved.scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
}

function unlock() {
  activeLocks -= 1
  if (activeLocks > 0 || !saved) return
  const body = document.body
  body.style.position = saved.previous.position
  body.style.top = saved.previous.top
  body.style.left = saved.previous.left
  body.style.right = saved.previous.right
  body.style.width = saved.previous.width
  const { scrollY } = saved
  saved = null
  window.scrollTo(0, scrollY)
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
