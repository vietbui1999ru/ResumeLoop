import fs from 'node:fs'
import { z } from 'zod'
import type { CliRunner } from '../providers/types'
import { createAdapter } from '../providers/adapter'
import { profilePath } from './paths'
import { readProfile } from './read'

/**
 * AI-assisted profile import (ADR 0001 §8, onboarding phase 2). The brain
 * extracts structured resume data from pasted CV text; the result is mapped into
 * the profile.json shape (defaulting to the `genai` variant) for the user to
 * confirm before saving.
 */
export const ExtractedProfileSchema = z.object({
  experience: z.array(z.object({
    id:       z.string().min(1),
    title:    z.string(),
    company:  z.string(),
    location: z.string().optional().default(''),
    dates:    z.string().optional().default(''),
    bullets:  z.array(z.string()).default([]),
  })).default([]),
  projects: z.array(z.object({
    id:          z.string().min(1),
    name:        z.string(),
    short_stack: z.string().optional().default(''),
    dates:       z.string().optional().default(''),
    url:         z.string().optional().default(''),
    bullets:     z.array(z.string()).default([]),
  })).default([]),
  // category label → comma-separated tech list, e.g. { Languages: "Python, Go" }
  skills: z.record(z.string(), z.string()).default({}),
})
export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>

/** Extract structured profile data from CV text via the configured provider. */
export async function extractProfile(
  cvText: string,
  runner: CliRunner,
  signal?: AbortSignal,
): Promise<ExtractedProfile> {
  const prompt = [
    'Extract structured resume data from the CV below.',
    'For each experience and project, assign a short lowercase snake_case id and 3-5 concise',
    'achievement bullets (each pairing a tool/tech with an outcome where the CV supports it).',
    'Do not invent facts not present in the CV.',
    'skills is an object mapping a category label to a comma-separated tech list,',
    'e.g. {"Languages": "Python, Go", "AI": "LLMs, RAG"}.',
    '',
    '<cv>',
    cvText,
    '</cv>',
  ].join('\n')

  return createAdapter(runner).runStructured(ExtractedProfileSchema, prompt, {
    shapeHint:
      '{ experience: [{id, title, company, location, dates, bullets:[...]}], ' +
      'projects: [{id, name, short_stack, dates, url, bullets:[...]}], ' +
      'skills: {"Category": "a, b, c"} }',
    signal,
  })
}

/**
 * Merge extracted data into profile.json under the `genai` variant. Replaces
 * experience/projects/skills; preserves contact and any other variants.
 */
export function applyExtractedProfile(root: string | undefined, extracted: ExtractedProfile): void {
  const profile = ((readProfile(root) as Record<string, unknown>) ?? {})

  profile.experience = extracted.experience.map(e => ({
    id: e.id, title: e.title, company: e.company, location: e.location, dates: e.dates,
    bullets: { genai: e.bullets },
  }))
  profile.projects = extracted.projects.map(p => ({
    id: p.id, name: p.name, short_stack: p.short_stack, dates: p.dates, url: p.url,
    bullets: p.bullets,
  }))
  profile.skills = { ...((profile.skills as Record<string, unknown>) ?? {}), genai: extracted.skills }

  fs.writeFileSync(profilePath(root), JSON.stringify(profile, null, 2) + '\n')
}
