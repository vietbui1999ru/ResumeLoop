# Council AI Review Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new GitHub Actions workflows — `council-ai.yml` (parallel GPT-4o + Llama review, Claude synthesis, PR comment) and `council-apply.yml` (HITL `/apply-fixes` handler) — that augment the existing review pipeline without touching it.

**Architecture:** `council-ai.yml` runs two parallel reviewer jobs then a `synthesize` job (needs both). `council-apply.yml` is a separate workflow triggered on `issue_comment`. No `workflow_run` dependency between them. Both use only `GITHUB_TOKEN` (auto) and the existing `CLAUDE_CODE_OAUTH_TOKEN`.

**Tech Stack:** GitHub Actions, GitHub Models API (`models.inference.ai.azure.com`), `anthropics/claude-code-action@v1`, `gh` CLI, `jq`, `curl`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.github/workflows/council-ai.yml` | **Create** | Parallel reviewer jobs + Claude synthesis → posts PR comment |
| `.github/workflows/council-apply.yml` | **Create** | Parses checked boxes from council comment → applies fixes → commits |

Existing workflows (`claude-code-review.yml`, `council-review.yml`, `ci.yml`, `claude.yml`, `deploy.yml`) are **not touched**.

---

## Task 1: Create `council-ai.yml` — trigger + reviewer jobs

**Files:**
- Create: `.github/workflows/council-ai.yml`

- [ ] **Step 1: Write the file with trigger and reviewer jobs**

Create `.github/workflows/council-ai.yml`:

```yaml
name: Council AI Review

on:
  pull_request:
    types: [ready_for_review]
  workflow_dispatch:
    inputs:
      pr_number:
        description: PR number to review
        required: true

jobs:
  review-gpt4o:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - name: Compute diff
        run: |
          git fetch origin main --depth=1
          git diff origin/main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' > diff.txt
          if [ ! -s diff.txt ]; then
            echo '{"issues":[]}' > reviewer1.json
            echo "SKIP=true" >> "$GITHUB_ENV"
          fi

      - name: Call GPT-4o via GitHub Models
        if: env.SKIP != 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cat > /tmp/system_prompt.txt << 'PROMPT'
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
          PROMPT

          jq -n \
            --rawfile system /tmp/system_prompt.txt \
            --rawfile user diff.txt \
            '{
              model: "gpt-4o",
              response_format: {type: "json_object"},
              messages: [
                {role: "system", content: $system},
                {role: "user",   content: $user}
              ]
            }' > /tmp/request.json

          curl -sf https://models.inference.ai.azure.com/chat/completions \
            -H "Authorization: Bearer $GITHUB_TOKEN" \
            -H "Content-Type: application/json" \
            -d @/tmp/request.json \
            | jq -r '.choices[0].message.content' > reviewer1.json

          # Validate output is parseable JSON with an "issues" key
          jq -e '.issues' reviewer1.json > /dev/null

      - name: Upload GPT-4o review
        uses: actions/upload-artifact@v4
        with:
          name: reviewer1
          path: reviewer1.json

  review-llama:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - name: Compute diff
        run: |
          git fetch origin main --depth=1
          git diff origin/main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' > diff.txt
          if [ ! -s diff.txt ]; then
            echo '{"issues":[]}' > reviewer2.json
            echo "SKIP=true" >> "$GITHUB_ENV"
          fi

      - name: Call Llama-3.3-70B via GitHub Models
        if: env.SKIP != 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cat > /tmp/system_prompt.txt << 'PROMPT'
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
          PROMPT

          jq -n \
            --rawfile system /tmp/system_prompt.txt \
            --rawfile user diff.txt \
            '{
              model: "Meta-Llama-3.3-70B-Instruct",
              response_format: {type: "json_object"},
              messages: [
                {role: "system", content: $system},
                {role: "user",   content: $user}
              ]
            }' > /tmp/request.json

          curl -sf https://models.inference.ai.azure.com/chat/completions \
            -H "Authorization: Bearer $GITHUB_TOKEN" \
            -H "Content-Type: application/json" \
            -d @/tmp/request.json \
            | jq -r '.choices[0].message.content' > reviewer2.json

          # Validate output is parseable JSON with an "issues" key
          jq -e '.issues' reviewer2.json > /dev/null

      - name: Upload Llama review
        uses: actions/upload-artifact@v4
        with:
          name: reviewer2
          path: reviewer2.json
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/council-ai.yml')); print('OK')"
```

Expected output: `OK`

If it errors, check indentation — YAML is indent-sensitive. Common mistake: mixing tabs and spaces.

- [ ] **Step 3: Commit reviewer jobs**

```bash
git add .github/workflows/council-ai.yml
git commit -m "feat(ci): add council-ai reviewer jobs (GPT-4o + Llama)"
```

---

## Task 2: Add `synthesize` job to `council-ai.yml`

**Files:**
- Modify: `.github/workflows/council-ai.yml` (append `synthesize:` block under `jobs:`)

- [ ] **Step 1: Append the synthesize job**

Add the following block at the end of the `jobs:` section in `.github/workflows/council-ai.yml`:

```yaml
  synthesize:
    needs: [review-gpt4o, review-llama]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - name: Compute diff (for Claude to read)
        run: |
          git fetch origin main --depth=1
          git diff origin/main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' > diff.txt

      - name: Download reviewer artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: reviewer*
          merge-multiple: true

      - name: Synthesize and post PR comment
        env:
          PR_NUMBER: ${{ github.event.pull_request.number || inputs.pr_number }}
          REPO: ${{ github.repository }}
          RUN_ID: ${{ github.run_id }}
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            You are the council synthesizer. Two AI reviewers analyzed the PR diff and produced JSON.

            Files in the working directory:
            - reviewer1.json  — GPT-4o findings
            - reviewer2.json  — Meta-Llama-3.3-70B-Instruct findings
            - diff.txt        — the raw PR diff

            Execute these steps IN ORDER:

            1. Read all three files:
               cat reviewer1.json
               cat reviewer2.json
               wc -l diff.txt

            2. Merge issues by (file, line, category). Apply disagreement logic:
               - Both flag same (file, line, category) → include. Use higher severity if they differ; note in detail block.
               - One flags, one silent → read diff.txt independently, decide include/skip, write your reasoning in the detail block with marker ⚠️ *disputed*
               - Both agree on severity → include as-is.

            3. For each included issue, run grep to find direct importers and call sites:
               grep -rn "from.*$(basename <file> .tsx | sed 's/\..*//')" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -5
               (replace <file> with the actual file path from the issue)

            4. Generate a review UUID:
               REVIEW_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)

            5. Write the PR comment to /tmp/council-comment.md using this exact template:
               - Start with the header block
               - Group issues by category (Security / Correctness / Performance / Type Safety / Dead Code)
               - Omit any section with zero issues
               - Use severity icons: 🔴 HIGH, 🟡 MED, ⚪ LOW
               - Disputed issues: add ⚠️ *disputed* after severity icon
               - Last line MUST be the council-review-id marker

               Template:
               ```
               ## 🔍 Council AI Review
               > GPT-4o · Llama-3.3-70B · synthesized by Claude

               ---

               ### Security
               - [ ] 🔴 **HIGH** — `<file>:<line>` — <title>
                 <details><summary>Detail</summary>

                 <detail text>

                 **Fix:** <fix>

                 **Check these files too:**
                 - `<importer path>:<line>` — <relationship>
                 </details>

               [repeat for each issue in this category]

               ### Correctness
               [same structure]

               [... other categories ...]

               ---
               *Check the boxes for fixes you want applied, then post `/apply-fixes`.*
               <!-- council-review-id: $RUN_ID-$REVIEW_UUID -->
               ```

            6. Post the comment:
               gh pr comment $PR_NUMBER --repo $REPO --body-file /tmp/council-comment.md

            If reviewer1.json and reviewer2.json both contain empty issues arrays, post:
               gh pr comment $PR_NUMBER --repo $REPO --body "## 🔍 Council AI Review\n\nNo issues found in this diff by either reviewer. ✅"
            and stop.
```

- [ ] **Step 2: Validate complete file**

```bash
python3 -c "
import yaml
data = yaml.safe_load(open('.github/workflows/council-ai.yml'))
jobs = data['jobs']
assert 'review-gpt4o' in jobs, 'missing review-gpt4o'
assert 'review-llama' in jobs, 'missing review-llama'
assert 'synthesize' in jobs, 'missing synthesize'
assert jobs['synthesize']['needs'] == ['review-gpt4o', 'review-llama'], 'wrong needs'
print('All jobs present. needs chain correct.')
"
```

Expected: `All jobs present. needs chain correct.`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/council-ai.yml
git commit -m "feat(ci): add synthesize job — Claude merges reviewer findings, posts PR comment"
```

---

## Task 3: Create `council-apply.yml`

**Files:**
- Create: `.github/workflows/council-apply.yml`

- [ ] **Step 1: Write the file**

Create `.github/workflows/council-apply.yml`:

```yaml
name: Council Apply — HITL fix applicator

# Fires when anyone comments on an issue or PR.
# Guard condition ensures only trusted collaborators on PRs trigger apply.
on:
  issue_comment:
    types: [created]

jobs:
  apply:
    if: |
      contains(github.event.comment.body, '/apply-fixes') &&
      github.event.issue.pull_request != null &&
      contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'),
               github.event.issue.author_association)

    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write

    steps:
      - name: Get PR head ref and SHA
        id: pr
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          REPO: ${{ github.repository }}
        run: |
          PR_DATA=$(gh api "repos/$REPO/pulls/$ISSUE_NUMBER")
          echo "head_ref=$(echo "$PR_DATA" | jq -r '.head.ref')" >> "$GITHUB_OUTPUT"
          echo "head_sha=$(echo "$PR_DATA" | jq -r '.head.sha')" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ steps.pr.outputs.head_sha }}

      - name: Apply checked fixes
        env:
          PR_NUMBER: ${{ github.event.issue.number }}
          PR_HEAD_REF: ${{ steps.pr.outputs.head_ref }}
          COMMENTER: ${{ github.event.comment.user.login }}
          REPO: ${{ github.repository }}
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            You are the council fix applicator. A trusted collaborator posted /apply-fixes on PR $PR_NUMBER.

            Execute these steps IN ORDER:

            1. Find the council review comment (most recent one with the marker):
               gh api "repos/$REPO/issues/$PR_NUMBER/comments" \
                 --jq '[.[] | select(.body | contains("council-review-id"))] | last | .body' \
                 > /tmp/council-comment.txt
               cat /tmp/council-comment.txt

            2. If /tmp/council-comment.txt is empty or contains "null":
               gh issue comment $PR_NUMBER --repo $REPO \
                 --body "No council review comment found on this PR. Run the Council AI Review workflow first (mark PR as ready for review, or use workflow_dispatch)."
               Stop here.

            3. Parse checked vs unchecked boxes from /tmp/council-comment.txt:
               grep -n '^\- \[x\]' /tmp/council-comment.txt  # checked
               grep -n '^\- \[ \]' /tmp/council-comment.txt  # unchecked

            4. If zero lines matched '- [x]':
               gh issue comment $PR_NUMBER --repo $REPO \
                 --body "No fixes selected — check at least one box before posting \`/apply-fixes\`."
               Stop here.

            5. For each checked item (lines matching `- [x]`):
               a. Extract the file path and line number from the item title (format: \`file:line\`)
               b. Read the <details> block immediately following the item to get the fix instruction
               c. Apply the fix directly to the source file

            6. After attempting all fixes, check if any files changed:
               git diff --name-only HEAD

            7. If files changed:
               CHECKED_COUNT=$(grep -c '^\- \[x\]' /tmp/council-comment.txt)
               REVIEW_ID=$(grep -o 'council-review-id: [^-]*' /tmp/council-comment.txt | tail -1)
               git add -- $(git diff --name-only HEAD)
               git commit -m "fix: apply council-reviewed fixes ($CHECKED_COUNT items)

               Applied by council-apply workflow on behalf of $COMMENTER
               $REVIEW_ID"
               git push origin "$PR_HEAD_REF"
               COMMIT_SHA=$(git rev-parse HEAD)
               gh issue comment $PR_NUMBER --repo $REPO \
                 --body "Applied $CHECKED_COUNT fixes in $COMMIT_SHA. Unchecked items were skipped."

            8. If a specific fix fails (file not found, patch rejected, etc.):
               Note the failure in your reply but continue with remaining fixes.
               At the end, report which fixes succeeded and which failed with reasons.

            Never create an empty commit. If no files changed after all fix attempts, reply:
               gh issue comment $PR_NUMBER --repo $REPO \
                 --body "No files were changed — fixes may have already been applied or the instructions were unclear."
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "
import yaml
data = yaml.safe_load(open('.github/workflows/council-apply.yml'))
jobs = data['jobs']
assert 'apply' in jobs, 'missing apply job'
assert data['on']['issue_comment']['types'] == ['created'], 'wrong trigger'
print('council-apply.yml valid.')
"
```

Expected: `council-apply.yml valid.`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/council-apply.yml
git commit -m "feat(ci): add council-apply — HITL /apply-fixes handler with trusted commenter gate"
```

---

## Task 4: Repo permission check

GitHub Actions needs write access to push commits and post comments. Verify the repo setting is enabled.

- [ ] **Step 1: Check repo Actions write permission**

```bash
gh api "repos/$REPO/actions/permissions" --jq '.default_workflow_permissions'
```

Replace `$REPO` with the actual repo (e.g. `vietbui99/ResumeAnalyze`).

Expected: `"write"` or `"read"`.

If `"read"`, the `contents: write` permission in `council-apply.yml` won't be enough to push commits. Fix:

```bash
gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=write \
  -f can_approve_pull_request_reviews=false
```

- [ ] **Step 2: Verify CLAUDE_CODE_OAUTH_TOKEN secret exists**

```bash
gh secret list --repo $REPO | grep CLAUDE_CODE_OAUTH_TOKEN
```

Expected: a line showing `CLAUDE_CODE_OAUTH_TOKEN` with a recent update date.

If missing, the existing `claude-code-review.yml` would also be broken — the secret should already be there. If not, consult the `claude-code-action` docs for how to generate the token.

---

## Task 5: Smoke test via workflow_dispatch

- [ ] **Step 1: Push the branch**

```bash
git push origin feat/frontend-redesign
```

- [ ] **Step 2: Trigger council-ai manually**

Replace `<PR_NUMBER>` with an open PR in the repo:

```bash
gh workflow run council-ai.yml \
  --repo $REPO \
  --field pr_number=<PR_NUMBER>
```

- [ ] **Step 3: Watch the run**

```bash
gh run list --workflow=council-ai.yml --repo $REPO --limit 1
# Get the run ID from the output, then:
gh run watch <RUN_ID> --repo $REPO
```

Expected: `review-gpt4o` and `review-llama` complete in parallel, then `synthesize` runs. Final status: `completed / success`.

- [ ] **Step 4: Verify PR comment was posted**

```bash
gh pr view <PR_NUMBER> --repo $REPO --comments | grep "Council AI Review"
```

Expected: output containing `## 🔍 Council AI Review`.

- [ ] **Step 5: Test /apply-fixes guard — unauthorized user**

Post `/apply-fixes` as a user without OWNER/MEMBER/COLLABORATOR association (e.g. from a fork). The `council-apply.yml` job should NOT run (the `if:` guard blocks it).

Verify via:
```bash
gh run list --workflow=council-apply.yml --repo $REPO --limit 5
```

No new run should appear from an unauthorized commenter.

- [ ] **Step 6: Test /apply-fixes — authorized, no boxes checked**

Check NO boxes in the council comment, then post `/apply-fixes` as a collaborator.

Expected reply from Claude: `No fixes selected — check at least one box before posting /apply-fixes.`

---

## Known Risks

| Risk | Mitigation |
|---|---|
| Llama-3.3-70B on GitHub Models may not support `response_format: {type: "json_object"}` | Add `jq -e '.issues' reviewer2.json` validation step — if it fails, the job fails fast rather than silently passing bad JSON to synthesize |
| `workflow_dispatch` ref is `github.sha` (default branch HEAD), not PR head | For re-runs, the diff will be computed against the default branch HEAD commit, not the PR branch. Acceptable for manual re-runs. |
| Claude's fix instructions in the apply step may be ambiguous | Claude is instructed to report per-fix failures rather than aborting — partial apply is better than no apply |
| Empty diff (no TS/JS files changed) | Both reviewer jobs detect empty diff and skip the API call, uploading `{"issues":[]}` instead |
