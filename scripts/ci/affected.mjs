// Affected-test selection for the fast PR gate.
//
// Grouping (read ci/test-map.json next to this):
//  * "all"    shared code (configs, lockfiles, src/ui, src/lib, src/data, src/app, src/styles, src/pdf,
//             src/flags.ts, test helpers/fixtures, ci/test-map.json, .github/**, scripts/ci/**): run ALL tests.
//  * "ignore" files with no test impact (markdown, docs, calibration table, legacy/): run nothing for them.
//  * "groups" one per feature/backend area: src globs -> unit test globs + e2e spec files (+ sql flag).
//             e2e specs are mapped by the routes they visit (generated once from the current specs;
//             over-inclusion is intentional, under-inclusion is caught by the full suite on main).
//  * unit tests additionally follow the import graph: a unit test runs when anything it imports
//             (transitively, including vi.mock targets and repo paths it reads) changed.
//  * Any file that matches nothing above is "unsure" -> run ALL tests.
// The perf-timing specs (ci/perf-checks.json) never run in the gate; the smoke specs (map.smoke) always
// run in their own job, so both are subtracted from the affected e2e list.
import { readFileSync, readdirSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { matches, matchesAny, readJson } from './lib.mjs';

const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
const GRAPH_DIRS = ['src', 'scripts', 'supabase/functions', 'tests/unit', 'tests/helpers', 'tests/mcp'];
const CODE = /\.(?:[cm]?[jt]sx?)$/;

function walk(root, dir, out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(root, rel, out); }
    else out.push(rel);
  }
  return out;
}

function resolveSpec(root, fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(fromFile), spec)).replace(/\\/g, '/');
  const stripped = base.replace(/\.js$/, '');
  for (const cand of [base, stripped]) for (const ext of EXTS) {
    const p = cand + ext;
    if (existsSync(join(root, p)) && !isDir(root, p)) return p;
  }
  return null;
}
function isDir(root, p) { try { return readdirSync(join(root, p)) && true; } catch { return false; } }

const IMPORT_RES = [
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /vi\.(?:mock|doMock|importActual|importMock)\(\s*['"]([^'"]+)['"]/g,
  /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
];
const REPO_PATH = /['"`]((?:src|scripts|supabase|tests|ci|docs)\/[\w./@-]+)['"`]/g;

/** Forward dependency edges for every code file under GRAPH_DIRS. */
export function buildGraph(root = '.') {
  const nodes = GRAPH_DIRS.flatMap((d) => walk(root, d)).filter((f) => CODE.test(f) || /\.json$/.test(f));
  const edges = new Map();
  for (const f of nodes) {
    if (!CODE.test(f)) continue;
    const text = readFileSync(join(root, f), 'utf8');
    const deps = new Set();
    for (const re of IMPORT_RES) for (const m of text.matchAll(re)) { const r = resolveSpec(root, f, m[1]); if (r) deps.add(r); }
    for (const m of text.matchAll(REPO_PATH)) if (existsSync(join(root, m[1]))) deps.add(m[1]);
    edges.set(f, deps);
  }
  return { nodes, edges };
}

/** Every node reachable from `start` (inclusive). */
export function reach(graph, start) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const d of graph.edges.get(stack.pop()) || []) if (!seen.has(d)) { seen.add(d); stack.push(d); }
  return seen;
}

export function computeAffected({ changed, root = '.', map, perf, graph }) {
  const perfPaths = new Set([...(perf.e2e || []), ...(perf.unit || [])].map((e) => e.path));
  const reasons = [];
  let all = false;
  let sql = false;
  const unitGlobs = new Set();
  const unitFiles = new Set();
  const e2eFiles = new Set();
  const g = graph || buildGraph(root);
  const unitTests = g.nodes.filter((f) => f.startsWith('tests/unit/') && /\.test\.[jt]sx?$/.test(f));
  const reachCache = new Map();
  const reachOf = (t) => reachCache.get(t) || (reachCache.set(t, reach(g, t)), reachCache.get(t));

  for (const f of changed) {
    if (matchesAny(f, map.ignore)) continue;
    if (matchesAny(f, map.all)) { all = true; reasons.push(`${f}: shared code -> all tests`); continue; }
    let known = false;
    for (const grp of map.groups) {
      if (!matchesAny(f, grp.src)) continue;
      known = true;
      (grp.unit || []).forEach((u) => unitGlobs.add(u));
      (grp.e2e || []).forEach((e) => e2eFiles.add(e));
      if (grp.sql) sql = true;
    }
    for (const t of unitTests) if (reachOf(t).has(f) && t !== f) { known = true; unitFiles.add(t); }
    if (/^tests\/unit\/.+\.test\.[jt]sx?$/.test(f)) { known = true; if (existsSync(join(root, f))) unitFiles.add(f); }
    if (/^tests\/e2e\/[^/]+\.spec\.ts$/.test(f)) { known = true; if (existsSync(join(root, f))) e2eFiles.add(f); }
    if (/^tests\/mcp\//.test(f) || /^supabase\//.test(f)) { known = true; sql = true; }
    if (!known) { all = true; reasons.push(`${f}: not covered by any rule -> all tests (unsure)`); }
  }
  const allE2e = walk(root, 'tests/e2e').filter((f) => /^tests\/e2e\/[^/]+\.spec\.ts$/.test(f)).sort();
  const skip = new Set([...(map.smoke || []), ...perfPaths]);
  let unit;
  let e2e;
  if (all) {
    unit = unitTests.filter((t) => !perfPaths.has(t)).sort();
    e2e = allE2e.filter((f) => !skip.has(f));
    sql = true;
  } else {
    for (const t of unitTests) if (matchesAny(t, [...unitGlobs])) unitFiles.add(t);
    unit = [...unitFiles].filter((t) => !perfPaths.has(t)).sort();
    e2e = [...e2eFiles].filter((f) => !skip.has(f) && existsSync(join(root, f))).sort();
  }
  return { all, sql, unit, e2e, reasons, changedCount: changed.length };
}

function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-status', '-M', `${base}...${head}`], { encoding: 'utf8' });
  const files = new Set();
  for (const line of out.split('\n').filter(Boolean)) { const [, ...p] = line.split('\t'); p.forEach((x) => files.add(x)); }
  return [...files];
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<__EOF__\n${value}\n__EOF__\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const changed = arg('files') ? arg('files').split(',').filter(Boolean) : changedFiles(arg('base', 'origin/main'), arg('head', 'HEAD'));
  const res = computeAffected({ changed, map: readJson('ci/test-map.json'), perf: readJson('ci/perf-checks.json') });
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(res, null, 1));
  setOutput('all', String(res.all));
  setOutput('sql', String(res.sql));
  setOutput('unit', res.unit.join(' '));
  setOutput('e2e', res.e2e.join(' '));
  setOutput('unit_count', String(res.unit.length));
  setOutput('e2e_count', String(res.e2e.length));
  const md = [`### affected tests`, `- changed files: ${res.changedCount}`, `- run everything: **${res.all}**${res.reasons.length ? '\n' + res.reasons.slice(0, 8).map((r) => `  - ${r}`).join('\n') : ''}`,
    `- unit tests: ${res.all ? 'all' : res.unit.length}`, `- e2e specs (besides smoke): ${res.e2e.length}`, `- SQL tests: ${res.sql}`].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); else console.log(md);
}

export { relative, matches };
