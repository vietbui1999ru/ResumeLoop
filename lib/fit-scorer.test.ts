import { describe, it, expect } from 'vitest'
import { scoreJd } from './fit-scorer'

describe('scoreJd', () => {
  it('identifies SRE/DevOps from relevant keywords', () => {
    const jd = 'DevOps engineer: Kubernetes, Prometheus, Grafana, Terraform, Docker, CI/CD, SRE'
    const r = scoreJd(jd)
    expect(r.role_track).toBe('SRE/DevOps')
    expect(r.fit_pct).toBeGreaterThan(30)
  })

  it('identifies AI/LLM from relevant keywords', () => {
    const jd = 'AI engineer: LLM, LangChain, vector database, RAG pipelines, prompt engineering, OpenAI'
    const r = scoreJd(jd)
    expect(r.role_track).toBe('AI/LLM/Agents')
    expect(r.fit_pct).toBeGreaterThan(30)
  })

  it('returns low fit for unrecognized JD', () => {
    const r = scoreJd('We sell widgets. No tech required.')
    expect(r.fit_pct).toBeLessThan(20)
  })
})
