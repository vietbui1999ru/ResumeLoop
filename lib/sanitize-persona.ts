/**
 * Sanitize user-provided persona_md before storage.
 * Removes constructs that could break the <untrusted_content> fence or
 * inject instructions into the system prompt.
 *
 * Runs BEFORE storage, not just before injection.
 */
export function sanitizePersonaMd(input: string): string {
  if (!input) return input

  // 1. Strip untrusted_content tags (would break the fence boundary)
  let result = input
    .replace(/<\/?untrusted_content[^>]*>/gi, '')

  // 2. Process line by line — remove dangerous lines
  const lines = result.split('\n')
  const filtered = lines.filter(line => {
    const trimmed = line.trim().toLowerCase()

    // Lines starting with "ignore previous" (common jailbreak prefix)
    if (trimmed.startsWith('ignore previous')) return false

    // ASCII "system:" or "SYSTEM:" prefix (not unicode lookalikes)
    if (/^system\s*:/i.test(line.trim())) return false

    // Token boundary markers used by some LLM tokenizers
    if (/<\|/.test(line) || /\|>/.test(line)) return false

    // ```system code fence opener
    if (/^```\s*system\b/i.test(line.trim())) return false

    return true
  })

  result = filtered.join('\n')

  // 3. Remove ---\nSYSTEM-style separator injections
  //    Pattern: horizontal rule followed by SYSTEM: on the next line
  result = result.replace(/---\s*\n\s*SYSTEM\s*:/gi, '---\n[removed]')

  return result
}
