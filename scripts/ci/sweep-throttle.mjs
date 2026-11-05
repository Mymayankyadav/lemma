// Sweep throttle (v1.5). The sweep also runs on events (comments, pushes to main, finished PR gates), but every
// run spends Actions-token API calls shared with scope, merges and labels (about 1,000 per hour per repository).
// Event-triggered runs are therefore skipped when another sweep swept recently. Schedule and manual runs always run.
import { appendFileSync } from 'node:fs';
import { api, repoPath, appendSummary } from './gh.mjs';

export const WINDOW_MIN = { push: 3, issue_comment: 10, workflow_run: 10 };
const THROTTLED_MAX_S = 25; // a throttled run (check only, sweep step skipped) finishes well within this

/** Pure: the runs that really swept: still running, or completed after longer than a throttled run takes. */
export const sweptRuns = (runs = []) => runs.filter((r) => r.status !== 'completed'
  || (new Date(r.updated_at) - new Date(r.run_started_at || r.created_at)) / 1000 > THROTTLED_MAX_S);

/** Pure: skip this run? runs = recent runs of sweep.yml [{id, status, created_at, run_started_at, updated_at}]. */
export function shouldSkip({ event, runs = [], now, selfId }) {
  const win = WINDOW_MIN[event];
  if (!win) return false;
  return sweptRuns(runs).some((r) => r.id !== selfId && now - new Date(r.created_at).getTime() < win * 60e3);
}

async function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  let skip = false;
  try {
    const runs = (await api('GET', repoPath('/actions/workflows/sweep.yml/runs?per_page=15'))).workflow_runs || [];
    skip = shouldSkip({ event, runs, now: Date.now(), selfId: Number(process.env.GITHUB_RUN_ID) });
  } catch (e) { console.log(`throttle check failed (${e.message}); sweeping anyway`); }
  console.log(`event=${event} skip=${skip}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\n`);
  appendSummary(`sweep throttle: event \`${event}\`: ${skip ? 'skipped (another sweep ran recently)' : 'sweeping'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
