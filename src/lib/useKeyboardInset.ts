import { useSyncExternalStore } from 'react'

// How many px of the bottom of the screen the on-screen keyboard is covering, so a
// bar docked to the bottom can sit ABOVE it. Phone browsers don't move `position:
// fixed` elements up when the keyboard opens: the layout viewport (window.innerHeight)
// stays the same and only the *visual* viewport shrinks — so the covered part is the
// gap between them.
//
// Small gaps are ignored (the browser toolbar collapsing is ~50-80px; keyboards are
// 250px+), as is anything while pinch-zoomed, which shrinks the visual viewport too.
const MIN_KEYBOARD_PX = 120

function getInset(): number {
  const viewport = window.visualViewport
  if (!viewport || viewport.scale > 1.01) return 0
  const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  return covered >= MIN_KEYBOARD_PX ? covered : 0
}

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', onChange)
  viewport?.addEventListener('scroll', onChange)
  return () => {
    viewport?.removeEventListener('resize', onChange)
    viewport?.removeEventListener('scroll', onChange)
  }
}

export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, getInset, () => 0)
}
