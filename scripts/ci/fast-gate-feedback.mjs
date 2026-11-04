// Last job of PR gate: writes the exact failing jobs/tests and how to fix them into one PR comment (edited in place)
// and into the output summary of the `fast-gate` check run; when fast-gate passes again the comment says so.
import { existsSync, readFileSync } from 'node:fs';
import { api, repoPath } from './gh.mjs';
import { renderFeedback, upsertFeedback, setCheckOutput, fastGateItems } from './feedback.mjs';

const pr = Number(process.env.PR_NUMBER);
const runId = process.env.GITHUB_RUN_ID;
const result = process.env.FAST_GATE_RESULT;
const sha = process.env.HEAD_SHA || process.env.GITHUB_SHA;
if (!pr || !runId) { console.log('no PR number or run id: nothing to write'); process.exit(0); }

const ok = result === 'success';
let items = [];
if (!ok) {
  const jobs = (await api('GET', repoPath(`/actions/runs/${runId}/jobs?per_page=100`))).jobs;
  const signatures = existsSync('signatures.json') ? JSON.parse(readFileSync('signatures.json', 'utf8')).map((s) => s.sig) : [];
  items = fastGateItems({ jobs, signatures });
}
const text = renderFeedback({ gate: 'fast-gate', sha, ok, items });
console.log(await upsertFeedback({ pr, gate: 'fast-gate', text, createIfMissing: !ok }));
if (!ok) for (const i of items) console.log(`::error title=fast-gate::${i.replace(/\n/g, ' ')}`);
console.log(await setCheckOutput({ runId, jobName: 'fast-gate', title: ok ? 'fast-gate passed' : 'fast-gate failed', text }));
