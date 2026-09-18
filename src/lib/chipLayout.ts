// Whether chips of these widths, wrapped greedily left to right into a row
// `containerWidth` wide, need no more than `maxLines` lines. A chip wider than
// the row is clamped to the row's width — the chip itself truncates its text.
function fitsInLines(widths: number[], containerWidth: number, gap: number, maxLines: number): boolean {
  let lines = 1
  let x = 0
  for (const raw of widths) {
    const w = Math.min(raw, containerWidth)
    if (x === 0) {
      x = w
    } else if (x + gap + w > containerWidth) {
      lines++
      x = w
    } else {
      x += gap + w
    }
  }
  return lines <= maxLines
}

// How many of the leading chips to show so that everything fits in `maxLines`
// lines: all of them if they fit as-is, otherwise as many as still leave room
// for a trailing "+N" chip (`plusWidth` wide) on the last line.
//
// Pure layout arithmetic on measured widths, so it can be tested without a
// browser. A zero container width means the row hasn't been measured (or
// there's no layout engine at all, as in jsdom): show everything.
export function countVisibleChips(
  chipWidths: number[],
  plusWidth: number,
  containerWidth: number,
  gap: number,
  maxLines: number,
): number {
  const n = chipWidths.length
  if (containerWidth <= 0 || fitsInLines(chipWidths, containerWidth, gap, maxLines)) return n
  for (let k = n - 1; k > 0; k--) {
    if (fitsInLines([...chipWidths.slice(0, k), plusWidth], containerWidth, gap, maxLines)) return k
  }
  return 0 // not even one chip plus "+N" fits, so only the +N chip is shown
}
