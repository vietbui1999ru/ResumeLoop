import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getRunner } from './factory'
import { decideForJob, SpineDecisionSchema } from './spine'

// Cross-provider proof (AC: spine round-trip on >=1 non-claude brain).
// Opt in with RESUMELOOP_E2E_PROVIDER=ollama|gemini|codex|opencode (default ollama).
const provider = process.env.RESUMELOOP_E2E_PROVIDER
const runE2E = Boolean(provider)

describe.runIf(runE2E)(`cross-provider spine (${provider})`, () => {
  it('decideForJob returns a valid SpineDecision through a non-claude provider', async () => {
    const master = fs.readFileSync(path.join(process.cwd(), 'pipeline', 'master_resume_data.json'), 'utf8')
    const runner = getRunner(provider as string)
    const jd = 'GenAI Engineer at a seed-stage startup. Build LLM-powered developer ' +
      'tooling in Python and TypeScript. Agent orchestration a plus.'
    const decision = await decideForJob(jd, master, runner)
    expect(SpineDecisionSchema.safeParse(decision).success).toBe(true)
    expect(decision.workIds.length).toBeGreaterThanOrEqual(1)
    console.info(`[cross-provider:${provider}] fit=${decision.fitPct}% track="${decision.track}" workIds=${decision.workIds.join(',')}`)
  }, 240_000)
})
