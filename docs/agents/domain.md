# Domain Docs

**Layout:** Single-context

| File | Purpose |
|---|---|
| `CONTEXT.md` | Shared vocabulary, architectural invariants, constraints — read before any non-trivial task |
| `docs/adr/` | Architecture Decision Records — numbered, append-only |
| `CLAUDE.md` | Agent instructions: build commands, per-JD workflow, hard limits, candidate data |
| `docs/features.md` | Feature-level documentation for the web app |
| `docs/database.md` | DB schema reference with all tables and migration guards |
| `docs/reference/api-reference.md` | API endpoint reference |

## Rules for agents

- Read `CONTEXT.md` before any non-trivial task in this repo
- Check `docs/adr/` before proposing changes to: generation pipeline, DB schema, auth layer, or AI provider abstraction
- ADRs are append-only — write a new superseding record, never edit a past one
- `CONTEXT.md` is the canonical source of truth for shared terminology

## When to write an ADR

Write a new ADR when making a decision that:
- Changes the DB schema in a breaking or irreversible way
- Adds or removes an AI provider from the abstraction layer
- Changes how user data is isolated (user_id scoping rules)
- Introduces a new external service dependency
- Changes the resume generation contract (bullet format, script interface)

## ADR template

Filename: `docs/adr/NNN-short-title.md`

```
# NNN — Title

**Status:** Accepted | Superseded by ADR-NNN
**Date:** YYYY-MM-DD

## Context
Why this decision was needed.

## Decision
What was decided and why.

## Consequences
Trade-offs, future constraints, what this enables.
```
