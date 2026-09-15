export function nextAvailableName(base: string, existingNames: string[]): string {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`)
  let highest = 0
  for (const name of existingNames) {
    const match = pattern.exec(name)
    if (match) {
      const n = Number(match[1])
      if (n > highest) highest = n
    }
  }
  return `${base} ${highest + 1}`
}

export function suggestTags(
  existing: Array<{ tags: string[] }>,
  query: string,
): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []

  const counts = new Map<string, number>()
  for (const { tags } of existing) {
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .filter(([tag]) => tag.toLowerCase().startsWith(trimmed))
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
}
