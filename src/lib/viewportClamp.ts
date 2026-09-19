// Keeps floating UI (the text toolbar and its dropdowns) on screen. Those are
// centered on whatever they belong to — a caption, a button — so on a phone,
// where the canvas fills the width, anything near an edge would otherwise run off
// it and become unreachable.

const MARGIN = 8

// How far (px) to shift something spanning start..end so it sits within
// margin..size-margin along one axis. Something bigger than that can't fit, so its
// start is lined up with the margin — the start of a toolbar stays reachable.
function shiftToFit(start: number, end: number, size: number, margin: number): number {
  if (end - start > size - 2 * margin) return margin - start
  if (start < margin) return margin - start
  if (end > size - margin) return size - margin - end
  return 0
}

export function horizontalShiftToFit(left: number, right: number, viewportWidth: number, margin = MARGIN): number {
  return shiftToFit(left, right, viewportWidth, margin)
}

export function verticalShiftToFit(top: number, bottom: number, viewportHeight: number, margin = MARGIN): number {
  return shiftToFit(top, bottom, viewportHeight, margin)
}

// Shifts the element sideways with a left margin so it's inside the viewport. It
// first removes its own previous shift, so re-running after the element has moved
// re-fits it from where it now naturally is instead of piling shifts up. Runs in the
// commit phase, before paint, so there's no visible jump. Works for both
// `position: fixed` and absolutely positioned elements.
function shiftHorizontally(el: HTMLElement): void {
  el.style.marginLeft = '0px'
  const { left, right } = el.getBoundingClientRect()
  const shift = horizontalShiftToFit(left, right, document.documentElement.clientWidth)
  if (shift !== 0) el.style.marginLeft = `${shift}px`
}

// A ref callback: keep the element inside the viewport horizontally.
export function keepInViewport(el: HTMLElement | null): void {
  if (!el) return
  shiftHorizontally(el)
}

// A ref callback for a dropdown that opens UPWARD from its button (the toolbar's
// menus). Fits it sideways, and if opening upward would run off the top of the
// screen — the toolbar is often near the top, and the color picker is tall — flips
// it to open downward instead. (It's re-measured from its natural upward position
// first, so calling it again re-decides rather than compounding.)
export function fitPopover(el: HTMLElement | null): void {
  if (!el) return
  el.style.top = ''
  el.style.bottom = ''
  el.style.marginBottom = ''
  el.style.marginTop = ''
  shiftHorizontally(el)
  if (el.getBoundingClientRect().top < MARGIN) {
    el.style.bottom = 'auto'
    el.style.top = '100%'
    el.style.marginBottom = '0px'
    el.style.marginTop = '0.5rem'
  }
}

// A ref callback for the floating bar itself, which sits above its caption: fits it
// sideways, and nudges it down if it would leave the top of the screen (it then
// overlaps the caption a little, but stays reachable).
export function fitToolbar(el: HTMLElement | null): void {
  if (!el) return
  el.style.marginTop = '0px'
  shiftHorizontally(el)
  const { top, bottom } = el.getBoundingClientRect()
  const shift = verticalShiftToFit(top, bottom, document.documentElement.clientHeight)
  if (shift !== 0) el.style.marginTop = `${shift}px`
}
