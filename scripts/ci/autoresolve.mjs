// autoresolve (v1.9, v2.1 waits for a running PR gate): merge main into open PRs whose ONLY merge conflicts are in CURRENT.md / NEXT.md, keeping both
// sides (scripts/ci/bookkeeping.mjs). Runs from autoresolve.yml on the default branch. It never runs PR code: it only
// merges files with git. Pushes use CI_BOT_TOKEN so the PR gate runs on the new head; the `bookkeeping-merge` check
// run (Actions token) marks the commit so Ready and approvals given before it stay valid.
//   PR_NUMBER=<n>  only that PR (default: every open PR from this repository)
//   DRY_RUN=1      report what would happen, push nothing
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, paginate, repoPath, REPO, GhError } from './gh.mjs';
import { BOOKKEEPING, CHECK_NAME, COMMIT_PREFIX, mergeSections } from './bookkeeping.mjs';
import { stateOf, GATE } from './conflicts.mjs';
import { renderFeedback, upsertFeedback } from './feedback.mjs';

const git = (args, opts = {}) => {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const must = (args, opts) => { const r = git(args, opts); if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.err || r.out}`); return r.out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pure (v2.1): is a PR gate run still going for this head? Merging main now would cancel it and restart every test,
 *  and with main moving every few minutes a Ready PR could loop forever. Wait; autoresolve runs again when it ends. */
export const gateRunning = (runs, head) => (runs || []).some((r) => r.name === 'PR gate' && r.head_sha === head && r.status !== 'completed');

/** Pure: the decision for a PR from the files git reports as conflicted. */
export function planFor(conflicted) {
  if (!conflicted.length) return { action: 'skip', why: 'git finds no conflict (GitHub has not recomputed yet)' };
  const other = conflicted.filter((f) => !BOOKKEEPING.includes(f));
  if (other.length) return { action: 'author', why: `conflicts outside bookkeeping files: ${other.join(', ')}` };
  return { action: 'resolve', files: conflicted };
}

async function prState(number) {
  let p = null;
  for (let i = 0; i < 4 && stateOf(p) === 'unknown'; i++) { if (i) await sleep(4000); p = await api('GET', repoPath(`/pulls/${number}`)); }
  return p;
}

async function handle(number, baseSha, dry) {
  const pr = await prState(number);
  if (pr.state !== 'open' || stateOf(pr) !== 'conflict') return `#${number}: ${stateOf(pr)}, nothing to do`;
  if (pr.head.repo?.full_name !== REPO) return `#${number}: head is in another repository, skipped`;
  const branch = pr.head.ref;
  must(['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/pr/${number}`]);
  const head = must(['rev-parse', `refs/remotes/pr/${number}`]);
  if (head !== pr.head.sha) return `#${number}: branch moved while checking, next run`;
  const runs = (await api('GET', repoPath(`/actions/runs?head_sha=${head}&per_page=30`))).workflow_runs;
  if (gateRunning(runs, head)) return `#${number}: PR gate still running on ${head.slice(0, 7)}; merging main after it finishes`;
  const tree = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', head, baseSha]);
  const conflicted = tree.code === 1 ? tree.out.split('\n').slice(1).filter(Boolean) : [];
  const plan = planFor(conflicted);
  if (plan.action !== 'resolve') return `#${number}: ${plan.why}`;

  const wt = mkdtempSync(join(tmpdir(), `ar-${number}-`));
  try {
    must(['worktree', 'add', '--quiet', '--detach', wt, head]);
    const ID = ['-c', 'user.name=lemma-ci', '-c', 'user.email=lemma-ci@users.noreply.github.com'];
    const g = (args) => git([...ID, ...args], { cwd: wt });
    // git merge needs an identity even with --no-commit; exit 1 = conflicts (expected), anything else is a real error
    const merged = g(['-c', 'merge.conflictStyle=diff3', 'merge', '--no-ff', '--no-commit', '--quiet', baseSha]);
    if (merged.code !== 1) return `#${number}: git merge exited ${merged.code}, expected conflicts: ${merged.err || merged.out}`;
    for (const f of plan.files) {
      const side = (n) => { const r = g(['show', `:${n}:${f}`]); return r.code === 0 ? r.out + '\n' : null; };
      const [b, o, t] = [side(1), side(2), side(3)];
      const res = o == null || t == null ? { error: `${f} was deleted on one side` } : mergeSections(b ?? '', o, t);
      if (res.error) {
        await upsertFeedback({ pr: number, gate: GATE, text: renderFeedback({ gate: GATE, sha: head, ok: false, items: [
          `This PR conflicts with \`${pr.base.ref}\` in: \`${f}\`. CI resolves conflicts in ${BOOKKEEPING.join(' and ')} by itself when both sides only added or removed whole sections, but here ${res.error}. To comply: merge \`${pr.base.ref}\` into your branch and keep both sides' content in that section, then push.`,
        ] }) });
        return `#${number}: ${f}: ${res.error}; left to the author`;
      }
      writeFileSync(join(wt, f), res.text);
      must(['add', f], { cwd: wt });
    }
    const left = g(['diff', '--name-only', '--diff-filter=U']).out;
    if (left) return `#${number}: still unmerged after resolving: ${left}`;
    const msg = `${COMMIT_PREFIX} ${plan.files.join(', ')})\n\nAgent: ci · Item: autoresolve\n\nMerged ${pr.base.ref} (${baseSha.slice(0, 7)}) into ${branch}. Only ${plan.files.join(' and ')} conflicted; CI kept both sides section by section. No other file was resolved by hand.`;
    must([...ID, 'commit', '--quiet', '-m', msg], { cwd: wt });
    const sha = must(['rev-parse', 'HEAD'], { cwd: wt });
    if (dry) return `#${number}: would push ${sha.slice(0, 7)} (${plan.files.join(', ')})`;
    const url = `https://x-access-token:${process.env.CI_BOT_TOKEN}@github.com/${REPO}.git`;
    const push = git(['push', '--quiet', url, `${sha}:refs/heads/${branch}`], { cwd: wt });
    if (push.code !== 0) return `#${number}: push refused (the author probably pushed meanwhile): ${push.err.replaceAll(process.env.CI_BOT_TOKEN || '\u0000', '***')}`;
    await api('POST', repoPath('/check-runs'), {
      name: CHECK_NAME, head_sha: sha, status: 'completed', conclusion: 'success',
      output: { title: `CI merged ${pr.base.ref}: bookkeeping only`, summary: `Only ${plan.files.join(' and ')} conflicted; resolved section by section. Ready and approvals given before this commit still count.` },
    });
    await upsertFeedback({ pr: number, gate: GATE, text: renderFeedback({ gate: GATE, sha, ok: true,
      note: `CI merged \`${pr.base.ref}\` into this branch (\`${sha.slice(0, 7)}\`) and kept both sides of ${plan.files.map((f) => '`' + f + '`').join(' and ')}. This is bookkeeping only: your Ready and any approval given before it still count, and checks re-run on the new head. Pull before your next push.` }) });
    return `#${number}: resolved ${plan.files.join(', ')} -> ${sha.slice(0, 7)}`;
  } finally {
    git(['worktree', 'remove', '--force', wt]);
    rmSync(wt, { recursive: true, force: true });
  }
}

async function main() {
  const dry = process.env.DRY_RUN === '1';
  if (!dry && !process.env.CI_BOT_TOKEN) { console.log('::warning::CI_BOT_TOKEN is not set: pushes would not start the PR gate, so nothing is resolved'); return; }
  const def = (await api('GET', repoPath(''))).default_branch;
  must(['fetch', '--quiet', 'origin', `+refs/heads/${def}:refs/remotes/origin/${def}`]);
  const baseSha = must(['rev-parse', `refs/remotes/origin/${def}`]);
  const numbers = process.env.PR_NUMBER ? [Number(process.env.PR_NUMBER)]
    : (await paginate(repoPath('/pulls?state=open'))).filter((p) => p.base.ref === def).map((p) => p.number).sort((a, b) => a - b);
  for (const n of numbers) {
    try { console.log(await handle(n, baseSha, dry)); }
    catch (e) { console.log(`::warning::#${n}: ${e instanceof GhError ? e.message : e.message}`); }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
