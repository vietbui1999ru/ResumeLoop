#!/usr/bin/env zsh
# Wipes SQLite cache so the next Scan re-imports all jobs from the folder.
# Action/Status changes written via the UI are stored in the .md frontmatter
# (source of truth) — they survive this reset and will be re-read on next Scan.

DB="${DB_PATH:-resume.db}"

if [[ ! -f "$DB" ]]; then
  echo "No database found at $DB — nothing to do."
  exit 0
fi

rm "$DB"
echo "✓ Deleted $DB"
echo "  → Open the app and hit Scan to re-import from the jobs folder."
