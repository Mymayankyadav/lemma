// v2.0: reuse a green fast-gate. When the only files changed since the PR's newest commit with a green fast-gate are
// bookkeeping files (CURRENT.md, NEXT.md), re-running typecheck, unit, smoke, e2e and SQL tests checks an unchanged
// program, so pr-gate.yml skips them and fast-gate passes on the earlier result. Main still runs the full suite
// after the merge. Writes `reuse=true|false` and `from=<sha>` to $GITHUB_OUTPUT.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { api, paginate, repoPath } from './gh.mjs';
import { BOOKKEEPING } from './bookkeeping.mjs';

const MAX_LOOKBACK = 20;

/** Pure: may a green result on an earlier commit stand for the head, given the files changed between them? */
export const canReuse = (changed) => changed.length > 0 && changed.every((f) => BOOKKEEPING.includes(f));

/** Pure: the newest successful completed fast-gate among check runs, or null. */
export const greenGate = (runs) => (runs || []).filter((r) => r.name === 'fast-gate' && r.status === 'completed').sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]?.conclusion === 'success';

function out(reuse, from = '') {
  console.log(reuse ? `reuse: fast-gate on ${from.slice(0, 7)} stands for this head (only ${BOOKKEEPING.join('/')} changed)` : 'reuse: no, running the checks');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\nfrom=${from}\n`);
}

async function main() {
  const head = process.env.HEAD_SHA;
  const commits = (await paginate(repoPath(`/pulls/${process.env.PR_NUMBER}/commits`))).map((c) => c.sha);
  const i = commits.lastIndexOf(head);
  if (i < 1) return out(false);
  for (let j = i - 1; j >= Math.max(0, i - MAX_LOOKBACK); j--) {
    const sha = commits[j];
    const runs = (await api('GET', repoPath(`/commits/${sha}/check-runs?check_name=fast-gate&per_page=20`))).check_runs;
    if (!greenGate(runs)) continue;
    const d = spawnSync('git', ['diff', '--name-only', sha, head], { encoding: 'utf8' });
    if (d.status !== 0) return out(false);
    return out(canReuse(d.stdout.split('\n').filter(Boolean)), sha);
  }
  out(false);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log(`::warning::reuse check failed, running the checks: ${e.message}`); out(false); });
