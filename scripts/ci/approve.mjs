// CI merges, agents do not. A reviewer comments exactly
//     Approve · Agent: <name>
// or  Changes requested · Agent: <name>: <what to change>
// and this script (review-merge.yml: issue_comment, workflow_run of PR gate / scope, workflow_dispatch) squash-merges
// the PR with CI_BOT_TOKEN when ALL of these hold:
//   - the PR is an agent PR (N<id>, bug #n, incident #n) on the default branch, not a draft, from this repository;
//   - the latest verdict is an Approve whose Agent name differs from the PR's `Agent:` line, written by a repository
//     owner/member/collaborator, AFTER the head commit (any push after an approval voids it);
//   - fast-gate and scope are green on the current head;
//   - the changes-requested label is absent (a "Changes requested" comment adds it; the author's push removes it);
//   - no S0 freeze applies, except to the incident's own `incident #<n>` fix PR.
// `rules:` PRs, reverts and calibration PRs are never merged here (the Owner merges `rules:`; revert and calibration
// PRs keep their own path in automerge.mjs). The script reads everything through the API from the default branch and
// never runs PR code. Without CI_BOT_TOKEN it refuses to merge: a merge by GITHUB_TOKEN would not start the full suite.
import { readFileSync } from 'node:fs';
import { api, paginate, repoPath, addLabels, parseLine1, GhError, REPO, appendSummary } from './gh.mjs';
import { classifyTitle } from './scope.mjs';
import { botToken, botOpts, requiredStates, classifyMergeError } from './automerge.mjs';
import { renderFeedback, upsertFeedback } from './feedback.mjs';

const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const NAME = '([^\\s·:][^·:\\n]*?)';
const APPROVE = new RegExp(`^Approve\\s*·\\s*Agent:\\s*${NAME}\\s*$`);
const CHANGES = new RegExp(`^Changes requested\\s*·\\s*Agent:\\s*${NAME}\\s*:\\s*(\\S[\\s\\S]*)$`);

/** Pure: a verdict comment, or null. An Approve must be the whole comment. */
export function parseVerdict(body) {
  const text = String(body || '').trim();
  let m = APPROVE.exec(text);
  if (m) return { kind: 'approve', agent: m[1].trim() };
  m = CHANGES.exec(text);
  if (m) return { kind: 'changes', agent: m[1].trim(), what: m[2].trim() };
  return null;
}

/**
 * Pure decision. ctx = {
 *   pr: { number, title, body, draft, state, baseRef, headSha, headRepo, labels: string[] },
 *   defaultBranch, repo, comments: [{ id, body, created_at, author_association }], headCommitDate (ISO),
 *   checks: { 'fast-gate', scope } (success|failure|pending|missing…), s0: number[] (open S0 incident numbers) }
 * Returns { merge, reasons, approval, addChangesLabel, attempted } (attempted = a verdict exists, so a status note is useful).
 */
export function evaluateMerge(ctx) {
  const { pr } = ctx;
  const reasons = [];
  const kind = classifyTitle(pr.title).kind;
  const line1 = parseLine1(pr.body);
  const labels = new Set(pr.labels);
  if (pr.state !== 'open') reasons.push('the PR is not open');
  if (pr.draft) reasons.push('the PR is a draft');
  if (pr.baseRef !== ctx.defaultBranch) reasons.push(`the base branch is ${pr.baseRef}, not ${ctx.defaultBranch}`);
  if (pr.headRepo && pr.headRepo !== ctx.repo) reasons.push('the head branch is in another repository');
  if (!['item', 'bug', 'incident'].includes(kind)) reasons.push(`a "${kind ?? 'unknown'}" PR is not merged by CI (only N<id>, bug #n and incident #n PRs are; the Owner merges rules: PRs)`);
  if (!line1) reasons.push('line 1 of the PR body is not "Agent: <name> · Item: <id>"');
  else if (line1.agent.toLowerCase() === 'ci') reasons.push('CI-opened PRs keep their own landing path');

  const sorted = [...ctx.comments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const headAt = new Date(ctx.headCommitDate).getTime();
  let approval = null;
  let lastChanges = null;
  let attempted = false;
  const notes = [];
  for (const c of sorted) {
    if (!TRUSTED.has(c.author_association)) continue;
    const v = parseVerdict(c.body);
    if (!v) continue;
    attempted = true;
    const at = new Date(c.created_at).getTime();
    if (v.kind === 'approve') {
      if (line1 && v.agent.toLowerCase() === line1.agent.toLowerCase()) { notes.push(`the approval by "${v.agent}" is ignored: it has the same Agent name as the PR author`); continue; }
      approval = { agent: v.agent, at, id: c.id };
    } else {
      approval = null;
      lastChanges = { agent: v.agent, at, what: v.what };
    }
  }
  reasons.push(...notes);
  const addChangesLabel = !!lastChanges && lastChanges.at > headAt && !labels.has('changes-requested');
  if (!approval) {
    if (attempted || lastChanges) reasons.push(lastChanges ? `changes were requested by ${lastChanges.agent}: ${lastChanges.what}` : 'there is no valid approval (comment exactly "Approve · Agent: <your name>", with a name different from the PR author)');
  } else if (approval.at <= headAt) {
    reasons.push(`the approval by ${approval.agent} is void: a commit was pushed after it. Approve again after reviewing the new head`);
  }
  if (labels.has('changes-requested') || addChangesLabel) reasons.push('the changes-requested label is present (the author\'s next push removes it; then a fresh approval is needed)');
  for (const n of ['fast-gate', 'scope']) if (ctx.checks[n] !== 'success') reasons.push(`${n} is ${ctx.checks[n] ?? 'missing'} on the current head (it must be green)`);
  const own = (ctx.s0 || []).some((n) => new RegExp(`^incident #${n}\\b`).test(pr.title));
  if ((ctx.s0 || []).length && !own) reasons.push(`merges are frozen by S0 incident(s) ${ctx.s0.map((n) => '#' + n).join(', ')}; only the incident's own fix PR ("incident #<n> …") merges`);
  const valid = approval && approval.at > headAt;
  return { merge: reasons.length === 0 && !!valid, reasons, approval: valid ? approval : null, addChangesLabel, attempted };
}

async function loadContext(number) {
  const pr = await api('GET', repoPath(`/pulls/${number}`));
  const comments = await paginate(repoPath(`/issues/${number}/comments`));
  const head = await api('GET', repoPath(`/commits/${pr.head.sha}`));
  const checks = await requiredStates(pr.head.sha);
  const incidents = await paginate(repoPath('/issues?state=open&labels=S0,incident'));
  return {
    pr: { number, title: pr.title, body: pr.body || '', draft: pr.draft, state: pr.state, baseRef: pr.base.ref, headSha: pr.head.sha, headRepo: pr.head.repo?.full_name, labels: pr.labels.map((l) => l.name) },
    defaultBranch: process.env.DEFAULT_BRANCH || (await api('GET', repoPath(''))).default_branch,
    repo: REPO, comments, headCommitDate: head.commit.committer.date, checks,
    s0: incidents.filter((i) => !i.pull_request).map((i) => i.number),
  };
}

async function handle(number) {
  const ctx = await loadContext(number);
  const res = evaluateMerge(ctx);
  console.log(`#${number}: merge=${res.merge} ${JSON.stringify(res.reasons)}`);
  if (res.addChangesLabel) { await addLabels(number, ['changes-requested']); console.log(`#${number}: changes-requested added`); }
  if (!res.merge) {
    if (res.attempted) {
      const text = renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: false, items: res.reasons });
      await upsertFeedback({ pr: number, gate: 'merge', text });
    }
    return res;
  }
  if (!botToken()) {
    const text = renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: false, items: ['CI_BOT_TOKEN is not configured, so CI will not merge (a merge by GITHUB_TOKEN would not start the full suite on main). Ask the Owner.'] });
    await upsertFeedback({ pr: number, gate: 'merge', text });
    return { ...res, merge: false };
  }
  try {
    await api('PUT', repoPath(`/pulls/${number}/merge`), {
      merge_method: 'squash', sha: ctx.pr.headSha, commit_title: `${ctx.pr.title} (#${number})`,
      commit_message: `Agent: ${parseLine1(ctx.pr.body).agent}\nApproved by Agent: ${res.approval.agent}\nMerged by CI (scripts/ci/approve.mjs).`,
    }, botOpts());
    console.log(`#${number}: squash-merged`);
    await upsertFeedback({ pr: number, gate: 'merge', text: renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: true, note: `Merged by CI after the approval by ${res.approval.agent}.` }), createIfMissing: false });
    return res;
  } catch (e) {
    const kind = classifyMergeError(e);
    const why = kind === 'blocked' ? `the ruleset refused the merge (${e.message.slice(0, 200)}); CI does not bypass it` : kind === 'retry' ? `GitHub said the base moved or the PR is not mergeable yet (${e.message.slice(0, 200)}); the next check completion or approval comment retries` : `merge failed: ${e.message.slice(0, 200)}`;
    await upsertFeedback({ pr: number, gate: 'merge', text: renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: false, items: [why] }) });
    console.log(`::warning::#${number}: ${why}`);
    return { ...res, merge: false };
  }
}

async function prNumbers() {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  if (process.env.PR_NUMBER) return [Number(process.env.PR_NUMBER)];
  if (event.issue?.pull_request) return [event.issue.number];
  const sha = event.workflow_run?.head_sha;
  if (sha) {
    const prs = await api('GET', repoPath(`/commits/${sha}/pulls`));
    return prs.filter((p) => p.state === 'open').map((p) => p.number);
  }
  return [];
}

async function main() {
  const numbers = await prNumbers();
  const lines = ['## review-merge', ''];
  for (const n of numbers) {
    const r = await handle(n);
    lines.push(`- #${n}: ${r.merge ? 'merged' : 'not merged'}${r.reasons.length ? ' — ' + r.reasons.join('; ') : ''}`);
  }
  if (!numbers.length) lines.push('- no pull request for this event');
  appendSummary(lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
