import { describe, it, expect } from 'vitest'
import { wrapTextLines } from './exportCanvas'

// A fixed 10px-per-character stub — real font metrics aren't available in
// jsdom, and this keeps assertions simple and deterministic.
const fakeCtx = { measureText: (text: string) => ({ width: text.length * 10 }) }

describe('wrapTextLines', () => {
  it('returns an empty array for blank text', () => {
    expect(wrapTextLines(fakeCtx, '', 1000)).toEqual([])
    expect(wrapTextLines(fakeCtx, '   ', 1000)).toEqual([])
  })

  it('keeps everything on one line when it fits', () => {
    expect(wrapTextLines(fakeCtx, 'a b c', 1000)).toEqual(['a b c'])
  })

  it('breaks onto a new line once adding a word would exceed maxWidth', () => {
    // 'aaaaaaaaaa' is 100px. Adding ' bbbbbbbbbb' makes the line 210px,
    // over a 150px maxWidth, so it wraps onto its own line instead.
    expect(wrapTextLines(fakeCtx, 'aaaaaaaaaa bbbbbbbbbb', 150)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb'])
  })

  it('puts an unbreakably long single word on its own line rather than dropping it', () => {
    expect(wrapTextLines(fakeCtx, 'supercalifragilistic', 50)).toEqual(['supercalifragilistic'])
  })
})
