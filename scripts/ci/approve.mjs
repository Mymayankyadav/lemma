// CI merges, agents do not. Reviewers comment exactly
//     Approve · Agent: <name>
// or  Changes requested · Agent: <name>: <what to change>
// and authors comment `Ready · Agent: <author>` when they believe the item's Done is met. This script
// (review-merge.yml: issue_comment, workflow_run of PR gate / scope, workflow_dispatch):
//   1. labels the PR needs-review when the author's Ready is newer than the last push and fast-gate and scope pass
//      (and removes the label again after a push or when checks stop passing);
//   2. adds changes-requested when a standing "Changes requested" verdict exists;
//   3. squash-merges with CI_BOT_TOKEN when ALL of these hold:
//      - an agent PR (N<id>, bug #n, incident #n) on the default branch, not a draft, from this repository;
//      - an Approve whose Agent differs from the PR's, newer than the head commit (a push voids earlier verdicts);
//      - only valid agent names count (lemma-<n>, chat-<n>#<tag>, owner-setup*, priority, ci), and a chat number locked
//        by another session (see sessions.mjs) is ignored; per agent only the LATEST verdict counts;
//      - no standing "Changes requested" and no changes-requested label (the author's push removes it);
//      - fast-gate and scope green on the head; no S0 freeze, except for the incident's own fix PR.
// ALL_OPEN=1 (ci.yml, after a green main) evaluates every open PR labelled needs-review, oldest first, so approvals that
// arrived during an S0 freeze are not left waiting for a new comment or check.
// `rules:` PRs, reverts and calibration PRs are never merged here. The script reads everything through the API from
// the default branch and never runs PR code. Without CI_BOT_TOKEN it refuses to merge.
import { readFileSync } from 'node:fs';
import { api, paginate, repoPath, addLabels, parseLine1, GhError, REPO, appendSummary } from './gh.mjs';
import { classifyTitle } from './scope.mjs';
import { botToken, botOpts, requiredStates, classifyMergeError } from './automerge.mjs';
import { renderFeedback, upsertFeedback } from './feedback.mjs';
import { agentKey, validAgentName, NAME_FORMATS, chatParts } from './lib.mjs';
import { parseVerdict, parseReady, effectiveVerdicts, needsReviewWanted, validReady, isTrusted } from './verdicts.mjs';
import { reviewRequired } from './review-policy.mjs';
import { effectiveHeadDate, verifiedBookkeepingShas } from './bookkeeping.mjs';
import { loadSessions, saveSessions, checkSession, touchSession, lockMessage } from './sessions.mjs';

export { parseVerdict, parseReady };

/**
 * Pure decision. ctx = {
 *   pr: { number, title, body, draft, state, baseRef, headSha, headRepo, labels: string[] },
 *   defaultBranch, repo, comments: [{ id, body, created_at, author_association }], headCommitDate (ISO),
 *   checks: { 'fast-gate', scope }, s0: number[], sessions?: {chat-<n>: {tag, seen}}, now?: ms }
 * Returns { merge, reasons, approval, addChangesLabel, attempted, ignored: {invalid, locked}, needsReview }.
 */
export function evaluateMerge(ctx) {
  const { pr } = ctx;
  const reasons = [];
  const kind = classifyTitle(pr.title).kind;
  const line1 = parseLine1(pr.body);
  const labels = new Set(pr.labels);
  const now = ctx.now ?? Date.now();
  const authorKey = line1 ? agentKey(line1.agent) : null;
  if (pr.state !== 'open') reasons.push('the PR is not open');
  if (pr.draft) reasons.push('the PR is a draft');
  if (pr.baseRef !== ctx.defaultBranch) reasons.push(`the base branch is ${pr.baseRef}, not ${ctx.defaultBranch}`);
  if (pr.headRepo && pr.headRepo !== ctx.repo) reasons.push('the head branch is in another repository');
  if (!['item', 'bug', 'incident'].includes(kind)) reasons.push(`a "${kind ?? 'unknown'}" PR is not merged by CI (only N<id>, bug #n and incident #n PRs are; the Owner merges rules: PRs)`);
  if (!line1) reasons.push('line 1 of the PR body is not "Agent: <name> · Item: <id>"');
  else if (line1.agent.toLowerCase() === 'ci') reasons.push('CI-opened PRs keep their own landing path');
  else if (!validAgentName(line1.agent)) reasons.push(`the PR's Agent name "${line1.agent}" is not valid (use ${NAME_FORMATS})`);

  const headAt = new Date(ctx.headCommitDate).getTime();
  const v = effectiveVerdicts({ comments: ctx.comments, headAt, sessions: ctx.sessions || {}, now });
  const standing = [...v.byAgent.values()];
  const approvals = standing.filter((x) => x.kind === 'approve' && x.key !== authorKey);
  const selfApprovals = standing.filter((x) => x.kind === 'approve' && x.key === authorKey);
  const changes = standing.filter((x) => x.kind === 'changes');
  const addChangesLabel = changes.length > 0 && !labels.has('changes-requested');

  // v2.0: only PRs that touch production paths or turn a flag on need an independent Approve; the rest merge on the
  // author's Ready (newer than the last push) once fast-gate and scope are green.
  const needReview = ctx.reviewRequired !== false;
  const ready = authorKey ? validReady({ comments: ctx.comments, headAt, authorKey, sessions: ctx.sessions || {}, now }) : null;
  if (changes.length) {
    reasons.push(`changes were requested by ${changes[0].agent}: ${changes[0].what}`);
  } else if (!needReview) {
    if (!ready) reasons.push(`the author has not commented exactly "Ready · Agent: ${line1?.agent ?? '<author>'}" after the last push (no review is needed for this PR, Ready is enough)`);
  } else if (!approvals.length) {
    for (const s of selfApprovals) reasons.push(`the approval by "${s.agent}" is ignored: it has the same Agent name as the PR author`);
    // the valid formats and the lock message are explained once, in the agent-names comment
    for (const n of v.invalid) reasons.push(`the verdict by "${n}" is ignored: not a valid Agent name (see the agent-names comment)`);
    for (const l of v.locked) reasons.push(`a verdict by ${l.base} is ignored: that chat number is in use by another session (see the agent-names comment)`);
    if (v.stale.some((x) => x.kind === 'approve')) reasons.push(`the approval by ${v.stale.filter((x) => x.kind === 'approve').pop().agent} is void: a commit was pushed after it. Approve again after reviewing the new head`);
    if (v.attempted) reasons.push('there is no valid approval (comment exactly "Approve · Agent: <your name>", with a valid name different from the PR author)');
  }
  if (labels.has('changes-requested') || addChangesLabel) reasons.push('the changes-requested label is present (the author\'s next push removes it; then a fresh approval is needed)');
  for (const n of ['fast-gate', 'scope']) if (ctx.checks[n] !== 'success') reasons.push(`${n} is ${ctx.checks[n] ?? 'missing'} on the current head (it must be green)`);
  const own = (ctx.s0 || []).some((n) => new RegExp(`^incident #${n}\\b`).test(pr.title));
  if ((ctx.s0 || []).length && !own) reasons.push(`merges are frozen by S0 incident(s) ${ctx.s0.map((n) => '#' + n).join(', ')}; only the incident's own fix PR ("incident #<n> …") merges`);

  const needsReview = pr.state === 'open' && needsReviewWanted({ authorKey, comments: ctx.comments, headAt, checks: ctx.checks, labels, draft: pr.draft, isCi: authorKey === 'ci', sessions: ctx.sessions || {}, now, reviewRequired: needReview });
  return {
    merge: reasons.length === 0 && (needReview ? approvals.length > 0 : !!ready),
    reviewRequired: needReview,
    reasons, approval: approvals[0] || null, ready: ready || null, addChangesLabel, attempted: v.attempted,
    ignored: { invalid: v.invalid, locked: v.locked }, needsReview,
  };
}

/**
 * Pure: the squash commit message and the success note for a merge. A PR that needs no review (v2.0) has no approval,
 * so the text names the author's Ready instead (#895: reading res.approval.agent crashed the no-review merge).
 */
export function mergeTexts(res, prBody) {
  const author = parseLine1(prBody || '')?.agent ?? 'unknown';
  const by = res.approval ? `Approved by Agent: ${res.approval.agent}` : `No review required (v2.0); Ready by Agent: ${res.ready?.agent ?? author}`;
  const note = res.approval ? `Merged by CI after the approval by ${res.approval.agent}.` : `Merged by CI on the author's Ready and green checks (no review required for this PR).`;
  return { commitMessage: `Agent: ${author}\n${by}\nMerged by CI (scripts/ci/approve.mjs).`, note };
}

async function loadContext(number) {
  const pr = await api('GET', repoPath(`/pulls/${number}`));
  const comments = await paginate(repoPath(`/issues/${number}/comments`));
  // v1.9: a CI bookkeeping merge (autoresolve) does not void Ready or approvals
  const prCommits = await paginate(repoPath(`/pulls/${number}/commits`));
  const headAt = effectiveHeadDate(prCommits, await verifiedBookkeepingShas(prCommits, api, repoPath));
  const checks = await requiredStates(pr.head.sha);
  const review = reviewRequired(await paginate(repoPath(`/pulls/${number}/files`)));
  const incidents = await paginate(repoPath('/issues?state=open&labels=S0,incident'));
  const line1 = parseLine1(pr.body || '');
  const chatNames = new Set([line1?.agent, ...comments.map((c) => parseVerdict(c.body)?.agent || parseReady(c.body)?.agent)].filter((n) => n && chatParts(n)));
  const reg = chatNames.size ? await loadSessions() : { issue: null, map: {} };
  return {
    pr: { number, title: pr.title, body: pr.body || '', draft: pr.draft, state: pr.state, baseRef: pr.base.ref, headSha: pr.head.sha, headRepo: pr.head.repo?.full_name, labels: pr.labels.map((l) => l.name) },
    defaultBranch: process.env.DEFAULT_BRANCH || (await api('GET', repoPath(''))).default_branch,
    repo: REPO, comments, headCommitDate: new Date(headAt).toISOString(), checks, reviewRequired: review.required,
    s0: process.env.SELFTEST_IGNORE_S0 === 'true' ? [] : incidents.filter((i) => !i.pull_request).map((i) => i.number),
    sessions: reg.map, registry: reg.issue,
  };
}

async function dropLabel(number, name) {
  try { await api('DELETE', repoPath(`/issues/${number}/labels/${encodeURIComponent(name)}`)); console.log(`#${number}: ${name} removed`); }
  catch (e) { if (!(e instanceof GhError && e.status === 404)) throw e; }
}

/** One comment (edited in place) that explains invalid names and locked chat numbers. */
async function explainNames(number, res, ctx) {
  const items = [];
  for (const n of res.ignored.invalid) items.push(`"${n}" is not a valid Agent name, so its verdict is ignored. Valid names: ${NAME_FORMATS}.`);
  for (const l of res.ignored.locked) items.push(`${lockMessage(l)}; its verdict is ignored.`);
  if (items.length) await upsertFeedback({ pr: number, gate: 'agent-names', text: renderFeedback({ gate: 'agent-names', sha: ctx.pr.headSha, ok: false, items }) });
}

async function handle(number) {
  const ctx = await loadContext(number);
  const res = evaluateMerge(ctx);
  console.log(`#${number}: merge=${res.merge} needs-review=${res.needsReview} ${JSON.stringify(res.reasons)}`);
  if (ctx.pr.state !== 'open') return res;
  // session lock: record chat activity that was accepted
  if (ctx.registry) {
    let changed = false;
    for (const c of ctx.comments) {
      const a = (parseVerdict(c.body) || parseReady(c.body))?.agent;
      if (a && chatParts(a) && isTrusted(c) && checkSession(ctx.sessions, a, Date.now()).ok) changed = touchSession(ctx.sessions, a, c.created_at) || changed;
    }
    if (changed) await saveSessions(ctx.registry, ctx.sessions);
  }
  await explainNames(number, res, ctx);
  const labels = new Set(ctx.pr.labels);
  if (res.addChangesLabel) { await addLabels(number, ['changes-requested']); console.log(`#${number}: changes-requested added`); }
  if (res.needsReview && !labels.has('needs-review')) { await addLabels(number, ['needs-review']); console.log(`#${number}: needs-review added`); }
  if (!res.needsReview && labels.has('needs-review')) await dropLabel(number, 'needs-review');
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
  const texts = mergeTexts(res, ctx.pr.body);
  try {
    await api('PUT', repoPath(`/pulls/${number}/merge`), {
      merge_method: 'squash', sha: ctx.pr.headSha, commit_title: `${ctx.pr.title} (#${number})`,
      commit_message: texts.commitMessage,
    }, botOpts());
    console.log(`#${number}: squash-merged`);
    const fixed = issueClosedByMerge(ctx.pr.title);
    if (fixed) {
      try {
        await api('POST', repoPath(`/issues/${fixed}/comments`), { body: `Fixed by #${number}, merged by CI. Closing automatically (v2.8), which also lifts an S0 merge freeze this issue held. Reopen with evidence if the problem is still there.` });
        await api('PATCH', repoPath(`/issues/${fixed}`), { state: 'closed', state_reason: 'completed' });
        console.log(`#${number}: closed issue #${fixed}`);
      } catch (e) { console.log(`::warning::#${number}: could not close issue #${fixed}: ${e.message.slice(0, 200)}`); }
    }
    await upsertFeedback({ pr: number, gate: 'merge', text: renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: true, note: texts.note }), createIfMissing: false });
    return res;
  } catch (e) {
    const kind = classifyMergeError(e);
    const why = kind === 'blocked' ? `the ruleset refused the merge (${e.message.slice(0, 200)}); CI does not bypass it` : kind === 'retry' ? `GitHub said the base moved or the PR is not mergeable yet (${e.message.slice(0, 200)}); the next check completion or approval comment retries` : `merge failed: ${e.message.slice(0, 200)}`;
    await upsertFeedback({ pr: number, gate: 'merge', text: renderFeedback({ gate: 'merge', sha: ctx.pr.headSha, ok: false, items: [why] }) });
    console.log(`::warning::#${number}: ${why}`);
    return { ...res, merge: false };
  }
}

/** Pure (v2.8): the issue a merged `bug #<n> …` or `incident #<n> …` PR resolves, else null. #1149's fix (#1158) merged
 *  at 23:14 IST but the issue stayed open, so its S0 label froze every other merge for 8 hours overnight. */
export function issueClosedByMerge(title) {
  const c = classifyTitle(title);
  return c.kind === 'bug' || c.kind === 'incident' ? c.number : null;
}

/** Pure: PR numbers, oldest first, from an issues listing that was filtered by label (issues without pull_request are skipped). */
export const waitingPrNumbers = (issues) => (issues || []).filter((i) => i.pull_request).map((i) => i.number).sort((a, b) => a - b);

async function prNumbers() {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  if (process.env.PR_NUMBER) return [Number(process.env.PR_NUMBER)];
  // ci.yml main-green (v1.7): an S0 freeze that ends re-evaluates nothing by itself, so look at every PR that is waiting.
  if (process.env.ALL_OPEN === '1') return waitingPrNumbers(await paginate(repoPath('/issues?state=open&labels=needs-review')));
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
    lines.push(`- #${n}: ${r.merge ? 'merged' : 'not merged'}${r.needsReview ? ' · needs-review' : ''}${r.reasons.length ? ' — ' + r.reasons.join('; ') : ''}`);
  }
  if (!numbers.length) lines.push('- no pull request for this event');
  appendSummary(lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
