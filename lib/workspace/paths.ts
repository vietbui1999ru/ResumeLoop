import path from 'node:path'

/**
 * Workspace layout (ADR 0001 §2). Files are canonical; .cache/index.db is a
 * rebuildable index over them.
 *
 *   <root>/data/profile.json        ← master_resume_data shape
 *   <root>/data/jobs/*.md           ← JD + frontmatter
 *   <root>/data/evaluations/*.md    ← fit / score / outreach
 *   <root>/data/resumes/            ← generated outputs
 *   <root>/.cache/index.db          ← rebuildable SQLite index (gitignored)
 *
 * The root defaults to RESUMELOOP_HOME (or cwd), matching the provider config.
 */
export function workspaceRoot(): string {
  return process.env.RESUMELOOP_HOME ?? process.cwd()
}

export function dataDir(root = workspaceRoot()): string {
  return path.join(root, 'data')
}
export function jobsDir(root = workspaceRoot()): string {
  return path.join(dataDir(root), 'jobs')
}
export function evaluationsDir(root = workspaceRoot()): string {
  return path.join(dataDir(root), 'evaluations')
}
export function resumesDir(root = workspaceRoot()): string {
  return path.join(dataDir(root), 'resumes')
}
export function profilePath(root = workspaceRoot()): string {
  return path.join(dataDir(root), 'profile.json')
}
export function indexPath(root = workspaceRoot()): string {
  return path.join(root, '.cache', 'index.db')
}
