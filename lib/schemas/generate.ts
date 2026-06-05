import { z } from 'zod'

// ── Input schemas (what routes accept) ────────────────────────────────────────

export const GenerateInputSchema = z.object({
  jobIds: z
    .array(z.string())
    .min(1, 'jobIds must be non-empty array')
    .max(50, 'Too many jobs — max 50 per request'),
})

// ── Output schemas (what routes return) ───────────────────────────────────────

export const GenerateOutputSchema = z.object({
  ok:        z.literal(true),
  validated: z.array(z.string()),
  message:   z.string().optional(),
  warning:   z.literal(true).optional(),
  missing:   z.array(z.string()).optional(),
})

// ── Inferred types ─────────────────────────────────────────────────────────────

export type GenerateInput  = z.infer<typeof GenerateInputSchema>
export type GenerateOutput = z.infer<typeof GenerateOutputSchema>
