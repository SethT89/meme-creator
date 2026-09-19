// Keeps floating UI (the text toolbar and its dropdowns) on screen. Those are
// centered on whatever they belong to — a caption, a button — so on a phone,
// where the canvas fills the width, anything near either edge would otherwise
// run off it and become unreachable.

// How far (px) to shift a box spanning left..right so it sits within
// margin..viewportWidth-margin. A box wider than that can't fit, so its left edge
// is lined up with the margin — the start of a toolbar stays reachable.
export function horizontalShiftToFit(left: number, right: number, viewportWidth: number, margin = 8): number {
  if (right - left > viewportWidth - 2 * margin) return margin - left
  if (left < margin) return margin - left
  if (right > viewportWidth - margin) return viewportWidth - margin - right
  return 0
}

// A ref callback: shifts the element with a left margin so it's inside the
// viewport. It first removes its own previous shift, so re-running after the
// element has moved re-fits it from where it now naturally is instead of piling
// shifts up. Runs in the commit phase, before paint, so there's no visible jump.
// Works for both `position: fixed` and absolutely positioned elements.
export function keepInViewport(el: HTMLElement | null): void {
  if (!el) return
  el.style.marginLeft = '0px'
  const { left, right } = el.getBoundingClientRect()
  const shift = horizontalShiftToFit(left, right, document.documentElement.clientWidth)
  if (shift !== 0) el.style.marginLeft = `${shift}px`
}
