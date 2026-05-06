interface HasTags { tags: string }

export function parseTags(job: HasTags): string[] {
  try {
    const parsed = JSON.parse(job.tags ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function extractAllTags(jobs: HasTags[]): string[] {
  const set = new Set<string>()
  for (const job of jobs) {
    for (const tag of parseTags(job)) set.add(tag)
  }
  return Array.from(set).sort()
}

export function jobMatchesTagFilter(job: HasTags, tagFilter: string): boolean {
  if (!tagFilter) return true
  return parseTags(job).includes(tagFilter)
}
