// Sweep throttle (v1.5). The sweep also runs on events (comments, pushes to main, finished PR gates), but every
// run spends Actions-token API calls shared with scope, merges and labels (about 1,000 per hour per repository).
// An event-triggered run is skipped when another run REALLY swept (its `sweep` step ran) inside the window.
// Throttled runs never count, so frequent events cannot starve the sweep. Schedule and manual runs always run.
import { appendFileSync } from 'node:fs';
import { api, repoPath, appendSummary } from './gh.mjs';

export const WINDOW_MIN = { push: 3, issue_comment: 10, workflow_run: 10 };
export const SWEEP_STEP = 'sweep';

/** Pure: did this run's job really sweep? jobs = /actions/runs/{id}/jobs .jobs. A step that is still running counts. */
export function didSweep(jobs = []) {
  const step = jobs.flatMap((j) => j.steps || []).find((s) => s.name === SWEEP_STEP);
  if (!step) return jobs.some((j) => j.status !== 'completed'); // job not started yet: assume it will sweep
  return step.status !== 'completed' || ['success', 'failure'].includes(step.conclusion);
}

/** Pure: skip this run? runs = [{id, created_at, swept}] (swept from didSweep). */
export function shouldSkip({ event, runs = [], now, selfId }) {
  const win = WINDOW_MIN[event];
  if (!win) return false;
  return runs.some((r) => r.id !== selfId && r.swept && now - new Date(r.created_at).getTime() < win * 60e3);
}

async function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  const selfId = Number(process.env.GITHUB_RUN_ID);
  const now = Date.now();
  let skip = false;
  try {
    const win = WINDOW_MIN[event];
    if (win) {
      const runs = ((await api('GET', repoPath('/actions/workflows/sweep.yml/runs?per_page=10'))).workflow_runs || [])
        .filter((r) => r.id !== selfId && now - new Date(r.created_at).getTime() < win * 60e3).slice(0, 4);
      for (const r of runs) r.swept = didSweep((await api('GET', repoPath(`/actions/runs/${r.id}/jobs`))).jobs);
      skip = shouldSkip({ event, runs, now, selfId });
    }
  } catch (e) { console.log(`throttle check failed (${e.message}); sweeping anyway`); }
  console.log(`event=${event} skip=${skip}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\n`);
  appendSummary(`sweep throttle: event \`${event}\`: ${skip ? 'skipped (another sweep ran recently)' : 'sweeping'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
