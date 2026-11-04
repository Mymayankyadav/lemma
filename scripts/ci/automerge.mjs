// Land a CI-opened PR (revert / calibration): attach the required checks by workflow_dispatch under the
// exact names `fast-gate` and `scope`, enable GitHub auto-merge, and if GitHub has not merged it once both
// checks are green, merge it ourselves (squash). Used by revert.mjs and calibrate.mjs.
import { api, graphql, paginate, repoPath, GhError } from './gh.mjs';

const REQUIRED = ['fast-gate', 'scope'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function dispatchChecks(number, branch, base) {
  for (const wf of ['pr-gate.yml', 'scope.yml']) {
    await api('POST', repoPath(`/actions/workflows/${wf}/dispatches`), { ref: branch, inputs: { pr: String(number), base } });
    console.log(`dispatched ${wf} on ${branch}`);
  }
}

async function enableAutoMerge(nodeId) {
  try {
    await graphql('mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{autoMergeRequest{enabledAt}}}}', { id: nodeId });
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e.message).slice(0, 300) }; }
}

async function requiredStates(sha) {
  const runs = (await api('GET', repoPath(`/commits/${sha}/check-runs?per_page=100`))).check_runs;
  const out = {};
  for (const name of REQUIRED) {
    const mine = runs.filter((r) => r.name === name).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    out[name] = mine[0] ? (mine[0].status === 'completed' ? mine[0].conclusion : 'pending') : 'missing';
  }
  return out;
}

/** Returns { result: 'merged'|'checks-failed'|'timeout', via: 'auto-merge'|'direct-merge'|null, autoMerge, states } */
export async function landPr({ number, branch, base, waitMs = 25 * 60e3, dispatch = true }) {
  let pr = await api('GET', repoPath(`/pulls/${number}`));
  if (dispatch) await dispatchChecks(number, branch, base);
  const auto = await enableAutoMerge(pr.node_id);
  console.log(auto.ok ? 'auto-merge enabled' : `auto-merge not enabled: ${auto.why}`);
  const started = Date.now();
  let greenAt = 0;
  let states = {};
  while (Date.now() - started < waitMs) {
    await sleep(20e3);
    pr = await api('GET', repoPath(`/pulls/${number}`));
    if (pr.merged) return { result: 'merged', via: 'auto-merge', autoMerge: auto, states };
    states = await requiredStates(pr.head.sha);
    console.log(`checks: ${JSON.stringify(states)}`);
    if (REQUIRED.some((n) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(states[n]))) return { result: 'checks-failed', via: null, autoMerge: auto, states };
    if (REQUIRED.every((n) => states[n] === 'success')) {
      greenAt ||= Date.now();
      // give GitHub's own auto-merge two minutes before merging directly
      if (!auto.ok || Date.now() - greenAt > 120e3) {
        try {
          await api('PUT', repoPath(`/pulls/${number}/merge`), { merge_method: 'squash', sha: pr.head.sha });
          return { result: 'merged', via: 'direct-merge', autoMerge: auto, states };
        } catch (e) {
          if (e instanceof GhError && e.status === 405) { console.log(`merge not allowed yet: ${e.message}`); continue; }
          throw e;
        }
      }
    }
  }
  return { result: 'timeout', via: null, autoMerge: auto, states };
}

export { paginate };
