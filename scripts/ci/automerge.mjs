// Land a CI-opened PR (revert / calibration) WITHOUT bypassing the ruleset.
//
// With CI_BOT_TOKEN (fine-grained, this repo only: contents, pull requests, workflows) CI opens the PR and
// merges it as that identity. Events caused by that token start the normal workflows, so the PR gets its REAL
// `fast-gate` and `scope` checks and the merge is a normal squash merge that the ruleset itself accepts.
// CI_BOT_TOKEN is used only here and in revert.mjs/calibrate.mjs, and only from main-side workflows
// (push, schedule, dispatch), never from a pull_request job (scripts/ci/lint.mjs enforces this).
//
// Without the token (fallback) the PR is opened with GITHUB_TOKEN: its pull_request events never fire, so the
// checks are attached by workflow_dispatch. GitHub's ruleset does not count those, so this path only works on
// an unprotected base branch; on a protected one it stops at once with a "blocked by ruleset" result.
import { api, repoPath, GhError } from './gh.mjs';

const REQUIRED = ['fast-gate', 'scope'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const botToken = () => process.env.CI_BOT_TOKEN || '';
export const botOpts = () => (botToken() ? { token: botToken() } : {});

export async function dispatchChecks(number, branch, base) {
  for (const wf of ['pr-gate.yml', 'scope.yml']) {
    await api('POST', repoPath(`/actions/workflows/${wf}/dispatches`), { ref: branch, inputs: { pr: String(number), base } });
    console.log(`dispatched ${wf} on ${branch}`);
  }
}

export async function requiredStates(sha) {
  const runs = (await api('GET', repoPath(`/commits/${sha}/check-runs?per_page=100`))).check_runs;
  const out = {};
  for (const name of REQUIRED) {
    const mine = runs.filter((r) => r.name === name).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    out[name] = mine[0] ? (mine[0].status === 'completed' ? mine[0].conclusion : 'pending') : 'missing';
  }
  return out;
}

/** 'blocked' = a ruleset or branch rule refuses the merge (never retried for long, never bypassed); 'retry' = transient. */
export function classifyMergeError(e) {
  if (!(e instanceof GhError)) return 'fatal';
  const text = JSON.stringify(e.body || e.message || '');
  if (e.status === 405 || e.status === 403 || e.status === 422) {
    if (/Repository rule violations|protected branch|required status check|Changes must be made through a pull request/i.test(text)) return 'blocked';
  }
  if (e.status === 405 || e.status === 409) return 'retry'; // e.g. "Base branch was modified"
  return 'fatal';
}

/** Start the full suite after a merge made with GITHUB_TOKEN (those merges do not trigger push workflows). */
export async function startFullSuite(branch, { pages = false } = {}) {
  const flows = ['ci.yml', ...(pages && branch === (process.env.DEFAULT_BRANCH || 'main') ? ['pages.yml'] : [])];
  for (const wf of flows) {
    try { await api('POST', repoPath(`/actions/workflows/${wf}/dispatches`), { ref: branch }); console.log(`dispatched ${wf} on ${branch}`); }
    catch (e) { console.log(`could not dispatch ${wf}: ${e.message}`); }
  }
}

/**
 * Wait for the PR's real `fast-gate` and `scope`, then squash-merge.
 * Returns { result: 'merged'|'checks-failed'|'blocked-by-ruleset'|'timeout', message?, states }.
 */
export async function landPr({ number, branch, base, waitMs = 25 * 60e3, pages = false }) {
  const bot = botToken();
  if (!bot) await dispatchChecks(number, branch, base);
  const started = Date.now();
  let states = {};
  let blockedTries = 0;
  while (Date.now() - started < waitMs) {
    await sleep(20e3);
    const pr = await api('GET', repoPath(`/pulls/${number}`));
    if (pr.merged) return { result: 'merged', via: 'merged elsewhere', states };
    states = await requiredStates(pr.head.sha);
    console.log(`checks: ${JSON.stringify(states)}`);
    if (REQUIRED.some((n) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(states[n]))) return { result: 'checks-failed', states };
    if (!REQUIRED.every((n) => states[n] === 'success')) continue;
    try {
      await api('PUT', repoPath(`/pulls/${number}/merge`), { merge_method: 'squash', sha: pr.head.sha }, botOpts());
      if (!bot) await startFullSuite(base, { pages });
      return { result: 'merged', via: bot ? 'CI_BOT_TOKEN squash merge' : 'GITHUB_TOKEN squash merge', states };
    } catch (e) {
      const kind = classifyMergeError(e);
      if (kind === 'blocked') {
        // Both required checks are green, so a refusal now is the ruleset itself (not propagation lag after
        // the first try or two). Stop at once and say so; never try to get around it.
        if (++blockedTries >= 2) return { result: 'blocked-by-ruleset', message: String(e.message).slice(0, 400), states };
      } else if (kind === 'fatal') throw e;
      console.log(`merge refused (${kind}): ${String(e.message).slice(0, 200)}`);
    }
  }
  return { result: 'timeout', states };
}

/** The PR comment that explains a landing outcome (shared by revert and calibration). */
export function landingComment(res, branchNote = '') {
  const checks = `Required checks: ${JSON.stringify(res.states || {})}.`;
  if (res.result === 'merged') return `Landing result: **merged** (${res.via}). ${checks}${branchNote}`;
  if (res.result === 'blocked-by-ruleset') {
    return `Landing result: **blocked by ruleset**. CI will not bypass it. ${checks}\n\nGitHub said: ${res.message}\n\nA human must merge this PR, or fix the ruleset / the \`CI_BOT_TOKEN\` secret (needs contents, pull requests and workflows on this repo).`;
  }
  if (res.result === 'checks-failed') return `Landing result: **a required check failed**. ${checks} Not merging; a human or the next run must look at it.`;
  return `Landing result: **${res.result}**. ${checks}`;
}
