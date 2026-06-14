import { z } from 'zod'

// ── Input schemas (what routes accept) ────────────────────────────────────────

export const JobPostInputSchema = z.object({
  content: z.string().min(1, 'content is required').max(200_000, 'content too large (200 KB max)'),
})

export const JobPatchInputSchema = z
  .object({
    hidden:     z.union([z.literal(0), z.literal(1)]).optional(),
    apply_url:  z.string().url('apply_url must be a valid URL').nullable().optional(),
    tags:       z.array(z.string()).optional(),
    role_title: z.string().min(1, 'role_title cannot be empty').optional(),
  })
  .strict()

// ── Output schemas (what routes return) ───────────────────────────────────────
// Internal fields MUST NOT appear here: is_demo, ip_hash, demo_encrypted_pwd

export const JobOutputSchema = z.object({
  id:         z.string(),
  company:    z.string(),
  role_title: z.string(),
  fit_pct:    z.number().nullable(),
  visa_status: z.string().nullable(),
})

export const JobDetailOutputSchema = z.object({
  id:         z.string(),
  company:    z.string(),
  role_title: z.string(),
  role_track: z.string().nullable(),
  fit_pct:    z.number().nullable(),
  visa_status: z.string().nullable(),
  tags:       z.string().nullable(),
  action:     z.string().nullable(),
  file_mtime: z.string().nullable(),
  scanned_at: z.string().nullable(),
  file_path:  z.string().nullable(),
  raw_content: z.string().nullable(),
  apply_url:  z.string().nullable(),
})

// ── Inferred types ─────────────────────────────────────────────────────────────

export type JobPostInput    = z.infer<typeof JobPostInputSchema>
export type JobPatchInput   = z.infer<typeof JobPatchInputSchema>
export type JobOutput       = z.infer<typeof JobOutputSchema>
export type JobDetailOutput = z.infer<typeof JobDetailOutputSchema>
