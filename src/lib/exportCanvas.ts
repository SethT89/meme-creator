// Canvas has no built-in word-wrap — greedily fills each line up to
// maxWidth, approximating (not guaranteeing pixel-identical to) the
// browser's own text wrapping in the live DOM editor.
export function wrapTextLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let currentLine = words[0]

  for (const word of words.slice(1)) {
    const testLine = `${currentLine} ${word}`
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  lines.push(currentLine)
  return lines
}
