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
cd harness/batch-build && [ ! -d node_modules ] && npm install && echo "✓ npm install done" || echo "✓ node_modules already present"
```

Confirm before proceeding:
- `master_resume_data.json` and `buildv2.js` present in `harness/batch-build/`
- `node_modules/` present in `harness/batch-build/` (if npm install failed, stop and report error)
- `OUTPUT_PATH` is set: run `echo ${OUTPUT_PATH}` — if empty, stop and tell user: "Set OUTPUT_PATH before running /generate. Example: export OUTPUT_PATH=~/Desktop/Resumes"

---

## Step 1: SCAN

```bash
grep -rl "un-resume" ./jobs/ 2>/dev/null
```

Print the queue:
```bash
grep -rl "resume-ed" ./jobs/ 2>/dev/null | wc -l
```

Print: "Already processed (resume-ed): K files — will be skipped"
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

Map role to "Work Track Variants" and "Role-Track Project Picks" tables in CLAUDE.md. Select and print:
```
Track: systems
Work:  gitlab (systems), carboncopies (systems), udayton (systems)
Projects: zmk, jetson, homelab
```

### 2d. BULLETS

Open `pipeline/master_resume_data.json`. Pull EXACT bullet strings for selected work IDs and projects.

Print all bullets you will use. Verify count: 3 jobs × 5 bullets + 3 projects × 3 bullets = 24 total.

IMPORTANT: Copy verbatim. No paraphrasing, no rewrites, no synonym substitution.

NOTE: Bullets in master_resume_data.json are pre-validated to ≤116c. If validate.js flags a bullet violation, the source JSON may have been manually edited — re-read it and re-copy the correct version.

### 2e. PERSONA TITLE

Derive from candidate positioning and role track. NEVER use the JD job title verbatim.

Formula: `{Track-Title} {building/specializing in} {differentiator}`

By track:
- genai:    "Full-Stack SWE building LLM pipelines with Python and Go"
- systems:  "Software Engineer specializing in distributed systems and Go"
- IT-track: "Systems Engineer — Linux infrastructure and automation"

For any other track not listed above: derive the title from the role's primary skill area.
Formula: "{Primary Skill Area} Engineer {building/specializing in} {key differentiator from role}"

Confirm: printed title does NOT match JD role title verbatim.

### 2f. TAGLINE

Generate tagline using persona title as base. Must be ≤76 chars with spaces.

Write the build script to `harness/batch-build/{company}_{role}.js` with the tagline, then run early validation:
```bash
node harness/validate.js harness/batch-build/{company}_{role}.js
```

If `FAIL tagline` appears: rewrite tagline only, update the script, re-run. Loop until tagline line is absent from output.

### 2g. BUILD SCRIPT

Finalize `harness/batch-build/{company}_{role}.js` with all content:

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
cd harness/batch-build && node {company}_{role}.js && cd ../..
```

If the build exits non-zero (missing ID in master_resume_data.json, require error, etc.): print the error, stop this JD, do NOT proceed to 2h.

### 2h. VALIDATE (full pass)

```bash
node harness/validate.js harness/batch-build/{company}_{role}.js
```

If exit 1:
1. Read each `FAIL` line
2. Fix ONLY flagged items in the build script
3. Re-run: `cd harness/batch-build && node {company}_{role}.js && cd ../..`
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
