import { describe, it, expect } from 'vitest'
import { sortTemplatesByUsage } from './templateUsage'

const templates = [
  { id: 't1', name: 'Two Buttons' },
  { id: 't2', name: 'Drake' },
  { id: 't3', name: 'Distracted Boyfriend' },
]

describe('sortTemplatesByUsage', () => {
  it('sorts templates by descending usage event count', () => {
    const usageEvents = [
      { template_id: 't2' },
      { template_id: 't2' },
      { template_id: 't2' },
      { template_id: 't1' },
    ]
    const sorted = sortTemplatesByUsage(templates, usageEvents)
    expect(sorted.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
  })

  it('breaks ties alphabetically by name', () => {
    const usageEvents = [{ template_id: 't1' }, { template_id: 't3' }]
    const sorted = sortTemplatesByUsage(templates, usageEvents)
    // t1 (Two Buttons) and t3 (Distracted Boyfriend) are tied at 1 use each —
    // Distracted Boyfriend sorts first alphabetically. t2 (Drake, 0 uses) is last.
    expect(sorted.map((t) => t.id)).toEqual(['t3', 't1', 't2'])
  })

  it('templates with no usage events at all sort last, alphabetically among themselves', () => {
    const sorted = sortTemplatesByUsage(templates, [])
    expect(sorted.map((t) => t.id)).toEqual(['t3', 't2', 't1']) // Distracted Boyfriend, Drake, Two Buttons
  })

  it('returns an empty array for no templates', () => {
    expect(sortTemplatesByUsage([], [])).toEqual([])
  })
})
