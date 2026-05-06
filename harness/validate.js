#!/usr/bin/env node
/**
 * validate.js <build-script-path>
 *
 * Static constraint checker. Parses via regex — no execution, no external deps.
 *
 * Exit 0: all checks pass, prints "✓ VALID"
 * Exit 1: violations found, prints each on its own line
 */

const fs   = require('fs');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node validate.js <build-script-path>');
  process.exit(2);
}

const src = fs.readFileSync(path.resolve(scriptPath), 'utf8');

const violations = [];

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
    violations.push(`FAIL tagline: ${tagline.length}c — trim ${tagline.length - 76} (must be <=76c)`);
  }
}

// ── 2. BULLETS ────────────────────────────────────────────────────────────────
// Split at "projects:" to count work vs project bullets separately for para calc
const projectsStart = src.indexOf('projects:');
const workSection    = projectsStart === -1 ? src : src.slice(0, projectsStart);
const projectSection = projectsStart === -1 ? ''  : src.slice(projectsStart);

const workBulletRe = /\bT\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;
let workBullets = 0;
let wm;
let wIdx = 0;
while ((wm = workBulletRe.exec(workSection)) !== null) {
  const text = decodeUnicode(wm[2]);
  if (text.length > 116) {
    violations.push(`FAIL bullet [work.${wIdx}]: ${text.length}c — trim ${text.length - 116} (must be <=116c)`);
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
    violations.push(`FAIL bullet [proj.${pIdx}]: ${text.length}c — trim ${text.length - 116} (must be <=116c)`);
  }
  projBullets++;
  pIdx++;
}

// ── 3. PARA COUNT ─────────────────────────────────────────────────────────────
// Formula from buildv2.js:
//   3 header + 3 edu + (1 + N_jobs*(1+avg_work_b)) + (1 + N_proj*(1+avg_proj_b)) + (1+5)
const workIdCount = (workSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;
const projIdCount = (projectSection.match(/\bid:\s*['"][^'"]+['"]/g) || []).length;

const avgWork = workIdCount > 0 ? Math.round(workBullets / workIdCount) : 0;
const avgProj = projIdCount > 0 ? Math.round(projBullets / projIdCount) : 0;

const paraCount = 3 + 3
  + (1 + workIdCount * (1 + avgWork))
  + (1 + projIdCount * (1 + avgProj))
  + (1 + 5);

if (paraCount !== 44) {
  violations.push(
    `FAIL para count: ${paraCount} (target 44) — ${workIdCount} jobs x ~${avgWork}b + ${projIdCount} proj x ~${avgProj}b`
  );
}

// ── 4. SKILLS ROWS ────────────────────────────────────────────────────────────
const skillsMatch = src.match(/skills:\s*\[([\s\S]*?)\]/);
if (!skillsMatch) {
  violations.push('FAIL skills: skills array not found');
} else {
  const skillItems = skillsMatch[1].match(/['"][^'"]+['"]/g) || [];
  if (skillItems.length !== 5) {
    violations.push(`FAIL skills: ${skillItems.length} rows (need exactly 5)`);
  }
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log('✓ VALID');
  process.exit(0);
} else {
  violations.forEach(v => console.log(v));
  process.exit(1);
}
