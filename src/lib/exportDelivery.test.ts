import { describe, it, expect } from 'vitest'
import { sanitizeFilename } from './exportDelivery'

describe('sanitizeFilename', () => {
  it('replaces runs of non-alphanumeric characters with a single dash', () => {
    expect(sanitizeFilename('Two Buttons 1')).toBe('Two-Buttons-1')
  })

  it('strips leading/trailing dashes left over from punctuation at the edges', () => {
    expect(sanitizeFilename('  !!Drake??  ')).toBe('Drake')
  })

  it('falls back to "meme" for a name that sanitizes to nothing', () => {
    expect(sanitizeFilename('???')).toBe('meme')
  })
})
