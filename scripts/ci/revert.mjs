// Automatic revert of a red main (ci.yml job `revert`, runs after the full suite failed).
//  1. find the commits merged since the last green CI run on this branch
//  2. open ONE `revert #<pr>` PR (several PRs -> one PR, said so in the body), label S0
//  3. add `Reverted: <date> — <signature>` under each reverted item in NEXT.md, comment on the original PRs
//  4. land it: dispatch fast-gate + scope under their exact names, enable auto-merge, merge if GitHub does not
// Never reverts a revert; if the red run follows a revert, or a revert conflicts, it only keeps the incident open.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { api, paginate, repoPath, ensureLabels, addLabels, GhError } from './gh.mjs';
import { readJson, plusHours } from './lib.mjs';
import { landPr, landingComment, botOpts } from './automerge.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const branch = process.env.GUARD_BRANCH || process.env.GITHUB_REF_NAME;
const head = process.env.GITHUB_SHA;
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const runUrl = `${server}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const prNumberOf = (subject) => Number(/\(#(\d+)\)\s*$/.exec(subject)?.[1]) || null;
const CALIBRATION = 'ci/perf-calibration.md';
/** A commit that touches only the calibration table is never a culprit (pure). */
export const onlyCalibration = (files) => files.length > 0 && files.every((f) => f === CALIBRATION);
const filesOf = (sha) => git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean);
const isRevertSubject = (s) => /^revert\b/i.test(s) || /^Revert "/.test(s);

/** Insert `Reverted: …` as the last line of the item block `## N<id>` (pure). */
export function addRevertedLine(md, id, line) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+N${id.replace(/\./g, '\\.')}\\b`).test(l));
  if (start < 0) return md;
  let end = start + 1;
  while (end < lines.length && !/^##\s+N\d/.test(lines[end]) && !/^\(.*\)\s*$/.test(lines[end])) end++;
  let at = end;
  while (at > start + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, line);
  return lines.join('\n');
}

async function lastGreenSha() {
  const runs = await api('GET', repoPath(`/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&status=success&event=push&per_page=30`));
  return runs.workflow_runs.map((r) => r.head_sha).find((s) => s && s !== head) || null;
}

async function main() {
  await ensureLabels(readJson('ci/labels.json'));
  const sigs = existsSync('signatures.json') ? JSON.parse(readFileSync('signatures.json', 'utf8')) : [];
  const signature = sigs[0]?.sig || `ci/${process.env.FAILED_JOBS || 'main'}:: job failed with no test report`;
  const commentMain = async (text) => {
    const open = await paginate(repoPath('/issues?labels=incident&state=open'));
    const inc = open.find((i) => !i.pull_request && (i.body || '').includes('<!-- main-incident -->'));
    if (inc) await api('POST', repoPath(`/issues/${inc.number}/comments`), { body: text });
  };
  const note = async (t) => { console.log(t); await commentMain(t); };

  const headSubject = git('log', '-1', '--format=%s', head);
  if (isRevertSubject(headSubject)) return note('The red run follows a revert; not reverting again. The S0 incident stays open.');
  const green = await lastGreenSha();
  if (!green) return note('No earlier green run found on this branch; cannot choose commits. The S0 incident stays open.');
  const commits = git('rev-list', '--first-parent', '--reverse', `${green}..${head}`).split('\n').filter(Boolean)
    .map((sha) => ({ sha, subject: git('log', '-1', '--format=%s', sha), parents: git('log', '-1', '--format=%P', sha).split(' ').length }));
  const todo = commits.filter((c) => !isRevertSubject(c.subject) && !onlyCalibration(filesOf(c.sha)));
  if (!todo.length) return note('No revertable commits since the last green run. The S0 incident stays open.');
  const prs = [...new Set(todo.map((c) => prNumberOf(c.subject)).filter(Boolean))];

  git('config', 'user.name', 'lemma-ci');
  git('config', 'user.email', 'lemma-ci@users.noreply.github.com');
  const name = `ci/revert-${head.slice(0, 8)}`;
  git('checkout', '-b', name);
  for (const c of [...todo].reverse()) {
    try { execFileSync('git', ['revert', '--no-edit', ...(c.parents > 1 ? ['-m', '1'] : []), c.sha], { stdio: 'pipe' }); }
    catch (e) {
      try { git('revert', '--abort'); } catch { /* nothing to abort */ }
      return note(`Reverting ${c.sha.slice(0, 8)} (${c.subject}) conflicts; no automatic revert. The S0 incident stays open.`);
    }
  }
  // NEXT.md: Reverted: line under each reverted N<id> item
  const date = new Date().toISOString().slice(0, 10);
  let next = readFileSync('NEXT.md', 'utf8');
  const titles = {};
  for (const n of prs) {
    try { titles[n] = (await api('GET', repoPath(`/pulls/${n}`))).title; } catch { titles[n] = ''; }
    const id = /^N(\d+(?:\.\d+)*)\b/.exec(titles[n])?.[1];
    if (id) next = addRevertedLine(next, id, `Reverted: ${date} — ${signature}`);
  }
  writeFileSync('NEXT.md', next);
  git('add', 'NEXT.md');
  if (git('status', '--porcelain')) git('commit', '-m', `Reverted: lines under the reverted NEXT.md item(s)\n\n${signature}`);
  git('push', 'origin', `HEAD:refs/heads/${name}`);

  const title = `revert ${prs.map((n) => '#' + n).join(' ')}`.trim() || `revert #${todo[0].sha.slice(0, 7)}`;
  const body = [`Agent: ci · Item: revert · Lease until ${plusHours(3)}`, '',
    `Automatic revert: \`${branch}\` went red after ${todo.length} merge(s)${prs.length > 1 ? ' (several PRs reverted together in this one PR)' : ''}.`, '',
    `- Failing run: ${runUrl}`, `- Signature: \`${signature}\``, `- Reverted commits: ${todo.map((c) => `${c.sha.slice(0, 8)} ${c.subject}`).join('; ')}`, '',
    'Each reverted item is open again in NEXT.md with a `Reverted:` line.'].join('\n');
  // opened with CI_BOT_TOKEN so the PR's own pull_request / pull_request_target checks really run
  const pr = await api('POST', repoPath('/pulls'), { title, head: name, base: branch, body }, botOpts());
  await addLabels(pr.number, ['S0']);
  console.log(`opened ${pr.html_url}`);
  await commentMain(`Revert PR opened: ${pr.html_url}`);
  for (const n of prs) {
    await api('POST', repoPath(`/issues/${n}/comments`), { body: `Reverted automatically: \`${branch}\` was red after this PR merged.\n\n- Signature: \`${signature}\`\n- Run: ${runUrl}\n- Revert PR: #${pr.number}\n\nThe item is open again in NEXT.md.` });
  }
  const res = await landPr({ number: pr.number, branch: name, base: branch, pages: true });
  console.log(`land: ${JSON.stringify(res)}`);
  await api('POST', repoPath(`/issues/${pr.number}/comments`), { body: landingComment(res) });
  if (res.result !== 'merged') await commentMain(`Revert PR #${pr.number} did not land: ${res.result}. ${res.message || ''}`.trim());
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
