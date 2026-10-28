'use strict';
// Runs every test/<prefix>*.js for the given prefixes, sequentially, so lanes can add
// tests without editing the shared "test" script. Usage: node test/run_prefix.js study_ tutor_
// A prefix with no files is fine (the lane has not added tests yet).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const prefixes = process.argv.slice(2);
if (!prefixes.length) { console.error('usage: node test/run_prefix.js <prefix>...'); process.exit(2); }
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && prefixes.some(p => f.startsWith(p))).sort();
for (const f of files) {
  console.log('--- ' + f);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', cwd: path.resolve(dir, '..') });
  if (r.status !== 0) { console.error('FAILED: test/' + f); process.exit(r.status || 1); }
}
console.log('ok: ' + files.length + ' lane test file(s) for ' + prefixes.join(', '));
