const {spawnSync} = require('child_process');
const path = require('path');

const VALIDATOR = path.join(__dirname, 'validate.js');
const VALID     = path.join(__dirname, 'fixtures', 'valid.js');
const INVALID   = path.join(__dirname, 'fixtures', 'invalid.js');

function run(fixture) {
  const result = spawnSync('node', [VALIDATOR, fixture], {encoding: 'utf8'});
  return {
    code: result.status,
    output: (result.stdout || '') + (result.stderr || ''),
  };
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log('\nvalid fixture:');
const v = run(VALID);
assert(v.code === 0,                 'exits 0');
assert(v.output.includes('✓ VALID'), 'prints ✓ VALID');

console.log('\ninvalid fixture:');
const inv = run(INVALID);
assert(inv.code === 1,                         'exits 1');
assert(inv.output.includes('FAIL tagline'),    'reports tagline violation');
assert(inv.output.includes('FAIL bullet'),     'reports bullet violation');
assert(inv.output.includes('FAIL para count'), 'reports para count violation');
assert(inv.output.includes('FAIL skills'),     'reports skills violation');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
