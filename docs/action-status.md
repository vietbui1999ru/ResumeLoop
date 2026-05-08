---
title: "Action / Pipeline Status"
description: "The 7 application stages, how they are stored, how they sync between .md files and SQLite, and how they map to the Pipeline Sankey chart."
tags: [action, pipeline, status, obsidian]
updated: 2026-05-08
---

# Action / Pipeline Status

## What the Action Field Is

`Action` is a YAML frontmatter key written directly into each job posting `.md` file. It tracks where a job sits in the application pipeline. Because it lives in the file, it is visible and editable in Obsidian alongside the rest of the job data.

Example frontmatter:

```yaml
---
title: "Software Engineer | Acme Corp"
tags: [un-resume]
Action: 1-Applied
---
```

## The 7 Stages

| Value | Label | Meaning |
|-------|-------|---------|
| `0-Saved` | Saved | Job clipped, not yet acted on. Default when no `Action` key exists. |
| `1-Applied` | Applied | Resume submitted. |
| `2-Phone Screen` | Phone Screen | Initial recruiter or hiring-manager screen scheduled or completed. |
| `3-Interview` | Interview | Technical or onsite round in progress. |
| `4-Offer` | Offer | Offer received. |
| `5-Rejected` | Rejected | Company declined after any stage. |
| `6-Ghosted` | Ghosted | No response after application or screen. |

These values are defined in `lib/actions.ts` as a `const` tuple. Any value not in this list is treated as `null` during parsing.

## How to Change It

In the dashboard, open the **Jobs** table. Each row has an inline dropdown in the **Action** column. Selecting a value sends `PATCH /api/jobs/[id]/action` with the new stage.

You can also edit `Action` directly in Obsidian. Run **Scan** afterward to sync the change into SQLite.

## How It Syncs

The `PATCH /api/jobs/[id]/action` handler follows a strict write order:

1. Read the `.md` file at `job.file_path`.
2. Parse the existing frontmatter with `gray-matter`.
3. Set `fm.Action = newValue`.
4. Write the updated file back to disk (`matter.stringify`).
5. `UPDATE jd_jobs SET action = ? WHERE id = ?`.

**The `.md` file is always written first.** If step 5 fails or the server restarts, the correct value is preserved in the file and will be read back on the next Scan.

## How It Maps to the Pipeline Sankey

`lib/get-metrics.ts` computes pipeline counts from `jd_jobs.action`:

| Sankey node | Condition |
|-------------|-----------|
| `scraped` | All jobs in DB |
| `visa_kill` | `visa_status = 'kill'` |
| `pending` | `action IS NULL` or `action = '0-Saved'` |
| `resume_built` | `action` is `1-Applied` or later |
| `applied` | Same as `resume_built` (every action ≥ `1-Applied` means an application was submitted) |
| `interviewed` | `action` is `2-Phone Screen`, `3-Interview`, `4-Offer`, or `5-Rejected` |
| `offer` | `action = '4-Offer'` |
| `rejected` | `action = '5-Rejected'` |
| no_response | `applied - interviewed` (i.e. `6-Ghosted` jobs fall here) |

## What Happens on Re-Scan

The scan upsert uses:

```sql
action = COALESCE(excluded.action, jd_jobs.action)
```

If a `.md` file has no `Action` key (or an invalid value), `parseJd` returns `null` for `action`. `COALESCE` then keeps whatever value is already in the database. **No action data is lost by re-scanning.**

If the file has a valid `Action` value, it overwrites the DB value — the file is authoritative.

## Integration with Obsidian

Because `Action` is plain YAML frontmatter, Obsidian renders and edits it natively. Changes made in Obsidian take effect in the dashboard after the next Scan. Changes made in the dashboard appear immediately in the vault (the `.md` file is updated synchronously on the server).
