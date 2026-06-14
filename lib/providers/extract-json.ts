/**
 * Pull the last JSON object out of a (possibly noisy) CLI text response.
 *
 * BYO-CLI brains in headless mode interleave reasoning, markdown, and prose
 * around their answer. We instruct them to emit a fenced ```json block last, so
 * the LAST fenced block (or the last bare object) is the authoritative answer —
 * earlier blocks are typically drafts the model talked through.
 *
 * Returns the JSON substring (still a string — caller does JSON.parse), or null.
 */
export function extractLastJsonBlock(text: string): string | null {
  const trimmed = text.trim()

  // Prefer the last ```json ... ``` (or unlabeled ``` ... ```) fenced block.
  const fences = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  if (fences.length > 0) {
    const lastFence = fences[fences.length - 1][1]
    const fromFence = sliceOutermostObject(lastFence)
    if (fromFence) return fromFence
  }

  // No usable fence — fall back to the outermost {...} in the whole string.
  return sliceOutermostObject(trimmed)
}

function sliceOutermostObject(s: string): string | null {
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return s.slice(start, end + 1).trim()
}
