# Stage ↔ Action Bidirectional Sync — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Problem

The job posting modal has two independent systems for tracking pipeline state:

- **Stage buttons** (`PIPELINE_TAGS`) — 6 colored radio-style buttons in the JD panel. Currently multi-select toggles that write to `job.tags` (JSON array).
- **Action dropdown** (`VALID_ACTIONS`) — 7-option dropdown in the jobs list. Writes to `job.action` (string field).

These two systems are unrelated. Clicking "Applied" in the modal does not update the Action dropdown in the list, and vice versa. Additionally, the stage buttons allow multiple active states simultaneously, which contradicts the intended "one stage at a time" UX.

## Goal

Make stage buttons and the Action dropdown a single, bidirectional, radio-select control:

- Clicking a stage button in the modal updates the Action in the job list.
- Changing the Action dropdown in the list updates which stage button is highlighted in the modal.
- Only one stage/action is active at any time.
- Single persisted field: `job.action`.

## Decision: Single Source of Truth

**`job.action` is the canonical field.** Pipeline tags in `job.tags` are no longer used for stage tracking. The `job.tags` field continues to carry custom (non-pipeline) tags unaffected.

## Mapping

Added to `lib/pipeline-tags.ts`:

```typescript
export const TAG_TO_ACTION: Record<string, string> = {
  'applied':      '1-Applied',
  'phone-screen': '2-Phone Screen',
  'interviewed':  '3-Interview',
  'offer':        '4-Offer',
  'rejected':     '5-Rejected',
  'ghosted':      '6-Ghosted',
}

export const ACTION_TO_TAG: Record<string, string> =
  Object.fromEntries(Object.entries(TAG_TO_ACTION).map(([k, v]) => [v, k]))
```

`'0-Saved'` maps to no tag key (null) — the default/deselected state.

## State Flow (Approach B — Controlled `currentAction` prop)

```
jobs/page.tsx  (owns jobs[] — single source of truth)
│
├── handleActionChange(jobId, action) → optimistic jobs[] update
│                                     + PATCH /api/jobs/:id/action
│
└── <JobDetailModal
      jobId={selectedJobId}
      currentAction={jobs.find(j => j.id === selectedJobId)?.action ?? '0-Saved'}
      onActionChange={action => handleActionChange(selectedJobId, action)}
    />
         │
         └── <JdPanel
               currentAction={currentAction}
               onActionChange={onActionChange}
             />
                  │
                  ├── Stage buttons active = (tag.key === ACTION_TO_TAG[effectiveAction])
                  ├── Stage click → onActionChange(TAG_TO_ACTION[tag.key] ?? '0-Saved')
                  └── Action Field reads effectiveAction (reactive)
```

`effectiveAction = currentAction ?? job.action ?? '0-Saved'` — falls back to the fetched job data when props are not provided (backward compatible).

## Component Changes

### `lib/pipeline-tags.ts`
- Add `TAG_TO_ACTION` and `ACTION_TO_TAG` exports.

### `components/JobDetailModal.tsx`
- Add two optional props to `Props`: `currentAction?: string`, `onActionChange?: (action: string) => void`.
- Thread both props into `JdPanel`.
- Backward compatible: props are optional; modal works standalone without them.

### `JdPanel` (inside `JobDetailModal.tsx`)
- Add `currentAction?: string` and `onActionChange?: (action: string) => void` to its props.
- Compute `effectiveAction = currentAction ?? job.action ?? '0-Saved'`.
- Stage button active state: `tag.key === ACTION_TO_TAG[effectiveAction]`.
- Stage button click behavior (radio with deselect):
  - If `tag.key === ACTION_TO_TAG[effectiveAction]` (already active) → `onActionChange('0-Saved')` (deselect back to no-stage)
  - Otherwise → `onActionChange(TAG_TO_ACTION[tag.key])`
- **Stage buttons stop calling `onTagToggle`.** They previously called `onTagToggle(tag.key)` which wrote to `job.tags`. After this change they call `onActionChange` only. The `onTagToggle` prop remains on JdPanel but is no longer invoked by stage buttons.
- Replace `<Field label="Action" value={job.action ?? '0-Saved'} />` with `value={effectiveAction}` so the field stays reactive.

### `app/(app)/jobs/page.tsx`
- Pass `currentAction` and `onActionChange` to `<JobDetailModal>`:

```tsx
<JobDetailModal
  jobId={selectedJobId!}
  currentAction={jobs.find(j => j.id === selectedJobId)?.action ?? '0-Saved'}
  onActionChange={action => void handleActionChange(selectedJobId!, action)}
  onClose={...}
  onTagsChange={...}
/>
```

## API

No changes. The existing `PATCH /api/jobs/:id/action` endpoint handles all writes.

## Behavior

| Action | Result |
|---|---|
| Click inactive stage button in modal | Stage highlights (only that one). Action dropdown in list updates. Persisted to DB. |
| Click active stage button in modal | Stage deselects. Action resets to `0-Saved`. |
| Change Action dropdown in list | Stage button in modal (if open for same job) updates in real time. |
| Open modal after changing Action in list | Correct stage button highlighted immediately. |
| `0-Saved` action | No stage button is highlighted. |

## Out of Scope

- Migrating existing `job.tags` pipeline tag data to `job.action`. Old tags remain but are ignored for stage display.
- Adding an Action dropdown inside the modal (stage buttons are the modal's selector).
- Any changes to the Action dropdown in the list view itself.
