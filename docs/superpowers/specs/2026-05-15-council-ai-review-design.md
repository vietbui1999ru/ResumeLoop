# Council AI Review Pipeline — Design Spec

> **For agentic workers:** Use superpowers:writing-plans to implement this spec task-by-task.

**Goal:** A two-stage GitHub Actions pipeline that dispatches two independent AI reviewers (GPT-4o + Llama-3.3-70B via GitHub Models), synthesizes their findings with Claude as the decision maker, posts a human-reviewable checklist with file relationship maps, and applies selected fixes only after human approval via `/apply-fixes`.

**Architecture:** Two new workflow files augment (not replace) the existing `claude-code-review.yml` and `council-review.yml`. `council-ai.yml` runs parallel reviewers then Claude synthesis on `ready_for_review`. `council-apply.yml` handles the HITL `/apply-fixes` command on `issue_comment`.

**Tech Stack:** GitHub Actions, GitHub Models API (Azure inference endpoint), `claude-code-action`, `gh` CLI, `jq`, `curl`

---

## Existing Workflows (unchanged)

| File | Role |
|---|---|
| `claude-code-review.yml` | Fast first-pass: Claude reviews every push to a PR |
| `council-review.yml` | Auto-fix: Claude applies fixes when any trusted human reviewer submits a review |

Both remain untouched. The new pipeline is additive.

---

## New Files

```
.github/workflows/council-ai.yml      — parallel review + Claude synthesis
.github/workflows/council-apply.yml   — /apply-fixes HITL handler
```

No new secrets required. Both workflows use `GITHUB_TOKEN` (auto-provided) for GitHub Models and the existing `CLAUDE_CODE_OAUTH_TOKEN` for Claude.

---

## Workflow 1: `council-ai.yml`

### Trigger

```yaml
on:
  pull_request:
    types: [ready_for_review]
  workflow_dispatch:
    inputs:
      pr_number:
        description: PR number to review
        required: true
```

Fires when a PR transitions from draft to ready, or on manual dispatch (for re-runs).

### Job Graph

```
review-gpt4o  ─┐
               ├→ synthesize
review-llama  ─┘
```

`review-gpt4o` and `review-llama` run in parallel. `synthesize` has `needs: [review-gpt4o, review-llama]` and downloads both JSON artifacts before invoking Claude.

### Reviewer Jobs (review-gpt4o, review-llama)

Each job:

1. Checks out the PR head
2. Computes the diff against `origin/main`, scoped to source files only:
   ```bash
   git diff origin/main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' > diff.txt
   ```
3. Calls the GitHub Models inference endpoint:
   ```bash
   curl -s https://models.inference.ai.azure.com/chat/completions \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Content-Type: application/json" \
     -d "{
       \"model\": \"gpt-4o\",
       \"response_format\": { \"type\": \"json_object\" },
       \"messages\": [
         { \"role\": \"system\", \"content\": \"$SYSTEM_PROMPT\" },
         { \"role\": \"user\",   \"content\": $(cat diff.txt | jq -Rs .) }
       ]
     }" | jq -r '.choices[0].message.content' > reviewer1.json
   ```
   Llama job uses `"model": "Meta-Llama-3.3-70B-Instruct"` and writes `reviewer2.json`.
4. Uploads the JSON file as a workflow artifact.

### Reviewer System Prompt

Identical for both reviewers — model difference produces the variance:

```
You are a code reviewer. Analyze the diff across exactly these 5 categories.
Return ONLY valid JSON matching the schema below — no prose outside the JSON.

Categories:
  security      — XSS, injection, auth bypass, path traversal, secret exposure
  correctness   — logic errors, wrong assumptions, broken edge cases, type unsafety
  performance   — unnecessary re-renders, N+1 queries, unbounded loops, memory leaks
  type_safety   — missing null checks, unsafe casts, implicit any, unhandled undefined
  dead_code     — unused imports, unreachable branches, stale variables

Output schema:
{
  "issues": [
    {
      "category": "security|correctness|performance|type_safety|dead_code",
      "severity": "HIGH|MED|LOW",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "one-line description",
      "detail": "why this is a problem",
      "fix": "concrete fix as code snippet or clear instruction"
    }
  ]
}
```

### Synthesize Job

Runs Claude via `claude-code-action` with `CLAUDE_CODE_OAUTH_TOKEN`. Receives both JSON artifacts and the diff. Claude's prompt instructs it to:

1. **Merge** issues by `(file, line, category)` key.
2. **Apply C+D disagreement logic** per merged group:
   - Both reviewers flag → include, use their shared or higher severity.
   - One flags, one silent → Claude reads the diff independently, decides include/skip, records its reasoning explicitly.
   - Both flag, different severity → use higher severity, note discrepancy.
3. **Build file relationship map** for each included issue via grep:
   ```bash
   # Direct importers of changed file
   grep -rn "from.*<basename>" --include="*.ts" --include="*.tsx" .
   # Call sites of changed function/component
   grep -rn "<symbol_name>" --include="*.ts" --include="*.tsx" .
   ```
4. **Post one PR comment** (see Comment Structure below).

### PR Comment Structure

```markdown
## 🔍 Council AI Review
> GPT-4o · Llama-3.3-70B · synthesized by Claude

---

### Security
- [ ] 🔴 **HIGH** — `components/JobDetailModal.tsx:47` — Unvalidated href allows XSS
  <details><summary>Detail</summary>

  `applyUrl` rendered directly into `href` without scheme validation. `javascript:` URLs execute on click.

  **Fix:** `const safe = url?.match(/^https?:\/\//) ? url : null`

  **Check these files too:**
  - `app/jobs/page.tsx:312` — imports JobDetailModal
  - `components/JobTable.tsx:89` — calls renderApplyButton()
  </details>

### Correctness
- [ ] 🟡 **MED** — `lib/generate-pipeline.ts:203` ⚠️ *disputed*
  <details><summary>Detail · GPT-4o flagged, Llama did not</summary>

  GPT-4o: possible off-by-one in chunk boundary calculation at EOF.
  Claude's assessment: **include** — boundary condition is untested and logic is non-obvious.

  **Fix:** `if (end > buf.length) end = buf.length`

  **Check these files too:**
  - `app/api/generate/[jobId]/stream/route.ts:88` — calls pipeline directly
  </details>

### Dead Code
- [ ] ⚪ **LOW** — `components/GenerationPanel.tsx:14` — `stageIcon` defined but never called
  <details><summary>Detail</summary>

  **Fix:** delete lines 14–22
  </details>

---
*Check the boxes for fixes you want applied, then post `/apply-fixes`.*
<!-- council-review-id: <uuid> -->
```

The hidden `<!-- council-review-id: <uuid> -->` marker is generated fresh per run. `council-apply.yml` uses it to locate Claude's comment without parsing the full comment thread.

Severity icons: 🔴 HIGH, 🟡 MED, ⚪ LOW. Disputed issues include `⚠️ *disputed*` in the title and Claude's reasoning in the details block.

---

## Workflow 2: `council-apply.yml`

### Trigger

```yaml
on:
  issue_comment:
    types: [created]
```

### Guard Condition

```yaml
if: |
  contains(github.event.comment.body, '/apply-fixes') &&
  github.event.issue.pull_request != null &&
  contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'),
           github.event.issue.author_association)
```

Prevents prompt injection: only trusted collaborators can trigger apply. External contributors cannot.

### Apply Flow

Claude runs via `claude-code-action` and executes this sequence:

1. Locate the council comment by `council-review-id` marker:
   ```bash
   gh api repos/$REPO/issues/$PR_NUMBER/comments \
     --jq '[.[] | select(.body | contains("council-review-id"))] | last | .body'
   ```
2. Parse checked boxes (`- [x]`) vs unchecked (`- [ ]`). Skip all unchecked items.
3. Apply each checked fix directly to source files.
4. If at least one fix was applied, commit:
   ```
   fix: apply council-reviewed fixes (N items)
   
   Applied by council-apply workflow on behalf of <commenter>
   council-review-id: <uuid>
   ```
5. Push the commit to the PR branch.
6. Reply to the `/apply-fixes` comment:
   - On success: `Applied N fixes in <commit-sha>. Unchecked items were skipped.`
   - On zero checked: `No fixes selected — check at least one box before posting /apply-fixes.`
   - On error: describe which fix failed and why.

No empty commits. If zero boxes are checked, no commit is made.

---

## Security Considerations

- **Prompt injection via diff content**: Both reviewer prompts use `jq -Rs .` to JSON-encode the diff, preventing injection via crafted file content.
- **Trusted commenter gate**: `council-apply.yml` guard restricts apply to `OWNER/MEMBER/COLLABORATOR` — same model as the existing `council-review.yml`.
- **No `id-token: write`**: Neither workflow uses OIDC; the permission is omitted to reduce attack surface.
- **Comment anchor by marker, not position**: Using `<!-- council-review-id -->` to find the synthesis comment prevents a malicious commenter from positioning a fake comment to manipulate what Claude reads.

---

## Relationship to Existing Workflows

| Scenario | Workflow that fires |
|---|---|
| Every push to open PR | `claude-code-review.yml` (fast pass) |
| PR marked ready for review | `council-ai.yml` (deep council) |
| Human reviewer submits a review | `council-review.yml` (auto-fix human comments) |
| Human posts `/apply-fixes` | `council-apply.yml` (HITL apply) |

The four workflows are independent — no `workflow_run` dependencies between them.
