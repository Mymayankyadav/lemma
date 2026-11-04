// Calibration of the perf checks (calibrate.yml). Never changes a budget.
//   aggregate <junitDir> <outMd> <outJson>   per check: runs, pass rate, median, p10-p90 duration; <95% => quarantined
//   publish   <md>                           open a `ci: perf calibration` PR changing only ci/perf-calibration.md and land it
import { readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseJUnit, jobKind } from './signatures.mjs';
import { api, paginate, repoPath, ensureLabels, GhError } from './gh.mjs';
import { readJson } from './lib.mjs';
import { landPr, landingComment, botOpts } from './automerge.mjs';

export const QUARANTINE_BELOW = 0.95;
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))] : 0);

export function aggregate(cases) {
  const by = new Map();
  for (const c of cases) {
    if (c.skipped) continue;
    const key = `${jobKind(c.file)}|${c.file}|${c.name}`;
    const e = by.get(key) || { kind: jobKind(c.file), file: c.file, name: c.name, runs: 0, passes: 0, ms: [] };
    e.runs++; if (!c.failed) e.passes++; e.ms.push(c.time * 1000);
    by.set(key, e);
  }
  return [...by.values()].map((e) => {
    const ms = [...e.ms].sort((a, b) => a - b);
    const rate = e.passes / e.runs;
    return { kind: e.kind, file: e.file, name: e.name, runs: e.runs, passRate: Number(rate.toFixed(3)), medianMs: Math.round(pct(ms, 0.5)), p10Ms: Math.round(pct(ms, 0.1)), p90Ms: Math.round(pct(ms, 0.9)), quarantined: rate < QUARANTINE_BELOW };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function renderMarkdown(rows, meta) {
  const q = rows.filter((r) => r.quarantined).length;
  const lines = ['# Performance calibration', '',
    `Written only by the \`calibrate\` workflow. Run ${meta.run} on \`${meta.sha}\` (main, unchanged), ${meta.date}, N=${meta.n} repetitions per check.`,
    `A check whose pass rate is below ${QUARANTINE_BELOW * 100}% is **quarantined**; the priority run decides about budgets, agents never do.`, '',
    `${rows.length} checks, ${q} quarantined.`, '',
    '| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| \`${r.file}\` ${r.name.replace(/\|/g, '\\|')} | ${r.kind} | ${r.runs} | ${(r.passRate * 100).toFixed(0)}% | ${r.medianMs} | ${r.p10Ms}–${r.p90Ms} | ${r.quarantined ? 'quarantined' : 'ok'} |`);
  return lines.join('\n') + '\n';
}

function xmlFiles(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) xmlFiles(p, out); else if (n.endsWith('.xml')) out.push(p); }
  return out;
}

async function publish(mdFile) {
  await ensureLabels(readJson('ci/labels.json'));
  const base = process.env.GUARD_BRANCH || 'main';
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  git('config', 'user.name', 'lemma-ci'); git('config', 'user.email', 'lemma-ci@users.noreply.github.com');
  const name = `ci/calibration-${process.env.GITHUB_RUN_ID}`;
  git('checkout', '-b', name);
  copyFileSync(mdFile, 'ci/perf-calibration.md');
  git('add', 'ci/perf-calibration.md');
  if (!git('status', '--porcelain')) { console.log('no change to ci/perf-calibration.md'); return; }
  git('commit', '-m', 'ci: perf calibration');
  git('push', 'origin', `HEAD:refs/heads/${name}`);
  for (const p of await paginate(repoPath('/pulls?state=open'))) {
    if (/^ci: perf calibration/.test(p.title)) await api('PATCH', repoPath(`/pulls/${p.number}`), { state: 'closed' });
  }
  const pr = await api('POST', repoPath('/pulls'), { title: `ci: perf calibration ${new Date().toISOString().slice(0, 10)}`, head: name, base,
    body: `Agent: ci · Item: calibration\n\nNew calibration table from run ${process.env.GITHUB_RUN_ID}. Changes only ci/perf-calibration.md.` }, botOpts());
  console.log(`opened ${pr.html_url}`);
  const res = await landPr({ number: pr.number, branch: name, base });
  console.log(`land: ${JSON.stringify(res)}`);
  await api('POST', repoPath(`/issues/${pr.number}/comments`), { body: landingComment(res) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, a, b, c] = process.argv.slice(2);
  if (mode === 'aggregate') {
    const cases = xmlFiles(a).flatMap((f) => parseJUnit(readFileSync(f, 'utf8')));
    const rows = aggregate(cases);
    const meta = { run: process.env.GITHUB_RUN_ID || 'local', sha: (process.env.GITHUB_SHA || '').slice(0, 8), date: new Date().toISOString().slice(0, 10), n: process.env.CALIBRATE_N || '10' };
    writeFileSync(b, renderMarkdown(rows, meta));
    writeFileSync(c, JSON.stringify({ meta, rows }, null, 1));
    console.log(`${rows.length} checks, ${rows.filter((r) => r.quarantined).length} quarantined`);
  } else if (mode === 'publish') publish(a).catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
  else { console.error('usage: calibrate.mjs aggregate <dir> <md> <json> | publish <md>'); process.exit(2); }
}
