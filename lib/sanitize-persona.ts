const PERSONA_MAX_CHARS = 2_000

/**
 * Sanitize user-provided persona_md before storage.
 * Removes constructs that could break the <untrusted_content> fence or
 * inject instructions into the system prompt.
 *
 * Runs BEFORE storage, not just before injection.
 */
export function sanitizePersonaMd(input: string): string {
  if (!input) return input

  // 1. Enforce char budget — limits how much injected content can fit
  let result = input.slice(0, PERSONA_MAX_CHARS)

  // 2. Strip ALL XML/HTML-like tags — prevents closing/reopening the fence boundary
  result = result.replace(/<[^>]{0,200}>/g, '')

  // 3. Strip control characters except newline and tab
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // 4. Strip LLM tokenizer boundary markers (<|...|> and |>...<|)
  result = result.replace(/<\|[^|]*\|>/g, '').replace(/\|>/g, '').replace(/<\|/g, '')

  // 5. Process line by line — remove injection-pattern lines
  const lines = result.split('\n')
  const filtered = lines.filter(line => {
    const trimmed = line.trim().toLowerCase()
    if (trimmed.startsWith('ignore previous'))           return false
    if (/^system\s*:/i.test(line.trim()))                return false
    if (/^```\s*system\b/i.test(line.trim()))            return false
    return true
  })

  result = filtered.join('\n')

  // 6. Remove ---\nSYSTEM-style separator injections
  result = result.replace(/---\s*\n\s*SYSTEM\s*:/gi, '---\n[removed]')

  return result
}
