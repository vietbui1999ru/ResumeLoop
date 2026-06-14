import { z } from 'zod'

// ── Input schemas (what routes accept) ────────────────────────────────────────

const VALID_STATUSES = ['not_contacted', 'drafted', 'sent', 'replied'] as const
const VALID_ROLES    = ['recruiter', 'hiring_manager', 'alumni', 'employee', 'other'] as const

export const OutreachPatchInputSchema = z
  .object({
    role:           z.enum(VALID_ROLES).nullable().optional(),
    role_custom:    z.string().nullable().optional(),
    notes:          z.string().nullable().optional(),
    email:          z.string().email('Invalid email format').nullable().optional(),
    status:         z.enum(VALID_STATUSES).optional(),
    linkedin_draft: z.string().nullable().optional(),
    email_draft:    z.string().nullable().optional(),
  })
  .strict()

// ── Inferred types ─────────────────────────────────────────────────────────────

export type OutreachPatchInput = z.infer<typeof OutreachPatchInputSchema>
