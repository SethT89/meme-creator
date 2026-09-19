// Ranked, typo-tolerant search over templates (name, tags, description). Pure
// and dependency-free, so it's tested like the rest of this app's logic.
//
// Runs in the browser over the already-loaded template list. That's the right
// tool for hundreds of templates; if the library ever reaches thousands, this
// is the one function to swap for a server-side query (Postgres full-text +
// pg_trgm) — the ranking rules below are the contract to preserve.

interface SearchableTemplate {
  name: string
  tags?: string[] | null
  description?: string | null
}

const FIELD_WEIGHT = { name: 3, tags: 2, description: 1 } as const

// How good a single query-word/field-word match is. 0 = no match.
const EXACT = 4
const PREFIX = 3
const SUBSTRING = 2
const TYPO = 1

// Lowercase, drop accents, and treat any run of punctuation/whitespace as a
// word break ("Spider-Man" → "spider", "man").
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

// Optimal string alignment distance: insert, delete, substitute, or swap two
// neighbouring letters, each costing 1. A swap ("chikcen") is the commonest
// real typo, so it must not cost 2.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[rows - 1][cols - 1]
}

function matchQuality(query: string, word: string): number {
  if (word === query) return EXACT
  if (word.startsWith(query)) return PREFIX
  // Mid-word matches only from 3 letters: "og" would otherwise hit every "dog".
  if (query.length >= 3 && word.includes(query)) return SUBSTRING
  // Typos only in longer words, where a near-miss is unlikely to be a
  // different real word: 1 edit up to 7 letters, 2 edits from 8.
  if (query.length >= 4 && word.length >= 4) {
    const allowed = query.length >= 8 ? 2 : 1
    if (Math.abs(query.length - word.length) <= allowed && editDistance(query, word) <= allowed) return TYPO
  }
  return 0
}

interface IndexedTemplate<T> {
  template: T
  index: number
  name: string[]
  // The name with every break removed, so "spiderman" finds "Spider-Man".
  compactName: string
  tags: string[]
  description: string[]
}

function bestQuality(query: string, fieldWords: string[]): number {
  let best = 0
  for (const word of fieldWords) best = Math.max(best, matchQuality(query, word))
  return best
}

// Best weight × quality for one query word across all of a template's fields.
function scoreWord<T>(query: string, item: IndexedTemplate<T>): number {
  const inName = bestQuality(query, item.name)
  const inCompactName = query.length >= 3 && item.compactName.includes(query) ? SUBSTRING : 0
  return Math.max(
    FIELD_WEIGHT.name * Math.max(inName, inCompactName),
    FIELD_WEIGHT.tags * bestQuality(query, item.tags),
    FIELD_WEIGHT.description * bestQuality(query, item.description),
  )
}

// Every query word must match somewhere (a template failing any word is
// dropped). Results are ordered best-first; equal scores keep the input order,
// so a list that arrives sorted by usage stays usage-sorted among ties.
export function searchTemplates<T extends SearchableTemplate>(templates: T[], query: string): T[] {
  const queryWords = words(query)
  if (queryWords.length === 0) return [...templates]

  const scored: { template: T; index: number; score: number }[] = []
  templates.forEach((template, index) => {
    const nameWords = words(template.name)
    const item: IndexedTemplate<T> = {
      template,
      index,
      name: nameWords,
      compactName: nameWords.join(''),
      tags: (template.tags ?? []).flatMap(words),
      description: words(template.description ?? ''),
    }
    let total = 0
    for (const word of queryWords) {
      const score = scoreWord(word, item)
      if (score === 0) return // this word matches nothing: drop the template
      total += score
    }
    scored.push({ template, index, score: total })
  })

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.template)
}
