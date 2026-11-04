// Dependency-free lint for the fast gate (the repo has no ESLint and AGENTS.md forbids new dependencies).
// Fails on: merge-conflict markers, focused/skipped tests, `debugger`, invalid JSON config,
// and rotten globs/paths in ci/*.json. Run: node scripts/ci/lint.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { matches, readJson, addsSkipOnly } from './lib.mjs';

const problems = [];
const bad = (file, line, msg) => problems.push(`${file}${line ? ':' + line : ''}  ${msg}`);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', 'test-results', 'playwright-report', '.git'].includes(e.name)) walk(p, out); }
    else out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

const code = ['src', 'tests', 'scripts', 'supabase', 'ci', '.github'].flatMap((d) => walk(d)).filter((f) => /\.(?:[cm]?[jt]sx?|json|ya?ml|sql|css)$/.test(f));
for (const f of code) {
  const lines = readFileSync(f, 'utf8').split('\n');
  const isTest = (/^tests\//.test(f) || /\.(test|spec)\./.test(f)) && !f.startsWith('tests/unit/ci/'); // ci tests quote skip patterns as data
  lines.forEach((l, i) => {
    if (/^(<<<<<<<|>>>>>>>)( |$)|^=======$/.test(l)) bad(f, i + 1, 'merge-conflict marker');
    if (/\.[cm]?[jt]sx?$/.test(f) && /^\s*debugger\b/.test(l)) bad(f, i + 1, 'debugger statement');
    if (isTest && /\.[cm]?[jt]sx?$/.test(f) && addsSkipOnly([l]).length) bad(f, i + 1, `skipped/focused test: ${l.trim().slice(0, 60)}`);
  });
  if (f.endsWith('.json')) { try { JSON.parse(lines.join('\n')); } catch (e) { bad(f, 0, `invalid JSON: ${e.message}`); } }
}
try { JSON.parse(readFileSync('package.json', 'utf8')); } catch (e) { bad('package.json', 0, `invalid JSON: ${e.message}`); }

// ci/*.json must not rot: every glob matches something, every listed path exists.
if (existsSync('ci/test-map.json')) {
  const files = ['src', 'tests', 'scripts', 'supabase', 'ci', '.github', 'docs', 'public', 'legacy'].flatMap((d) => walk(d)).concat(readdirSync('.').filter((n) => !['node_modules', '.git'].includes(n)));
  const map = readJson('ci/test-map.json');
  const hit = (g) => files.some((f) => matches(f, g));
  for (const g of [...map.all, ...map.ignore, ...map.groups.flatMap((x) => [...x.src, ...x.unit])]) if (!hit(g)) bad('ci/test-map.json', 0, `glob matches no file: ${g}`);
  for (const p of [...map.smoke, ...map.groups.flatMap((x) => x.e2e)]) if (!existsSync(p)) bad('ci/test-map.json', 0, `missing spec: ${p}`);
}
if (existsSync('ci/perf-checks.json')) {
  const perf = readJson('ci/perf-checks.json');
  for (const e of [...perf.e2e, ...perf.unit, ...perf.sql]) if (!existsSync(e.path)) bad('ci/perf-checks.json', 0, `missing file: ${e.path}`);
}

if (problems.length) { console.error(`lint: ${problems.length} problem(s)\n` + problems.slice(0, 50).join('\n')); process.exit(1); }
console.log(`lint: ${code.length} files OK`);
