import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const VALIDATE = fileURLToPath(new URL('./validate.js', import.meta.url));
const VALID_FIXTURE = fileURLToPath(new URL('./fixtures/valid.js', import.meta.url));

const tmpFiles = [];

function run(src) {
  const tmp = join(tmpdir(), `rl-validate-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  writeFileSync(tmp, src);
  tmpFiles.push(tmp);
  const r = spawnSync('node', [VALIDATE, tmp], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try { unlinkSync(f); } catch {}
  }
});

// Minimal valid source. All checks pass; para count is within range.
// 3 jobs × 5 bullets + 3 projects × 3 bullets + 5 skill rows = 44 paras (target 43–58).
function validSrc({
  tagline = "TL('Full-Stack SWE building AI tools with Go, Python, and TypeScript')",
  workSection = `id: 'job1'\nT('Built API service using FastAPI, achieving 99% uptime across 90-day window')\nT('Designed multi-tenant schema with PostgreSQL, onboarding 12 enterprise clients')\nT('Automated CI/CD with GitHub Actions and Docker, cutting deploy time from 45 to 8 min')\nT('Shipped React dashboard with live WebSocket updates, lifting engagement by 28%')\nT('Wrote integration tests with pytest + Testcontainers covering 87% of API surface')\nid: 'job2'\nT('Published RL adversarial robustness paper at IEEE KSE 2024 as second author')\nT('Built PyTorch DQN agent for maze environments, achieving 94% success rate')\nT('Implemented data-preprocessing pipeline in Python + NumPy, cutting noise 31%')\nT('Mentored 40+ students in Data Structures, improving pass rate by 18% over two terms')\nT('Contributed 8 merged PRs to open-source ML framework adding gradient checkpointing')\nid: 'job3'\nT('Migrated Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 cron jobs')\nT('Containerised 3 services with Docker Compose for reproducible local dev across 8-person team')\nT('Built internal Python SDK wrapping OpenAI API with retry logic, adopted by 3 product teams')\nT('Wrote Terraform modules for AWS ECS + RDS, cutting infra setup time from 2 days to 30 min')\nT('Developed Go microservice for event processing, handling 10k events/sec at <5ms p99 latency')`,
  projSection = `id: 'proj1'\nT('Built REST API with FastAPI, JWT auth, and RBAC for 3 permission tiers')\nT('Deployed on AWS ECS with Terraform IaC, achieving 99.9% uptime over 90-day window')\nT('Implemented React admin dashboard with Recharts analytics for self-serve PM usage')\nid: 'proj2'\nT('Engineered RAG pipeline with LangChain + pgvector, reducing hallucination rate 62%')\nT('Built streaming Next.js frontend with real-time token rendering, cutting latency 1.8s')\nT('Added tool-use layer allowing agent to query live APIs for up-to-date answers')\nid: 'proj3'\nT('Provisioned 3-node Proxmox cluster with Terraform + Ansible, hosting 12 services')\nT('Built Grafana alerting stack with 18 dashboards, catching 2 disk failures pre-data-loss')\nT('Configured WireGuard VPN + VLAN segmentation, isolating IoT from primary network')`,
  skills = `skills: [\n  { label: 'Languages', vals: 'Python · Go · TypeScript · Rust · Bash' },\n  { label: 'Backend',   vals: 'FastAPI · PostgreSQL · Redis · Docker · gRPC' },\n  { label: 'Systems',   vals: 'Linux · goroutines · channels · IEEE 802.3' },\n  { label: 'DevOps',    vals: 'GitHub Actions · GitLab CI · Terraform · Prometheus' },\n  { label: 'Tools',     vals: 'Git · Proxmox · Neovim · Claude Code' },\n]`,
} = {}) {
  return `${tagline}\n\n${workSection}\n\nprojects:\n${projSection}\n\n${skills}\n`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

describe('CLI', () => {
  it('exits 2 with usage message when no file argument given', () => {
    const r = spawnSync('node', [VALIDATE], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage:');
  });
});

// ── VALID ─────────────────────────────────────────────────────────────────────

describe('valid fixture', () => {
  it('exits 0 and prints ✓ VALID', () => {
    const r = spawnSync('node', [VALIDATE, VALID_FIXTURE], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('✓ VALID');
  });
});

// ── TAGLINE ───────────────────────────────────────────────────────────────────

describe('tagline', () => {
  it('FAIL when TL() call is missing', () => {
    const src = validSrc({ tagline: "// no tagline here" });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL tagline: not found');
  });

  it('FAIL with exact char count and trim amount when tagline is 77c (1 over)', () => {
    // 77 chars: 76-char base + one extra 'x'
    const tl = 'A' + 'x'.repeat(75); // 76 chars exactly — this should pass
    const tl77 = 'A' + 'x'.repeat(76); // 77 chars — 1 over
    expect(tl.length).toBe(76);
    expect(tl77.length).toBe(77);

    const { code: code76, out: out76 } = run(validSrc({ tagline: `TL('${tl}')` }));
    expect(code76).toBe(0); // at limit — no violation

    const { code, out } = run(validSrc({ tagline: `TL('${tl77}')` }));
    expect(code).toBe(1);
    expect(out).toContain('FAIL tagline: 77c — trim 1');
  });

  it('decodes \\uXXXX escapes before measuring length', () => {
    // A decodes to 'A' (1 char), not 6 chars — a 76-char string via escapes should pass
    const escaped = '\\u0041'.repeat(76); // 76 decoded chars, 456 raw chars
    const { code, out } = run(validSrc({ tagline: `TL('${escaped}')` }));
    expect(code).toBe(0);
    expect(out).not.toContain('FAIL tagline');
  });
});

// ── BULLETS ───────────────────────────────────────────────────────────────────

describe('bullets', () => {
  it('FAIL with [work.0] index when first work bullet is 117c', () => {
    // 117 chars — 1 over the 116-char limit
    const long = 'B' + 'x'.repeat(116); // 117 chars
    expect(long.length).toBe(117);
    const src = validSrc({
      workSection: `id: 'job1'\nT('${long}')`,
    });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL bullet [work.0]: 117c — trim 1');
  });

  it('FAIL with [work.1] index when second work bullet is over limit', () => {
    const long = 'B' + 'x'.repeat(116); // 117 chars
    const src = validSrc({
      workSection: `id: 'job1'\nT('short bullet ok')\nT('${long}')`,
    });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL bullet [work.1]:');
  });

  it('FAIL with [proj.0] index when project bullet is over limit', () => {
    const long = 'B' + 'x'.repeat(116); // 117 chars
    const src = validSrc({
      projSection: `id: 'proj1'\nT('${long}')`,
    });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL bullet [proj.0]: 117c — trim 1');
  });

  it('work and proj bullets are counted in separate namespaces', () => {
    const long = 'B' + 'x'.repeat(116);
    const src = validSrc({
      workSection: `id: 'job1'\nT('fine bullet')\nT('${long}')`,
      projSection: `id: 'proj1'\nT('${long}')`,
    });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL bullet [work.1]:');
    expect(out).toContain('FAIL bullet [proj.0]:');
  });
});

// ── SKILLS ────────────────────────────────────────────────────────────────────

describe('skills', () => {
  it('FAIL when skills block is absent entirely', () => {
    const src = validSrc({ skills: '// no skills here' });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL skills: skills array not found');
  });

  it('FAIL when skills array has 0 label: entries', () => {
    const src = validSrc({ skills: 'skills: []' });
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL skills: 0 rows (need 1–8)');
  });

  it('passes with 1 skill row (minimum)', () => {
    const src = validSrc({ skills: "skills: [{ label: 'Languages', vals: 'Python' }]" });
    const { code, out } = run(src);
    // May WARN on para count with this minimal config but should not FAIL on skills
    expect(out).not.toContain('FAIL skills');
  });
});

// ── PARA COUNT ────────────────────────────────────────────────────────────────

describe('para count', () => {
  it('WARN (exit 0) when bullet count is too sparse for 1-page fit', () => {
    // 3 jobs × 1 bullet + 3 projects × 1 bullet = para count well below minimum
    const sparse = validSrc({
      workSection: `id: 'job1'\nT('Built something useful')\nid: 'job2'\nT('Built something useful')\nid: 'job3'\nT('Built something useful')`,
      projSection: `id: 'proj1'\nT('Built project')\nid: 'proj2'\nT('Built project')\nid: 'proj3'\nT('Built project')`,
    });
    const { code, out } = run(sparse);
    expect(code).toBe(0); // warning — not a hard failure
    expect(out).toContain('WARN para count');
  });
});

// ── MULTIPLE VIOLATIONS ───────────────────────────────────────────────────────

describe('multiple violations', () => {
  it('reports all FAILs and exits 1', () => {
    // Tagline over + bullet over + empty skills = 3 FAILs
    const long = 'B' + 'x'.repeat(116);
    const tl77  = 'A' + 'x'.repeat(76);
    const src = `TL('${tl77}')\n\nid: 'job1'\nT('${long}')\n\nprojects:\nid: 'proj1'\nT('fine')\n\nskills: []\n`;
    const { code, out } = run(src);
    expect(code).toBe(1);
    expect(out).toContain('FAIL tagline:');
    expect(out).toContain('FAIL bullet [work.0]:');
    expect(out).toContain('FAIL skills:');
  });

  it('existing invalid fixture produces the expected violations', () => {
    const invalidFixture = fileURLToPath(new URL('./fixtures/invalid.js', import.meta.url));
    const r = spawnSync('node', [VALIDATE, invalidFixture], { encoding: 'utf8' });
    // fixture has: tagline 83c, bullet 117c, skills 0 rows — all hard failures
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FAIL tagline: 83c — trim 7');
    expect(r.stdout).toContain('FAIL bullet [work.0]: 117c — trim 1');
    expect(r.stdout).toContain('FAIL skills: 0 rows (need 1–8)');
  });
});
