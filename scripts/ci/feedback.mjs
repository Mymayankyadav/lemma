// Gate feedback for agents, who cannot read CI logs: when `scope` or `fast-gate` fails, the exact failing rule or
// check and how to comply go into ONE PR comment per gate (edited in place on later runs) and into the output
// summary of the gate's check run. When the gate passes again the same comment is edited to say so.
import { api, paginate, repoPath } from './gh.mjs';

export const marker = (gate) => `<!-- ci-feedback:${gate} -->`;
const short = (sha) => String(sha || '').slice(0, 7);

/** Pure: the comment / check-summary text. items = lines such as "[RULE] what To comply: how". */
export function renderFeedback({ gate, sha, ok, items = [], note = '' }) {
  const head = ok ? `### ${gate}: passes on \`${short(sha)}\`` : `### ${gate}: FAILED on \`${short(sha)}\``;
  const body = ok ? [note || 'Nothing to do.'] : items.map((i) => `- ${i}`);
  const foot = gate === 'merge'
    ? '_CI edits this comment in place each time it re-evaluates the merge. No reply is needed._'
    : `_CI edits this comment in place when the check runs again, and the same text is in the output summary of the \`${gate}\` check. No reply is needed._`;
  return [marker(gate), head, '', ...body, '', foot].join('\n');
}

/** Pure: one text for the check-run summary (no marker). */
export const summaryOf = (text) => text.replace(/^<!--.*-->\n/, '');

const HINTS = [
  [/^typecheck-lint$/, 'run `npx tsc -b` and `node scripts/ci/lint.mjs` locally and fix the reported errors.'],
  [/^unit-affected$/, 'run `npx vitest run <the failing test file>` locally; fix the code (never skip, delete or loosen the test).'],
  [/^smoke-e2e$|^e2e-affected/, 'run `npx playwright test <the failing spec>` locally; fix the code (never skip, delete or loosen the test).'],
  [/^sql$/, 'run the failing `node tests/mcp/<file>.mjs` locally and fix the migration or test setup.'],
  [/^changes$/, 'the affected-test selection crashed: run `node scripts/ci/affected.mjs --base origin/main --head HEAD` locally.'],
];
export const hintFor = (job) => HINTS.find(([re]) => re.test(job))?.[1] || 'open the job and fix the first error.';

/** Pure: items for a failed fast-gate from the run's jobs ([{name, conclusion, steps:[{name,conclusion}]}]) and failure signatures. */
export function fastGateItems({ jobs = [], signatures = [] }) {
  const items = [];
  for (const j of jobs) {
    if (['fast-gate', 'report', 'feedback'].includes(j.name)) continue;
    if (!['failure', 'cancelled', 'timed_out'].includes(j.conclusion)) continue;
    const step = (j.steps || []).find((s) => s.conclusion === 'failure');
    items.push(`\`${j.name}\` ${j.conclusion === 'failure' ? 'failed' : j.conclusion}${step ? ` at step "${step.name}"` : ''}. To comply: ${hintFor(j.name)}`);
  }
  const sigs = [...new Set(signatures)].slice(0, 10);
  if (sigs.length) items.push(`Failing tests (signature = kind/file::test :: first error line): ${sigs.map((s) => `\`${s}\``).join('; ')}${signatures.length > 10 ? ' …' : ''}`);
  if (!items.length) items.push('`fast-gate` failed but no job reports a failure: re-push, or ask the Owner if it repeats.');
  return items;
}

export async function findFeedback(pr, gate) {
  const comments = await paginate(repoPath(`/issues/${pr}/comments`));
  return comments.find((c) => (c.body || '').startsWith(marker(gate)));
}

/** Create or edit the gate's comment. createIfMissing=false edits an existing one only (used for "passes again"). */
export async function upsertFeedback({ pr, gate, text, createIfMissing = true }) {
  const existing = await findFeedback(pr, gate);
  if (existing) {
    if (existing.body !== text) await api('PATCH', repoPath(`/issues/comments/${existing.id}`), { body: text });
    return 'edited';
  }
  if (!createIfMissing) return 'none';
  await api('POST', repoPath(`/issues/${pr}/comments`), { body: text });
  return 'created';
}

/** Write the text into the output summary of this run's job check run (job id = check run id). Non-fatal. */
export async function setCheckOutput({ runId, jobName, title, text }) {
  try {
    const jobs = (await api('GET', repoPath(`/actions/runs/${runId}/jobs?per_page=100`))).jobs;
    const job = jobs.find((j) => j.name === jobName);
    if (!job) return 'job-not-found';
    await api('PATCH', repoPath(`/check-runs/${job.id}`), { output: { title, summary: summaryOf(text).slice(0, 60000) } });
    return 'updated';
  } catch (e) {
    console.log(`could not write the check-run output (${e.message}); the PR comment and ::error annotations still carry the text`);
    return 'failed';
  }
}
