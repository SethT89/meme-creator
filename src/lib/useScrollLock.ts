import { useEffect } from 'react'

// Stops the page behind an overlay (the mobile template drawer) from scrolling
// while `active`.
//
// `overflow: hidden` on the body isn't enough: iOS Safari lets you keep scrolling
// the page underneath. Pinning the body with position:fixed is the version that
// works everywhere, but it snaps the page to the top — so the scroll offset is
// carried into `top` while locked and restored with scrollTo afterwards.
// Whatever inline styles the body had are put back exactly.
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const body = document.body
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
