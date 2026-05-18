# Slop Register — ResumeLoop

Known AI failure patterns for this codebase. Read before generating any code.

---

## Module Boundaries

### `server-only` added without Vitest alias (2026-05-18)

**What AI does**: Adds `import 'server-only'` to `lib/` files (correct for Next.js build safety) without
updating `vitest.config.ts` to alias the package to an empty stub — breaking all tests that
import those modules.
**Correct**: When adding `server-only` to any `lib/` file, simultaneously add/verify the alias in
`vitest.config.ts`: `'server-only': './test-mocks/server-only.ts'`. The stub already exists at
`test-mocks/server-only.ts`.
**Detect**: `grep -r "server-only" lib/` — if any new file has it, check `vitest.config.ts` resolve.alias.
**Severity**: high (breaks CI test suite immediately)

---

## Error Handling

*(empty — add entries via /capture-slop)*

## Dependencies & APIs

*(empty)*

## Patterns Used Incorrectly

*(empty)*

## Naming & Conventions

*(empty)*
