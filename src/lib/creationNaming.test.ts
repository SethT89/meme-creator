import { describe, it, expect } from 'vitest'
import { nextAvailableName, suggestTags } from './creationNaming'

describe('nextAvailableName', () => {
  it('returns "Base 1" when no existing names match', () => {
    expect(nextAvailableName('Drake', [])).toBe('Drake 1')
  })

  it('returns the next number after the highest existing match', () => {
    expect(nextAvailableName('Drake', ['Drake 1', 'Drake 2', 'Other'])).toBe('Drake 3')
  })

  it('ignores non-matching names with the same prefix', () => {
    expect(nextAvailableName('Drake', ['Drake Remix'])).toBe('Drake 1')
  })
})

describe('suggestTags', () => {
  const existing = [
    { tags: ['funny', 'work'] },
    { tags: ['funny'] },
    { tags: ['future-classic'] },
  ]

  it('ranks matching tags by frequency, most-used first', () => {
    expect(suggestTags(existing, 'fu')).toEqual(['funny', 'future-classic'])
  })

  it('is case-insensitive', () => {
    expect(suggestTags(existing, 'FU')).toEqual(['funny', 'future-classic'])
  })

  it('returns nothing for an empty query', () => {
    expect(suggestTags(existing, '')).toEqual([])
  })
})
