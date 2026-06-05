# Database Migrations

## Overview

ResumeLoop uses a numbered migration system backed by the `schema_migrations` table.

- **SQLite (local/self-hosted)**: migrations run automatically on startup via `runMigrations()` in `lib/db.ts`.
- **Neon (cloud)**: migrations run via `NeonAdapter.initialize()` in `lib/db-adapter.ts`, which applies Postgres-compatible DDL.

Migration versions are tracked in `schema_migrations(version INTEGER PRIMARY KEY)`.

## Migration numbering

| Version | Location | Description |
|---------|----------|-------------|
| 001 | `lib/db.ts initSchema()` | Baseline schema — all `CREATE TABLE IF NOT EXISTS` statements |
| 002 | `lib/db.ts runMigrations()` | Rename `demo_cleartext_pwd` to `demo_encrypted_pwd` |
| 003 | `lib/db.ts applyMigration003()` | Historical column/table additions (extracted from old initSchema) |
| 004+ | `lib/migrations/NNN_*.sql` | Future migrations as SQL files |

## Adding a new migration

1. Create `lib/migrations/NNN_description.sql` where `NNN` is the next integer (zero-padded to 3 digits).
2. Write idempotent SQL — use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.
3. `runMigrations()` will pick it up automatically on the next startup.

Example filename: `lib/migrations/004_add_job_priority.sql`

## Running migrations as a one-shot ECS task (production)

Migrations run automatically when the app starts. For production deployments where you want to run migrations before traffic hits the new container, use an ECS one-shot task:

```bash
aws ecs run-task \
  --cluster resumeloop \
  --task-definition resumeloop-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxxxx],securityGroups=[sg-xxxxxxxx],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","-e","require(\"./lib/db\").runMigrations(require(\"better-sqlite3\")(process.env.DB_PATH))"]}]}'
```

For Neon (cloud mode), `NeonAdapter.initialize()` handles the migration automatically on cold start. No manual ECS task is needed.

## SQLite compatibility note

SQLite versions before 3.37.0 do not support `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Migrations 001-003 use `hasColumn()` / `hasTable()` guards in TypeScript instead. SQL files for migrations 004+ may use `IF NOT EXISTS` syntax if the production SQLite version is known to be >= 3.37.0.
