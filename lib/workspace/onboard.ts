import fs from 'node:fs'
import { z } from 'zod'
import type { CliRunner } from '../providers/types'
import { getRunner } from '../providers/factory'
import { createAdapter } from '../providers/adapter'
import { profilePath } from './paths'
import { readProfile } from './read'

/**
 * Phase-1 onboarding helpers (ADR 0001 §8) — deterministic, no AI content
 * generation. The only model interaction is a liveness ping to confirm the
 * chosen provider actually works before the user relies on it.
 */

const PingSchema = z.object({ ok: z.literal(true) })

/**
 * Validate a provider with a real test spawn: route a trivial structured prompt
 * through the adapter and confirm it returns the expected object. Never throws —
 * returns { ok, detail } so the wizard can show a clear message.
 */
export async function validateProvider(
  providerId: string,
  opts: { runner?: CliRunner; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; detail: string }> {
  let runner = opts.runner
  if (!runner) {
    try {
      runner = getRunner(providerId)
    } catch (e) {
      return { ok: false, detail: (e as Error).message }
    }
  }
  try {
    await createAdapter(runner).runStructured(
      PingSchema,
      'Health check. Reply with exactly {"ok": true} and nothing else.',
      { shapeHint: '{ "ok": true }', signal: opts.signal },
    )
    return { ok: true, detail: `${providerId} is responding` }
  } catch (e) {
    return { ok: false, detail: (e as Error).message.slice(0, 300) }
  }
}

export interface ProfileBasics {
  name?: string
  email?: string
  location?: string
  targetRoles?: string[]
}

/**
 * Merge basic profile fields into the workspace profile.json. Idempotent: only
 * the provided fields are written; existing data (and template fields) are kept.
 */
export function setProfileBasics(root: string | undefined, basics: ProfileBasics): void {
  const profile = ((readProfile(root) as Record<string, unknown>) ?? {})
  const contact = { ...((profile.contact as Record<string, unknown>) ?? {}) }
  if (basics.name != null) contact.name = basics.name
  if (basics.email != null) contact.email = basics.email
  if (basics.location != null) contact.location = basics.location
  profile.contact = contact
  if (basics.targetRoles != null) profile.target_roles = basics.targetRoles
  fs.writeFileSync(profilePath(root), JSON.stringify(profile, null, 2) + '\n')
}
