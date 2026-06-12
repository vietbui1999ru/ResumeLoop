import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { z } from 'zod'

/** A CLI brain: shell out in headless mode. */
const SpawnSpecSchema = z.object({
  id:        z.string(),
  label:     z.string(),
  transport: z.literal('spawn'),
  bin:       z.string(),
  args:      z.array(z.string()).default([]),
  /** How the prompt reaches the CLI: piped to stdin, or appended as the final arg. */
  promptVia: z.enum(['stdin', 'arg']).default('stdin'),
  /** stdout post-processing: 'claude' unwraps its JSON envelope; 'raw' passes through. */
  envelope:  z.enum(['claude', 'raw']).default('raw'),
  /** Whether the CLI has a native structured-output mode (informational). */
  nativeJson: z.boolean().default(false),
})

/** An HTTP brain: POST to an OpenAI-compatible /chat/completions endpoint (e.g. ollama). */
const HttpSpecSchema = z.object({
  id:        z.string(),
  label:     z.string(),
  transport: z.literal('http'),
  baseUrl:   z.string(),
  model:     z.string(),
})

export const ProviderSpecSchema = z.discriminatedUnion('transport', [SpawnSpecSchema, HttpSpecSchema])
export type ProviderSpec = z.infer<typeof ProviderSpecSchema>
export type SpawnSpec = z.infer<typeof SpawnSpecSchema>
export type HttpSpec = z.infer<typeof HttpSpecSchema>

const RegistryFileSchema = z.object({ providers: z.array(ProviderSpecSchema).min(1) })

/** Parse + validate a providers.yml document into typed specs. */
export function parseRegistry(yamlText: string): ProviderSpec[] {
  // JSON_SCHEMA restricts parsing to plain JSON types — no custom/executable tags.
  // providers.yml is user-editable, so never use the default full schema here.
  const doc = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA })
  return RegistryFileSchema.parse(doc).providers
}

export function registryPath(): string {
  return path.join(process.cwd(), 'config', 'providers.yml')
}

let cached: ProviderSpec[] | null = null
/** Load the shipped registry (cached). */
export function getRegistry(): ProviderSpec[] {
  if (!cached) cached = parseRegistry(fs.readFileSync(registryPath(), 'utf8'))
  return cached
}

export function getSpec(id: string): ProviderSpec | undefined {
  return getRegistry().find(p => p.id === id)
}
