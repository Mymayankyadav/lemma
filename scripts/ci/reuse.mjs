// v2.0: reuse a green fast-gate. When the only files changed since the PR's newest commit with a green fast-gate are
// bookkeeping files (CURRENT.md, NEXT.md), re-running typecheck, unit, smoke, e2e and SQL tests checks an unchanged
// program, so pr-gate.yml skips them and fast-gate passes on the earlier result. Main still runs the full suite
// after the merge. Writes `reuse=true|false` and `from=<sha>` to $GITHUB_OUTPUT.
// v2.1: a green fast-gate also stands when the PR's OWN changes are identical: every file the PR changes against
// the base (outside CURRENT.md / NEXT.md) has the same content at both commits and the set of such files is the same.
// That is the case after CI (or the author) merges main into the branch without touching the PR's files: the only new
// files came from main, which runs the full suite after every merge and reverts on red. Without this, each merge from
// main restarted ~14 minutes of tests, main moved again meanwhile, and a Ready PR never got merged.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { api, paginate, repoPath } from './gh.mjs';
import { BOOKKEEPING } from './bookkeeping.mjs';

const MAX_LOOKBACK = 20;

/** Pure: may a green result on an earlier commit stand for the head, given the files changed between them? */
export const canReuse = (changed) => changed.length > 0 && changed.every((f) => BOOKKEEPING.includes(f));

/** Pure: same own changes? a, b = Map(path -> blob sha or null when the PR deletes it), bookkeeping already excluded. */
export function sameOwnChanges(a, b) {
  if (!(a instanceof Map) || !(b instanceof Map) || a.size === 0 || a.size !== b.size) return false;
  for (const [f, blob] of a) if (!b.has(f) || b.get(f) !== blob) return false;
  return true;
}

/** The PR's own changes at commit `sha`: files it changes against its merge base with `base`, with their blobs. */
export function ownChanges(sha, base, run = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 })) {
  const mb = run(['merge-base', sha, base]);
  if (mb.status !== 0) return null;
  const d = run(['diff', '--name-only', '--no-renames', mb.stdout.trim(), sha]);
  if (d.status !== 0) return null;
  const out = new Map();
  for (const f of d.stdout.split('\n').filter(Boolean)) {
    if (BOOKKEEPING.includes(f)) continue;
    const b = run(['rev-parse', '--verify', '--quiet', `${sha}:${f}`]);
    out.set(f, b.status === 0 ? b.stdout.trim() : null);
  }
  return out;
}

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
    if (canReuse(d.stdout.split('\n').filter(Boolean))) return out(true, sha);
    const base = process.env.BASE_SHA;
    if (base) {
      const [a, b] = [ownChanges(sha, base), ownChanges(head, base)];
      if (a && b && sameOwnChanges(a, b)) {
        console.log(`reuse: the PR's own ${a.size} changed file(s) are identical on ${sha.slice(0, 7)} and the head; the other differences came from ${process.env.BASE_REF || 'the base'}`);
        return out(true, sha);
      }
    }
    return out(false);
  }
  out(false);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log(`::warning::reuse check failed, running the checks: ${e.message}`); out(false); });
