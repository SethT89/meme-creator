interface TemplateLike {
  id: string
  name: string
}

interface UsageEventLike {
  template_id: string
}

export function sortTemplatesByUsage<T extends TemplateLike>(templates: T[], usageEvents: UsageEventLike[]): T[] {
  const counts = new Map<string, number>()
  for (const event of usageEvents) {
    counts.set(event.template_id, (counts.get(event.template_id) ?? 0) + 1)
  }
  return [...templates].sort((a, b) => {
    const countDiff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    if (countDiff !== 0) return countDiff
    return a.name.localeCompare(b.name)
  })
}
