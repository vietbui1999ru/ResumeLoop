#!/usr/bin/env node
/**
 * validate.js <build-script-path>
 *
 * Static constraint checker. Parses via regex — no execution, no external deps.
 *
 * Exit 0: all checks pass (prints "✓ VALID") or warnings only (prints WARN lines)
 * Exit 1: hard violations found (prints FAIL lines, then any WARN lines)
 */

const fs   = require('fs');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node validate.js <build-script-path>');
  process.exit(2);
}

const src = fs.readFileSync(path.resolve(scriptPath), 'utf8');

const violations = [];  // FAIL — hard failures, block output
const warnings   = [];  // WARN — advisory, resume still generated

function decodeUnicode(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── 1. TAGLINE ────────────────────────────────────────────────────────────────
const tlMatch = src.match(/TL\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/);
if (!tlMatch) {
  violations.push('FAIL tagline: not found — missing TL() call');
} else {
  const tagline = decodeUnicode(tlMatch[2]);
  if (tagline.length > 76) {
    violations.push(`FAIL tagline: ${tagline.length}c — trim ${tagline.length - 76} (must be ≤76c)`);
  }
}

// ── 2. BULLETS ────────────────────────────────────────────────────────────────
// Split at "projects:" to count work vs project bullets separately for para calc
const projectsStart = src.search(/^\s*projects\s*:/m);
const workSection    = projectsStart === -1 ? src : src.slice(0, projectsStart);
const projectSection = projectsStart === -1 ? ''  : src.slice(projectsStart);

const workBulletRe = /\bT\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;
let workBullets = 0;
let wm;
let wIdx = 0;
while ((wm = workBulletRe.exec(workSection)) !== null) {
  const text = decodeUnicode(wm[2]);
  if (text.length > 116) {
    violations.push(`FAIL bullet [work.${wIdx}]: ${text.length}c — trim ${text.length - 116} (must be ≤116c)`);
  }
  workBullets++;
  wIdx++;
}

const projBulletRe = /\bT\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;
let projBullets = 0;
let pm;
let pIdx = 0;
while ((pm = projBulletRe.exec(projectSection)) !== null) {
  const text = decodeUnicode(pm[2]);
  if (text.length > 116) {
    violations.push(`FAIL bullet [proj.${pIdx}]: ${text.length}c — trim ${text.length - 116} (must be ≤116c)`);
  }
  projBullets++;
  pIdx++;
}

// ── 3. SKILLS ROWS ────────────────────────────────────────────────────────────
// Count by label: occurrences — each skill row renders as { label: "...", vals: "..." }.
// Counting quoted strings would double-count (label + vals = 2 matches per row).
let actualSkillRows = 0;
const skillsMatch = src.match(/skills:\s*\[([\s\S]*?)\]/);
if (!skillsMatch) {
  violations.push('FAIL skills: skills array not found');
} else {
  actualSkillRows = (skillsMatch[1].match(/\blabel\s*:/g) || []).length;
  if (actualSkillRows < 1 || actualSkillRows > 8) {
    violations.push(`FAIL skills: ${actualSkillRows} rows (need 1–8)`);
  }
}

// ── 4. PARA COUNT ─────────────────────────────────────────────────────────────
// Formula from buildv2.js:
//   3 header + 3 edu + (1 + N_jobs*(1+avg_work_b)) + (1 + N_proj*(1+avg_proj_b)) + (1+S)
// Uses actualSkillRows (S) so the formula stays accurate for non-5 skill row counts.
const workIdCount = (workSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;
const projIdCount = (projectSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;

const avgWork = workIdCount > 0 ? Math.round(workBullets / workIdCount) : 0;
const avgProj = projIdCount > 0 ? Math.round(projBullets / projIdCount) : 0;

const skillRowsForFormula = actualSkillRows || 5;  // fallback if skills section missing
const paraCount = 3 + 3
  + (1 + workIdCount * (1 + avgWork))
  + (1 + projIdCount * (1 + avgProj))
  + (1 + skillRowsForFormula);

// Dynamic page-fit range. Para count is advisory — resume is still generated on violation.
//   Work entry: 3–6 bullets  (typical: 5)
//   Project entry: 2–4 bullets (typical: 3)
// Section minimum is always 1 (header exists even with 0 entries).
const FIXED = 14;
const workMin = workIdCount > 0 ? 1 + workIdCount * (1 + 3) : 1;
const workMax = workIdCount > 0 ? 1 + workIdCount * (1 + 6) : 1;
const projMin = projIdCount > 0 ? 1 + projIdCount * (1 + 2) : 1;
const projMax = projIdCount > 0 ? 1 + projIdCount * (1 + 4) : 1;
const minPara = Math.max(30, FIXED + workMin + projMin + 1 + skillRowsForFormula);
const maxPara = Math.min(60, FIXED + workMax + projMax + 1 + skillRowsForFormula);

if (paraCount < minPara || paraCount > maxPara) {
  warnings.push(
    `WARN para count: ${paraCount} (target ${minPara}–${maxPara} for ${workIdCount} jobs x ~${avgWork}b + ${projIdCount} proj x ~${avgProj}b — resume may not fit 1 page)`
  );
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
if (violations.length === 0 && warnings.length === 0) {
  console.log('✓ VALID');
  process.exit(0);
} else if (violations.length === 0) {
  warnings.forEach(w => console.log(w));
  process.exit(0);
} else {
  violations.forEach(v => console.log(v));
  warnings.forEach(w => console.log(w));
  process.exit(1);
}
