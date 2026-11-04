// Deploy incident (workflow `deploy-incident`). A failed `Supabase` deploy run on main opens or updates ONE S0
// incident; the next deploy run on main that really deployed (MCP verified) closes it.
//   - The incident carries `<!-- deploy-incident -->`. ci.yml's `main-green` closes only `<!-- main-incident -->`,
//     so a green full suite never closes a deploy incident, and a deploy never closes a red-main incident.
//   - Only the newest finished run counts: a late event for an older run is ignored, so a slow failure can
//     not reopen what a newer success closed.
//   - A "successful" run whose deploy steps were skipped (no credentials) closes nothing.
// Env: RUN_ID (optional: default = newest finished Supabase run on main), DRY_RUN=1 (read-only, prints writes),
//      GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA.
import { readFileSync } from 'node:fs';

export const MARKER = '<!-- deploy-incident -->';
export const WORKFLOW_FILE = 'supabase.yml';
export const VERIFY_STEP = 'Verify deployed MCP endpoint';
const FAIL = new Set(['failure', 'timed_out']);
const MAX_RUN_LINES = 10;

/** Decide what one finished run means. jobs = the `jobs` array of GET /actions/runs/{id}/jobs. */
export function classifyRun(run, jobs = []) {
  if (FAIL.has(run.conclusion)) {
    let step = null;
    for (const j of jobs) {
      const s = (j.steps || []).find((x) => FAIL.has(x.conclusion));
      if (s) { step = s.name; break; }
    }
    const what = step ? `${step} failed` : `run ${run.conclusion}`;
    return { kind: 'fail', signature: `deploy/supabase:: ${what}`, step };
  }
  if (run.conclusion === 'success') {
    const verified = jobs.some((j) => (j.steps || []).some((s) => s.name === VERIFY_STEP && s.conclusion === 'success'));
    return verified ? { kind: 'deployed' } : { kind: 'ignore', why: 'run succeeded but the deploy and MCP verification steps did not run' };
  }
  return { kind: 'ignore', why: `conclusion is ${run.conclusion ?? run.status}` };
}

const runLine = (r, url) => `- [run ${r.id}](${url}) — ${String(r.head_sha).slice(0, 7)} — ${r.updated_at || r.created_at}`;

export function incidentBody({ signature, run, url, previous = [] }) {
  const lines = [runLine(run, url), ...previous.filter((l) => !l.includes(`run ${run.id}]`))].slice(0, MAX_RUN_LINES);
  return `${MARKER}\n**Signature:** \`${signature}\`\n\nThe \`Supabase\` deploy workflow failed on main, so main is not deployed (AGENTS.md: S0, "deploy broken").\n\n**Failing runs (newest first)**\n${lines.join('\n')}\n\nMaintained by CI. It closes when a later \`Supabase\` run on main deploys and passes the MCP verification step.\n`;
}

/** Read the "Failing runs" lines back out of an existing incident body. */
export function previousRunLines(body) {
  return String(body || '').split('\n').filter((l) => /^- \[run \d+\]/.test(l));
}

/**
 * gh = { get(path), list(path), post(path, body), patch(path, body) }; repo paths already prefixed by the caller's
 * `p(suffix)`. Returns a small result object (also used by tests).
 */
export async function sync({ gh, p, runId, branch = 'main', dryRun = false, log = console.log, repoUrl = '', labels = [] }) {
  const write = async (method, path, body) => {
    if (dryRun) { log(`[dry-run] ${method} ${path} ${JSON.stringify(body).slice(0, 200)}`); return { number: 0 }; }
    return gh[method](path, body);
  };
  const url = (id) => `${repoUrl}/actions/runs/${id}`;

  // The newest finished run decides the state of the deploy.
  const listed = await gh.get(p(`/actions/workflows/${WORKFLOW_FILE}/runs?branch=${branch}&status=completed&per_page=20`));
  const finished = (listed.workflow_runs || [])
    .filter((r) => r.head_branch === branch && (r.conclusion === 'success' || FAIL.has(r.conclusion)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id);
  const newest = finished[0];
  if (!newest) { log('no finished Supabase run on ' + branch); return { action: 'none' }; }
  if (runId && Number(runId) !== newest.id) {
    const mine = await gh.get(p(`/actions/runs/${runId}`));
    if (mine.head_branch !== branch) { log(`run ${runId} is on ${mine.head_branch}, not ${branch}: ignored`); return { action: 'ignored-branch' }; }
    log(`run ${runId} is not the newest finished deploy run (${newest.id}): ignored`);
    return { action: 'ignored-stale' };
  }

  const jobs = (await gh.get(p(`/actions/runs/${newest.id}/jobs?per_page=100`))).jobs || [];
  const verdict = classifyRun(newest, jobs);
  const open = (await gh.list(p('/issues?labels=incident&state=open'))).filter((i) => !i.pull_request && (i.body || '').includes(MARKER));

  if (verdict.kind === 'ignore') { log(`run ${newest.id}: ${verdict.why}`); return { action: 'none', why: verdict.why }; }

  if (verdict.kind === 'deployed') {
    for (const i of open) {
      await write('post', p(`/issues/${i.number}/comments`), { body: `The Supabase deploy succeeded on ${branch} at ${String(newest.head_sha).slice(0, 7)} (${url(newest.id)}), including MCP verification. Closing automatically.` });
      await write('patch', p(`/issues/${i.number}`), { state: 'closed', state_reason: 'completed' });
      log(`closed deploy incident #${i.number}`);
    }
    return { action: open.length ? 'closed' : 'none', closed: open.map((i) => i.number) };
  }

  // fail: one incident at a time. Update it when it exists, otherwise open it.
  const title = `incident: ${verdict.signature}`;
  const found = open[0];
  if (found) {
    const body = incidentBody({ signature: verdict.signature, run: newest, url: url(newest.id), previous: previousRunLines(found.body) });
    if (body !== found.body || title !== found.title) await write('patch', p(`/issues/${found.number}`), { title, body });
    const have = new Set((found.labels || []).map((l) => (typeof l === 'string' ? l : l.name)));
    const need = ['incident', 'S0'].filter((l) => !have.has(l));
    if (need.length) await write('post', p(`/issues/${found.number}/labels`), { labels: need });
    log(`updated deploy incident #${found.number}`);
    return { action: 'updated', number: found.number, signature: verdict.signature };
  }
  const created = await write('post', p('/issues'), { title, body: incidentBody({ signature: verdict.signature, run: newest, url: url(newest.id) }), labels: ['incident', 'S0'] });
  log(`opened deploy incident #${created.number}`);
  return { action: 'opened', number: created.number, signature: verdict.signature };
}

async function main() {
  const { api, paginate, repoPath, ensureLabels, GhError } = await import('./gh.mjs');
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  if (!dryRun) await ensureLabels(JSON.parse(readFileSync('ci/labels.json', 'utf8')));
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const gh = {
    get: (path) => api('GET', path),
    list: (path) => paginate(path),
    post: (path, body) => api('POST', path, body),
    patch: (path, body) => api('PATCH', path, body),
  };
  try {
    await sync({ gh, p: repoPath, runId: process.env.RUN_ID || '', dryRun, repoUrl: `${server}/${process.env.GITHUB_REPOSITORY}` });
  } catch (e) {
    console.error(e instanceof GhError ? e.message : e);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
