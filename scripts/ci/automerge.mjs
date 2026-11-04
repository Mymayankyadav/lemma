// Land a CI-opened PR (revert / calibration).
//  1. attach the required checks by workflow_dispatch under the exact names `fast-gate` and `scope`
//  2. wait until both succeed, then MERGE DIRECTLY (squash). This is the primary path: it needs no branch
//     protection and no repo setting. GitHub auto-merge is optional (CI_AUTO_MERGE=1) and is only a bonus.
//  3. a merge made with GITHUB_TOKEN does not start push workflows, so start the full suite ourselves
//     (ci.yml; plus pages.yml when `pages` is true and the base is the default branch).
import { api, graphql, repoPath, GhError } from './gh.mjs';

const REQUIRED = ['fast-gate', 'scope'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function dispatchChecks(number, branch, base) {
  for (const wf of ['pr-gate.yml', 'scope.yml']) {
    await api('POST', repoPath(`/actions/workflows/${wf}/dispatches`), { ref: branch, inputs: { pr: String(number), base } });
    console.log(`dispatched ${wf} on ${branch}`);
  }
}

async function enableAutoMerge(nodeId) {
  if (process.env.CI_AUTO_MERGE !== '1') return { ok: false, why: 'not requested (direct merge is the primary path)' };
  try {
    await graphql('mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{autoMergeRequest{enabledAt}}}}', { id: nodeId });
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e.message).slice(0, 300) }; }
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

/** Start the full suite for `branch` after a CI-made merge (token merges do not trigger push workflows). */
export async function startFullSuite(branch, { pages = false } = {}) {
  const flows = ['ci.yml', ...(pages && branch === (process.env.DEFAULT_BRANCH || 'main') ? ['pages.yml'] : [])];
  for (const wf of flows) {
    try { await api('POST', repoPath(`/actions/workflows/${wf}/dispatches`), { ref: branch }); console.log(`dispatched ${wf} on ${branch}`); }
    catch (e) { console.log(`could not dispatch ${wf}: ${e.message}`); }
  }
}

/** Returns { result: 'merged'|'checks-failed'|'timeout', via: 'direct-merge'|'auto-merge'|null, autoMerge, states } */
export async function landPr({ number, branch, base, waitMs = 25 * 60e3, dispatch = true, pages = false }) {
  let pr = await api('GET', repoPath(`/pulls/${number}`));
  if (dispatch) await dispatchChecks(number, branch, base);
  const auto = await enableAutoMerge(pr.node_id);
  console.log(auto.ok ? 'auto-merge enabled (optional)' : `auto-merge not used: ${auto.why}`);
  const started = Date.now();
  let states = {};
  while (Date.now() - started < waitMs) {
    await sleep(20e3);
    pr = await api('GET', repoPath(`/pulls/${number}`));
    if (pr.merged) { await startFullSuite(base, { pages }); return { result: 'merged', via: 'auto-merge', autoMerge: auto, states }; }
    states = await requiredStates(pr.head.sha);
    console.log(`checks: ${JSON.stringify(states)}`);
    if (REQUIRED.some((n) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(states[n]))) return { result: 'checks-failed', via: null, autoMerge: auto, states };
    if (REQUIRED.every((n) => states[n] === 'success')) {
      try {
        await api('PUT', repoPath(`/pulls/${number}/merge`), { merge_method: 'squash', sha: pr.head.sha });
        await startFullSuite(base, { pages });
        return { result: 'merged', via: 'direct-merge', autoMerge: auto, states };
      } catch (e) {
        if (e instanceof GhError && (e.status === 405 || e.status === 409)) { console.log(`merge not allowed yet: ${e.message}`); continue; }
        throw e;
      }
    }
  }
  return { result: 'timeout', via: null, autoMerge: auto, states };
}
