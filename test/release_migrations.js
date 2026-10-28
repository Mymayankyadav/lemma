'use strict';
// RELEASE-01: fail-closed exact-version source/production migration parity.
// No DB credentials or writes are used by this validator. The release workflow
// collects the Supabase CLI migration-list output separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function sourceVersions(dir) {
  return fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()
    .map(name => {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) throw Error('Invalid migration filename: ' + name);
      return name.slice(0, 14);
    });
}
function listedVersions(output) {
  const text = output.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = text.split(/\r?\n/).filter(line =>
    /^\s*(?:\d{14})?\s*[│|]\s*(?:\d{14})?\s*[│|]/.test(line));
  if (!lines.length) throw Error('Could not parse Supabase CLI migration list; refusing release');
  return lines.map(line => {
    const fields = line.split(/[│|]/).map(field => field.trim());
    return { local: fields[0], remote: fields[1] };
  });
}
function validate(output, localVersions) {
  if (localVersions.length < 12) throw Error('Fewer than twelve required source migrations');
  if (new Set(localVersions).size !== localVersions.length)
    throw Error('Duplicate source migration version');
  const rows = listedVersions(output);
  if (rows.length !== localVersions.length)
    throw Error('Migration count mismatch: source ' + localVersions.length + ', CLI ' + rows.length);
  for (let i = 0; i < localVersions.length; i++) {
    const expected = localVersions[i];
    if (rows[i].local !== expected || rows[i].remote !== expected)
      throw Error('Missing, renamed or unexpected production version at row ' + (i + 1) +
        ': expected ' + expected + ', got ' + JSON.stringify(rows[i]));
  }
  return localVersions.length;
}
const versions = sourceVersions(path.join(__dirname, '..', 'supabase', 'migrations'));
if (process.argv[2] === '--check') {
  if (process.argv.length !== 4) throw Error('Usage: release_migrations.js --check /path/to/migration-list.txt');
  const count = validate(fs.readFileSync(process.argv[3], 'utf8'), versions);
  console.log('Release production migration parity passed: ' + count + ' exact applied versions');
} else if (process.argv.length === 2) {
  const rows = versions.map(v => '  ' + v + ' | ' + v + ' | applied').join('\n');
  assert.equal(validate(rows, versions), versions.length);
  assert.throws(() => validate(rows.replace(versions.at(-1) + ' | ' + versions.at(-1),
    versions.at(-1) + ' | '), versions), /Missing, renamed/);
  assert.throws(() => validate(rows + '\n  20990101000000 | 20990101000000 | other', versions), /count mismatch/i);
  assert.throws(() => validate('invalid output', versions), /parse/i);
  console.log('ok: release exact-version migration parity, missing/extra/invalid fail closed');
} else {
  throw Error('Unknown arguments');
}
