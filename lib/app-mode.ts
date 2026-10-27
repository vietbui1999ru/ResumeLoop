import { isDemoPublic } from './demo-mode'

export function isCloud(): boolean {
  return process.env.APP_MODE === 'cloud'
}

/**
 * Whether real per-user NextAuth must be enforced, as opposed to the local
 * single-user auth bypass. Deliberately decoupled from isCloud(): that flag
 * ALSO selects the DB/storage backend (Neon+S3 vs SQLite+local files, see
 * lib/db-adapter.ts::getAdapter()), which e2e CI must not flip — there's no
 * Postgres in CI, only the SQLite DB seeded by e2e/global-setup.ts — even
 * though e2e does need to exercise real credential auth + user_id scoping.
 * RESUMELOOP_REQUIRE_AUTH is that narrower, CI-only signal.
 */
export function isAuthRequired(): boolean {
  return isCloud() || isDemoPublic() || process.env.RESUMELOOP_REQUIRE_AUTH === '1'
}
