import { describe, it, expect } from 'vitest'
import { searchTemplates } from './templateSearch'

const t = (name: string, tags: string[] = [], description: string | null = null) => ({ name, tags, description })

const chicken = t('Skydiving Chicken', ['random', 'animals', 'absurd'], 'A chicken in a parachute rig.')
const batman = t('Batman Boosts Spider-Man', ['random', 'silly'], 'Batman helps Spider-Man over a wall.')
const two = t('Two Buttons', ['reaction', 'decision'], 'Two difficult, often contradicting decisions.')
const wanderer = t('Wanderer Above the Sea of Fog', ['random', 'art'], 'A painting of a man above the fog.')
const all = [chicken, batman, two, wanderer]

const names = (list: { name: string }[]) => list.map((x) => x.name)

describe('searchTemplates', () => {
  describe('empty query', () => {
    it.each(['', '   ', '!!!', ' - '])('returns everything in its given order for %j', (query) => {
      expect(searchTemplates(all, query)).toEqual(all)
    })

    it('returns a new array rather than the input itself', () => {
      expect(searchTemplates(all, '')).not.toBe(all)
    })
  })

  describe('what it searches', () => {
    it('matches a word in the name, ignoring case', () => {
      expect(names(searchTemplates(all, 'CHICKEN'))).toEqual(['Skydiving Chicken'])
    })

    it('matches a tag', () => {
      expect(names(searchTemplates(all, 'animals'))).toEqual(['Skydiving Chicken'])
      expect(names(searchTemplates(all, 'decision'))).toEqual(['Two Buttons'])
    })

    it('matches a word that is only in the description', () => {
      expect(names(searchTemplates(all, 'parachute'))).toEqual(['Skydiving Chicken'])
    })

    it('finds nothing for a word that appears nowhere', () => {
      expect(searchTemplates(all, 'zebra')).toEqual([])
    })

    it('tolerates a missing description and missing tags', () => {
      const plain = { name: 'Plain Photo' }
      expect(searchTemplates([plain], 'plain')).toEqual([plain])
      expect(searchTemplates([plain], 'zebra')).toEqual([])
      expect(searchTemplates([{ name: 'Nulls', tags: null, description: null }], 'nulls')).toHaveLength(1)
    })
  })

  describe('several words', () => {
    it('requires every word to match, and lets different words match different fields', () => {
      // "buttons" is in the name, "decision" is a tag.
      expect(names(searchTemplates(all, 'buttons decision'))).toEqual(['Two Buttons'])
      expect(names(searchTemplates(all, 'decision buttons'))).toEqual(['Two Buttons'])
    })

    it('drops a template when any one word fails to match', () => {
      expect(searchTemplates(all, 'buttons chicken')).toEqual([])
    })
  })

  describe('ranking', () => {
    it('puts a name match above a tag match above a description match', () => {
      const inDescription = t('Aaa', [], 'a foggy morning is not it, but the fog is')
      const inTag = t('Bbb', ['fog'], null)
      const inName = t('Fog Bank', [], null)
      // Deliberately given worst-first, so the sort has to reorder them.
      expect(names(searchTemplates([inDescription, inTag, inName], 'fog'))).toEqual(['Fog Bank', 'Bbb', 'Aaa'])
    })

    it('ranks an exact word above a prefix above a substring', () => {
      const bulldog = t('Bulldog')
      const doggo = t('Doggo')
      const dog = t('Dog')
      expect(names(searchTemplates([bulldog, doggo, dog], 'dog'))).toEqual(['Dog', 'Doggo', 'Bulldog'])
    })

    it('ranks a typo match below an exact match', () => {
      // "chiken" is exactly "Chiken" but only a one-letter typo of "Chicken".
      const typo = t('Chicken Dinner')
      const exact = t('Chiken Nugget')
      expect(names(searchTemplates([typo, exact], 'chiken'))).toEqual(['Chiken Nugget', 'Chicken Dinner'])
    })

    it('keeps the input order between equally good matches (so a usage-sorted list stays usage-sorted)', () => {
      const first = t('Cat Meme')
      const second = t('Cat Photo')
      const third = t('Cat Video')
      expect(names(searchTemplates([second, third, first], 'cat'))).toEqual(['Cat Photo', 'Cat Video', 'Cat Meme'])
    })

    it('scores by total across words, so matching more of the query ranks higher', () => {
      const both = t('Angry Hulk')
      const one = t('Angry Cat')
      expect(names(searchTemplates([one, both], 'angry hulk'))).toEqual(['Angry Hulk'])
      const onlyFirst = t('Angry Cat', ['hulk'])
      expect(names(searchTemplates([onlyFirst, both], 'angry hulk'))).toEqual(['Angry Hulk', 'Angry Cat'])
    })
  })

  describe('typos', () => {
    it('forgives one wrong, missing or extra letter, or a swap, in a word of 4+ letters', () => {
      expect(names(searchTemplates(all, 'chiken'))).toEqual(['Skydiving Chicken']) // missing letter
      expect(names(searchTemplates(all, 'chickan'))).toEqual(['Skydiving Chicken']) // wrong letter
      expect(names(searchTemplates(all, 'chickeen'))).toEqual(['Skydiving Chicken']) // extra letter
      expect(names(searchTemplates(all, 'chikcen'))).toEqual(['Skydiving Chicken']) // swapped letters
    })

    it('does not forgive typos in short words, where almost anything would match', () => {
      expect(searchTemplates([t('Car Crash')], 'cat')).toEqual([])
    })

    it('forgives only one edit in a word under 8 letters, but two in a word of 8 or more', () => {
      expect(searchTemplates(all, 'chicxxn')).toEqual([]) // 7 letters, 2 edits
      expect(names(searchTemplates(all, 'wanderxx'))).toEqual(['Wanderer Above the Sea of Fog']) // 8 letters, 2 edits
    })

    it('finds a typo in a tag or description too', () => {
      expect(names(searchTemplates(all, 'anmals'))).toEqual(['Skydiving Chicken'])
      expect(names(searchTemplates(all, 'parachtue'))).toEqual(['Skydiving Chicken'])
    })
  })

  describe('substrings and prefixes', () => {
    it('matches the start of a word', () => {
      expect(names(searchTemplates(all, 'chick'))).toEqual(['Skydiving Chicken'])
      expect(names(searchTemplates(all, 'c'))).toContain('Skydiving Chicken')
    })

    it('matches the middle of a word only from 3 letters, so 1-2 letters are not everywhere', () => {
      expect(names(searchTemplates([t('Bulldog')], 'dog'))).toEqual(['Bulldog'])
      expect(searchTemplates([t('Dog')], 'og')).toEqual([])
    })

    it('matches a name with the spaces and hyphens removed, so "spiderman" finds "Spider-Man"', () => {
      expect(names(searchTemplates(all, 'spiderman'))).toEqual(['Batman Boosts Spider-Man'])
    })
  })

  describe('normalizing', () => {
    it('ignores accents on either side', () => {
      expect(names(searchTemplates([t('Café Meme')], 'cafe'))).toEqual(['Café Meme'])
      expect(names(searchTemplates([t('Cafe Meme')], 'café'))).toEqual(['Cafe Meme'])
    })

    it('treats punctuation as word breaks', () => {
      expect(names(searchTemplates(all, 'spider-man'))).toEqual(['Batman Boosts Spider-Man'])
      expect(names(searchTemplates(all, '"buttons",'))).toEqual(['Two Buttons'])
    })
  })

  it('does not change the array it is given', () => {
    const input = [chicken, batman, two]
    const snapshot = [...input]
    searchTemplates(input, 'batman')
    expect(input).toEqual(snapshot)
  })
})
