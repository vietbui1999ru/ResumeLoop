# Generation Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Claude Code CLI generation harness: a `/generate` skill with checkpoint gates and a deterministic validator script that checks all hard constraints before DOCX output.

**Architecture:** Two deliverables — `harness/validate.js` (static regex parser, no deps, exit-code contract) and `.claude/skills/generate-resume/generate-resume.md` (skill with full 10-step workflow). The validator does static analysis on the generated build script, extracting content via regex without executing it. Claude reads stdout violations, fixes only the flagged items, regenerates, re-validates.

**Tech Stack:** Node.js (built-in only), Claude Code skills system

---

## File Map

| File | Responsibility |
|---|---|
| `harness/validate.js` | Static constraint checker: parse build script → check tagline ≤76c, bullets ≤116c, para count = 44, skills rows = 5 |
| `harness/validate.test.js` | Node test runner (no framework): fixture-based tests for each check |
| `harness/fixtures/valid.js` | Fixture: build script that passes all checks |
| `harness/fixtures/invalid.js` | Fixture: build script with known violations |
| `.claude/skills/generate-resume/generate-resume.md` | Skill: full workflow with checkpoint gates and validator integration |
| `agents/AGENT.md` | Pointer to skill (replaces 10-line comment) |

---

## Task 1: Validator fixtures

**Files:**
- Create: `harness/fixtures/valid.js`
- Create: `harness/fixtures/invalid.js`

- [ ] **Step 1: Create fixtures directory**

```bash
mkdir -p /Users/vietquocbui/repos/ResumeAnalyze/harness/fixtures
```

- [ ] **Step 2: Create valid fixture**

Create `harness/fixtures/valid.js` — a minimal build script that passes all checks:

```js
const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Role_VietBui',

  tagline: TL('Full-Stack SWE building distributed systems with Go and Python'),

  work: [
    {
      id: 'gitlab',
      bullets: [
        T('Contributed to GitLab CE in Ruby; shipped bug fixes reviewed and merged by senior platform engineers'),
        T('Automated infrastructure provisioning with Ansible and Terraform for reproducible deployment workflows'),
        T('Configured GitLab CI/CD pipelines with lint, test, and deploy stages for automated quality gating'),
        T('Collaborated with senior engineers through code review cycles, iterating on Ruby implementations'),
        T('Built Git automation scripts for batch repository operations and CI/CD integration on open-source projects'),
      ],
    },
    {
      id: 'carboncopies',
      bullets: [
        T('Implemented async Python services for distributed simulation pipelines handling concurrent state transitions'),
        T('Deployed Docker and GitHub Actions CI/CD, cutting simulation release cycles from 2 hours to 30 minutes'),
        T('Developed monitoring tooling tracking 50+ system health metrics across distributed simulation clusters'),
        T('Diagnosed and resolved failures in distributed systems by tracing logs, isolating root causes, shipping fixes'),
        T('Wrote runbooks for 3 distributed simulation systems; reduced onboarding time and improved cross-team handoffs'),
      ],
    },
    {
      id: 'udayton',
      bullets: [
        T('Engineered Coq framework for Program Graph safety proofs; detected integer overflow and injection attacks'),
        T('Co-authored IEEE KSE 2024 paper on adversarial RL robustness; entropy-based detection at 97%+ accuracy'),
        T('Scripted Python and TypeScript tooling for data processing, automation, and multi-system state management'),
        T('Designed and executed test suites for research systems; analyzed failure modes and iterated on fixes'),
        T('Authored technical documentation for 3 systems; presented research to cross-functional teams of 100+'),
      ],
    },
  ],

  projects: [
    {
      id: 'zmk',
      bullets: [
        T('Shipped ZMK firmware on nRF52840 in C/Devicetree; implemented BLE HID keymaps with combos and layers'),
        T('Integrated GitHub Actions CI/CD pipeline for automated ZMK firmware builds across keyboard configurations'),
        T('Validated BLE HID descriptor compliance and keymap correctness across 40+ layout combinations'),
      ],
    },
    {
      id: 'jetson',
      bullets: [
        T('Built real-time object detection pipeline on NVIDIA Jetson using Python and CUDA-accelerated inference'),
        T('Optimized MIPI CSI-2 camera pipeline reducing frame capture latency by 40% through buffer tuning'),
        T('Deployed FastAPI inference server on Jetson with REST endpoints for real-time classification results'),
      ],
    },
    {
      id: 'homelab',
      bullets: [
        T('Provisioned Proxmox homelab with 6 LXC containers; automated config with Ansible playbooks and roles'),
        T('Deployed Prometheus and Grafana monitoring stack tracking CPU, memory, and disk across all containers'),
        T('Configured Nginx reverse proxy with TLS termination and DNS-based routing for 5 self-hosted services'),
      ],
    },
  ],

  skills: [
    'Languages: Python · Go · TypeScript · Ruby · Bash · SQL · Rust',
    'Backend: FastAPI · PostgreSQL · Redis · REST · gRPC · Docker · Kubernetes',
    'Systems: Linux · goroutines · channels · multithreaded design · IEEE 802.3',
    'DevOps: GitHub Actions · GitLab CI/CD · Terraform · Ansible · Prometheus · Grafana',
    'Tools: Git · Proxmox · Neovim · tmux · Obsidian · Claude Code',
  ],
});
```

- [ ] **Step 3: Create invalid fixture**

Create `harness/fixtures/invalid.js` — build script with exactly 4 known violations:

```js
const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Invalid_VietBui',

  // VIOLATION 1: tagline 80c (over 76)
  tagline: TL('Full-Stack Software Engineer building distributed systems with Go, Python, and Rust'),

  work: [
    {
      id: 'gitlab',
      bullets: [
        // VIOLATION 2: bullet 120c (over 116)
        T('Contributed to GitLab CE in Ruby; shipped bug fixes reviewed and merged by senior platform engineers on the core team'),
        T('Automated infrastructure provisioning with Ansible and Terraform for reproducible deployment workflows'),
        T('Configured GitLab CI/CD pipelines with lint, test, and deploy stages for automated quality gating'),
        T('Collaborated with senior engineers through code review cycles, iterating on Ruby implementations'),
        T('Built Git automation scripts for batch repository operations and CI/CD integration on open-source projects'),
      ],
    },
    {
      id: 'carboncopies',
      bullets: [
        T('Implemented async Python services for distributed simulation pipelines handling concurrent state transitions'),
        T('Deployed Docker and GitHub Actions CI/CD, cutting simulation release cycles from 2 hours to 30 minutes'),
        T('Developed monitoring tooling tracking 50+ system health metrics across distributed simulation clusters'),
        T('Diagnosed and resolved failures in distributed systems by tracing logs and isolating root causes'),
        T('Wrote runbooks for 3 distributed simulation systems; reduced onboarding time and improved handoffs'),
      ],
    },
    {
      id: 'udayton',
      bullets: [
        T('Engineered Coq framework for Program Graph safety proofs; detected integer overflow and injection attacks'),
        T('Co-authored IEEE KSE 2024 paper on adversarial RL robustness; entropy-based detection at 97%+ accuracy'),
        T('Scripted Python and TypeScript tooling for data processing, automation, and multi-system state management'),
        // VIOLATION 3: only 4 bullets for udayton (para count becomes 43)
      ],
    },
  ],

  projects: [
    {
      id: 'zmk',
      bullets: [
        T('Shipped ZMK firmware on nRF52840 in C/Devicetree; implemented BLE HID keymaps with combos and layers'),
        T('Integrated GitHub Actions CI/CD pipeline for automated ZMK firmware builds across keyboard configurations'),
        T('Validated BLE HID descriptor compliance and keymap correctness across 40+ layout combinations'),
      ],
    },
    {
      id: 'jetson',
      bullets: [
        T('Built real-time object detection pipeline on NVIDIA Jetson using Python and CUDA-accelerated inference'),
        T('Optimized MIPI CSI-2 camera pipeline reducing frame capture latency by 40% through buffer tuning'),
        T('Deployed FastAPI inference server on Jetson with REST endpoints for real-time classification results'),
      ],
    },
    {
      id: 'homelab',
      bullets: [
        T('Provisioned Proxmox homelab with 6 LXC containers; automated config with Ansible playbooks and roles'),
        T('Deployed Prometheus and Grafana monitoring stack tracking CPU, memory, and disk across all containers'),
        T('Configured Nginx reverse proxy with TLS termination and DNS-based routing for 5 self-hosted services'),
      ],
    },
  ],

  // VIOLATION 4: only 4 skills rows (need 5)
  skills: [
    'Languages: Python · Go · TypeScript · Ruby · Bash · SQL',
    'Backend: FastAPI · PostgreSQL · Redis · REST · gRPC · Docker',
    'Systems: Linux · goroutines · channels · multithreaded design',
    'DevOps: GitHub Actions · GitLab CI/CD · Terraform · Ansible',
  ],
});
```

- [ ] **Step 4: Commit fixtures**

```bash
git -C /Users/vietquocbui/repos/ResumeAnalyze add harness/fixtures/
git -C /Users/vietquocbui/repos/ResumeAnalyze commit -m "test: add validate.js fixtures (valid + invalid)"
```

---

## Task 2: Validator — failing tests

**Files:**
- Create: `harness/validate.test.js`

- [ ] **Step 1: Create test file**

Create `harness/validate.test.js`:

```js
const {spawnSync} = require('child_process');
const path = require('path');

const VALIDATOR = path.join(__dirname, 'validate.js');
const VALID     = path.join(__dirname, 'fixtures', 'valid.js');
const INVALID   = path.join(__dirname, 'fixtures', 'invalid.js');

function run(fixture) {
  const result = spawnSync('node', [VALIDATOR, fixture], {encoding: 'utf8'});
  return {
    code: result.status,
    output: (result.stdout || '') + (result.stderr || ''),
  };
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log('\nvalid fixture:');
const v = run(VALID);
assert(v.code === 0,                 'exits 0');
assert(v.output.includes('✓ VALID'), 'prints ✓ VALID');

console.log('\ninvalid fixture:');
const inv = run(INVALID);
assert(inv.code === 1,                        'exits 1');
assert(inv.output.includes('FAIL tagline'),   'reports tagline violation');
assert(inv.output.includes('FAIL bullet'),    'reports bullet violation');
assert(inv.output.includes('FAIL para count'),'reports para count violation');
assert(inv.output.includes('FAIL skills'),    'reports skills violation');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests — verify they fail (validate.js doesn't exist yet)**

```bash
node /Users/vietquocbui/repos/ResumeAnalyze/harness/validate.test.js
```

Expected: error `Cannot find module` — confirms test is wired correctly before implementation.

---

## Task 3: Validator — implementation

**Files:**
- Create: `harness/validate.js`

- [ ] **Step 1: Create validator**

Create `harness/validate.js`:

```js
#!/usr/bin/env node
/**
 * validate.js <build-script-path>
 *
 * Static constraint checker. Parses via regex — no execution, no external deps.
 *
 * Exit 0: all checks pass, prints "✓ VALID"
 * Exit 1: violations found, prints each on its own line
 */

const fs   = require('fs');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node validate.js <build-script-path>');
  process.exit(2);
}

const src = fs.readFileSync(path.resolve(scriptPath), 'utf8');

const violations = [];

function decodeUnicode(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── 1. TAGLINE ────────────────────────────────────────────────────────────────
const tlMatch = src.match(/TL\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/);
if (!tlMatch) {
  violations.push('FAIL tagline: not found — missing TL() call');
} else {
  const tagline = decodeUnicode(tlMatch[2]);
  if (tagline.length > 76) {
    violations.push(`FAIL tagline: ${tagline.length}c — trim ${tagline.length - 76} (must be ≤76c)`);
  }
}

// ── 2. BULLETS ────────────────────────────────────────────────────────────────
// Split at "projects:" to count work vs project bullets separately for para calc
const projectsStart = src.indexOf('projects:');
const workSection    = projectsStart === -1 ? src : src.slice(0, projectsStart);
const projectSection = projectsStart === -1 ? ''  : src.slice(projectsStart);

const bulletRe = /\bT\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;

let workBullets = 0;
let wm;
let wIdx = 0;
while ((wm = bulletRe.exec(workSection)) !== null) {
  const text = decodeUnicode(wm[2]);
  if (text.length > 116) {
    violations.push(`FAIL bullet [work.${wIdx}]: ${text.length}c — trim ${text.length - 116} (must be ≤116c)`);
  }
  workBullets++;
  wIdx++;
}

let projBullets = 0;
const projBulletRe = /\bT\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;
let pm;
let pIdx = 0;
while ((pm = projBulletRe.exec(projectSection)) !== null) {
  const text = decodeUnicode(pm[2]);
  if (text.length > 116) {
    violations.push(`FAIL bullet [proj.${pIdx}]: ${text.length}c — trim ${text.length - 116} (must be ≤116c)`);
  }
  projBullets++;
  pIdx++;
}

// ── 3. PARA COUNT ─────────────────────────────────────────────────────────────
// Formula from buildv2.js:
//   3 header + 3 edu + (1 + N_jobs*(1+avg_work_b)) + (1 + N_proj*(1+avg_proj_b)) + (1+5)
// Standard target: 3-job x 5b + 3-proj x 3b = 44

const workIdCount = (workSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;
const projIdCount = (projectSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;

const avgWork = workIdCount > 0 ? Math.round(workBullets / workIdCount) : 0;
const avgProj = projIdCount > 0 ? Math.round(projBullets / projIdCount) : 0;

const paraCount = 3 + 3
  + (1 + workIdCount * (1 + avgWork))
  + (1 + projIdCount * (1 + avgProj))
  + (1 + 5);

if (paraCount !== 44) {
  violations.push(
    `FAIL para count: ${paraCount} (target 44) — ${workIdCount} jobs x ~${avgWork}b + ${projIdCount} proj x ~${avgProj}b`
  );
}

// ── 4. SKILLS ROWS ────────────────────────────────────────────────────────────
const skillsMatch = src.match(/skills:\s*\[([\s\S]*?)\]/);
if (!skillsMatch) {
  violations.push('FAIL skills: skills array not found');
} else {
  const skillItems = skillsMatch[1].match(/['"][^'"]+['"]/g) || [];
  if (skillItems.length !== 5) {
    violations.push(`FAIL skills: ${skillItems.length} rows (need exactly 5)`);
  }
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log('✓ VALID');
  process.exit(0);
} else {
  violations.forEach(v => console.log(v));
  process.exit(1);
}
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
node /Users/vietquocbui/repos/ResumeAnalyze/harness/validate.test.js
```

Expected:
```
valid fixture:
  ✓ exits 0
  ✓ prints ✓ VALID

invalid fixture:
  ✓ exits 1
  ✓ reports tagline violation
  ✓ reports bullet violation
  ✓ reports para count violation
  ✓ reports skills violation

6 passed, 0 failed
```

- [ ] **Step 3: Smoke test against a real known-good build script**

```bash
node /Users/vietquocbui/repos/ResumeAnalyze/harness/validate.js \
  /Users/vietquocbui/repos/ResumeAnalyze/JobData/Jobs/adtran-embedded-swe.js
```

Expected: `✓ VALID`

- [ ] **Step 4: Commit**

```bash
git -C /Users/vietquocbui/repos/ResumeAnalyze add harness/validate.js harness/validate.test.js
git -C /Users/vietquocbui/repos/ResumeAnalyze commit -m "feat: add harness/validate.js — static constraint checker with tests"
```

---

## Task 4: Skill file

**Files:**
- Create: `.claude/skills/generate-resume/generate-resume.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p /Users/vietquocbui/repos/ResumeAnalyze/.claude/skills/generate-resume
```

- [ ] **Step 2: Create skill file**

Create `.claude/skills/generate-resume/generate-resume.md`:

```markdown
---
name: generate-resume
description: Resume generation harness. Scans ./jobs/ for un-resume tagged JDs, generates a compliant DOCX for each, validates all constraints, outputs to OUTPUT_PATH.
trigger: /generate
---

# Resume Generation Harness

Full workflow with checkpoint gates. Follow every step in order. Do not skip gates.

## Pre-flight

Run once before processing any JDs:
```bash
mkdir -p harness/batch-build
cp pipeline/master_resume_data.json harness/batch-build/
cp pipeline/buildv2.js harness/batch-build/
cd harness/batch-build && [ ! -d node_modules ] && npm install
```

Confirm: `master_resume_data.json` and `buildv2.js` both present in `harness/batch-build/`.

---

## Step 1: SCAN

```bash
grep -rl "un-resume" ./jobs/ 2>/dev/null
```

Print the queue:
```
Queue (N files):
  1. jobs/company-role.md
  2. jobs/company2-role2.md
```

Wait for user confirmation. If queue is empty: "No un-resume JDs found in ./jobs/" and stop.

---

## Step 2: PER-JD LOOP

Repeat steps 2a–2l for each JD in the queue.

### 2a. PARSE

Read the JD file. Print:
- Company name
- Role title (from JD — reference only, NOT the resume persona title)
- Tech stack mentioned
- Key requirements
- Location / remote policy

### 2b. VISA GATE

Apply visa rules from CLAUDE.md:
- "US Citizen/GC only" or "no sponsorship" → tag `visa-kill`, print: "SKIP [company]: visa-kill", continue to next JD
- Export control "US person" → same
- "Authorized to work in US" → proceed (OPT/STEM OPT qualifies)
- Standard EEO → proceed

### 2c. TRACK

Map role to role-track table in CLAUDE.md. Select and print:
```
Track: systems
Work:  gitlab (systems), carboncopies (systems), udayton (systems)
Projects: zmk, jetson, homelab
```

### 2d. BULLETS

Open `pipeline/master_resume_data.json`. Pull EXACT bullet strings for selected work IDs and projects.

Print all bullets you will use. Verify count: 3 jobs × 5 bullets + 3 projects × 3 bullets = 24 total.

IMPORTANT: Copy verbatim. No paraphrasing, no rewrites, no synonym substitution.

### 2e. PERSONA TITLE

Derive from candidate positioning and role track. NEVER use the JD job title verbatim.

Formula: `{Track-Title} {building/specializing in} {differentiator}`

By track:
- genai:    "Full-Stack SWE building LLM pipelines with Python and Go"
- systems:  "Software Engineer specializing in distributed systems and Go"
- IT-track: "Systems Engineer — Linux infrastructure and automation"

Confirm: printed title does NOT match JD role title verbatim.

### 2f. TAGLINE

Generate tagline using persona title as base. Must be ≤76 chars with spaces.

Run early validation:
```bash
node harness/validate.js harness/batch-build/{company}_{role}.js
```

If `FAIL tagline` appears: rewrite tagline only, re-run. Loop until tagline line is absent from output.

### 2g. BUILD SCRIPT

Generate `harness/batch-build/{company}_{role}.js`:

```js
const {build, T, TL} = require('./buildv2');

build({
  file: '{Company}_{Role}_VietBui',
  tagline: TL('{tagline ≤76c}'),
  work: [
    { id: '{id}', bullets: [ T('...'), T('...'), T('...'), T('...'), T('...') ] },
    { id: '{id}', bullets: [ T('...'), T('...'), T('...'), T('...'), T('...') ] },
    { id: '{id}', bullets: [ T('...'), T('...'), T('...'), T('...'), T('...') ] },
  ],
  projects: [
    { id: '{id}', bullets: [ T('...'), T('...'), T('...') ] },
    { id: '{id}', bullets: [ T('...'), T('...'), T('...') ] },
    { id: '{id}', bullets: [ T('...'), T('...'), T('...') ] },
  ],
  skills: [
    'Row1: tech · tech · tech · tech',
    'Row2: tech · tech · tech · tech',
    'Row3: tech · tech · tech · tech',
    'Row4: tech · tech · tech · tech',
    'Row5: tech · tech · tech · tech',
  ],
});
```

Run:
```bash
cd harness/batch-build && node {company}_{role}.js
```

### 2h. VALIDATE (full pass)

```bash
node harness/validate.js harness/batch-build/{company}_{role}.js
```

If exit 1:
1. Read each `FAIL` line
2. Fix ONLY flagged items in the build script
3. Re-run: `cd harness/batch-build && node {company}_{role}.js`
4. Re-run validator
5. Repeat until exit 0

Fix surgically — do not regenerate unflagged sections.

### 2i. OUTPUT

```bash
mv "harness/batch-build/{Company}_{Role}_VietBui.docx" \
   "${OUTPUT_PATH}/{company}_{role}_vietbui.docx"
```

Print full output path.

### 2j. TAG

Update JD frontmatter. Change `un-resume` → `resume-ed`. Run only after validator exit 0.

Before:
```yaml
tags: [un-resume, genai, remote]
```
After:
```yaml
tags: [resume-ed, genai, remote]
```

### 2k. OUTREACH (SKIPPED)

Print: "Outreach chat ready for {Company} — start a follow-up chat with the JD file."

### 2l. SUMMARY

```
✓ {Company} — {Role}
  Track: {track} | Fit: {fit%}
  Work: {id1}, {id2}, {id3}
  Projects: {p1}, {p2}, {p3}
  Output: {OUTPUT_PATH}/{filename}.docx
```

---

## Step 3: BATCH DONE

```
─────────────────────────────────────
Batch complete
  Processed:            N
  Skipped (visa-kill):  M
  Skipped (resume-ed):  K
  Output: {OUTPUT_PATH}
─────────────────────────────────────
```

---

## Outreach Follow-Up Chat

When the user initiates outreach for a company, load the JD file and the summary from step 2l, then follow this pattern:

1. ROLE-FRAME — "For {Company}, positioning as [{persona title}] — confirm or redirect?"
   Wait for confirmation before writing anything.
2. CONTACTS — "Any specific contacts, referrals, or hiring manager names?"
3. CONTEXT — "Any special angle — mutual connection, relevant project, inside knowledge?"
4. DRAFT
   - LinkedIn note: ≤300 chars, warm, references one concrete detail from JD
   - Email: subject + 3–5 sentence body, no buzzword soup
   - Cover letter: only if role requires it — 3 paragraphs (fit → proof → ask)
5. REVIEW — present all drafts; user edits before sending

Step 1 always runs before any drafting.
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/vietquocbui/repos/ResumeAnalyze add .claude/skills/generate-resume/
git -C /Users/vietquocbui/repos/ResumeAnalyze commit -m "feat: add generate-resume skill with checkpoint gates and validator integration"
```

---

## Task 5: Cleanup

**Files:**
- Modify: `agents/AGENT.md`
- Modify: `.gitignore`

- [ ] **Step 1: Replace AGENT.md with pointer**

Overwrite `agents/AGENT.md` with:

```markdown
# Resume Generation Agent

Harness lives in `.claude/skills/generate-resume/generate-resume.md`.

Invoke with `/generate` in Claude Code.
```

- [ ] **Step 2: Add harness/batch-build to .gitignore**

Add to `.gitignore`:

```
# Harness working dir
harness/batch-build/
```

- [ ] **Step 3: Verify gitignore**

```bash
mkdir -p /Users/vietquocbui/repos/ResumeAnalyze/harness/batch-build
touch /Users/vietquocbui/repos/ResumeAnalyze/harness/batch-build/test.docx
git -C /Users/vietquocbui/repos/ResumeAnalyze status harness/
```

Expected: `harness/batch-build/` not listed as untracked. `harness/fixtures/` and `harness/validate.js` ARE listed (tracked).

- [ ] **Step 4: Commit**

```bash
git -C /Users/vietquocbui/repos/ResumeAnalyze add agents/AGENT.md .gitignore
git -C /Users/vietquocbui/repos/ResumeAnalyze commit -m "chore: point AGENT.md to skill, gitignore harness/batch-build"
```

---

## Self-Review

**Spec coverage:**
- ✅ Skill with checkpoint gates → Task 4
- ✅ Validator: tagline ≤76c → Task 3 (section 1)
- ✅ Validator: bullets ≤116c → Task 3 (section 2)
- ✅ Validator: para count = 44 → Task 3 (section 3)
- ✅ Validator: skills rows = 5 → Task 3 (section 4)
- ✅ Exit-code contract → Task 3
- ✅ Persona title fix (never JD title) → Task 4 step 2e
- ✅ Batch scan + tag update → Task 4 steps 1, 2j
- ✅ Output naming `{company}_{role}_vietbui.docx` → Task 4 step 2i
- ✅ Outreach as follow-up chat → Task 4 outreach section
- ✅ agents/AGENT.md pointer → Task 5
- ✅ .gitignore harness/batch-build → Task 5

**Placeholder scan:** No TBDs or incomplete steps.

**Type consistency:** `validate.js` is a pure CLI (no exports). `validate.test.js` calls it via `spawnSync` — consistent throughout. Fixture file paths match test constants.
