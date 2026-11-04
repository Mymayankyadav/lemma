// Scheduled sweep (every 30 minutes, sweep.yml):
//  1. `escalate` label: an open PR/issue with >=3 `No progress:` comments from >=2 distinct `Agent:` names
//  2. S1 incident open > 2 h with no fix PR (`incident #<n>` PR) gets S0 added
//  3. `lease-expired` label: open PR with no commit and no comment from its own Agent for 3 hours (removed again on activity)
//  4. `needs-review` label (visual aid only; reviewing needs no label): open non-CI PR whose fast-gate and scope passed
//     on the current head and that is not labelled changes-requested
import { api, paginate, repoPath, ensureLabels, addLabels, parseLine1, GhError } from './gh.mjs';
import { readJson, commentAgent } from './lib.mjs';

const NO_PROGRESS = /^No progress:\s*(?:·\s*)?Agent:\s*([^·\n]+?)\s*(?:·|$)/;
const HOUR = 3600e3;

/** Names and total of `No progress:` comments (pure). */
export function noProgressStats(comments) {
  const names = new Set();
  let total = 0;
  for (const c of comments) {
    const m = NO_PROGRESS.exec((c.body || '').trim());
    if (m) { total++; names.add(m[1].trim().toLowerCase()); }
  }
  return { total, distinct: names.size };
}
export const shouldEscalate = ({ total, distinct }) => total >= 3 && distinct >= 2;

/** Pure: ms timestamp of the PR Agent's last activity = latest commit on the PR, or latest comment signed by that Agent. */
export function lastAgentActivity({ agent, commitDates = [], comments = [], createdAt }) {
  const times = [new Date(createdAt).getTime(), ...commitDates.map((d) => new Date(d).getTime())];
  for (const c of comments) if (commentAgent(c.body)?.toLowerCase() === String(agent).toLowerCase()) times.push(new Date(c.created_at).getTime());
  return Math.max(...times.filter((t) => !Number.isNaN(t)));
}
export const isLeaseExpired = ({ lastActivity, now }) => now - lastActivity >= 3 * HOUR;
/** Pure: should an open PR carry needs-review? checks = { 'fast-gate': 'success'|..., scope: ... } */
export const wantsNeedsReview = ({ labels, checks, draft, isCi }) =>
  !draft && !isCi && checks['fast-gate'] === 'success' && checks.scope === 'success' && !labels.has('changes-requested');

async function main() {
  const now = Date.now();
  await ensureLabels(readJson('ci/labels.json'));
  const open = (await paginate(repoPath('/issues?state=open'))).filter((i) => !i.labels.some((l) => l.name === 'ci-registry'));
  const labelsOf = (i) => new Set(i.labels.map((l) => l.name));

  // 1. escalate
  for (const i of open.filter((x) => x.comments >= 3 && !labelsOf(x).has('escalate'))) {
    const stats = noProgressStats(await paginate(repoPath(`/issues/${i.number}/comments`)));
    if (shouldEscalate(stats)) { await addLabels(i.number, ['escalate']); console.log(`escalate #${i.number} ${JSON.stringify(stats)}`); }
  }
  // 2. S1 -> S0
  const prs = open.filter((i) => i.pull_request);
  for (const i of open.filter((x) => !x.pull_request && labelsOf(x).has('incident') && labelsOf(x).has('S1') && !labelsOf(x).has('S0'))) {
    if (now - new Date(i.created_at).getTime() < 2 * HOUR) continue;
    const fix = prs.some((p) => new RegExp(`^incident #${i.number}\\b`).test(p.title));
    if (fix) continue;
    await addLabels(i.number, ['S0']);
    await api('POST', repoPath(`/issues/${i.number}/comments`), { body: 'S1 incident open for more than 2 hours with no fix PR: escalated to S0.' });
    console.log(`S0 #${i.number}`);
  }
  // 3 + 4. lease-expired and needs-review
  for (const i of prs) {
    const line1 = parseLine1(i.body);
    const labels = labelsOf(i);
    const pr = await api('GET', repoPath(`/pulls/${i.number}`));
    const isCi = line1?.agent?.toLowerCase() === 'ci';
    if (line1 && !isCi) {
      const commits = await paginate(repoPath(`/pulls/${i.number}/commits`));
      const comments = await paginate(repoPath(`/issues/${i.number}/comments`));
      const lastActivity = lastAgentActivity({ agent: line1.agent, createdAt: pr.created_at, commitDates: commits.map((c) => c.commit.committer.date), comments });
      const expired = isLeaseExpired({ lastActivity, now });
      if (expired && !labels.has('lease-expired')) { await addLabels(i.number, ['lease-expired']); console.log(`lease-expired #${i.number}`); }
      if (!expired && labels.has('lease-expired')) await dropLabel(i.number, 'lease-expired');
    }
    const runs = (await api('GET', repoPath(`/commits/${pr.head.sha}/check-runs?per_page=100`))).check_runs;
    const checks = {};
    for (const n of ['fast-gate', 'scope']) {
      const mine = runs.filter((r) => r.name === n).sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
      checks[n] = mine ? (mine.status === 'completed' ? mine.conclusion : 'pending') : 'missing';
    }
    const want = wantsNeedsReview({ labels, checks, draft: pr.draft, isCi });
    if (want && !labels.has('needs-review')) { await addLabels(i.number, ['needs-review']); console.log(`needs-review #${i.number}`); }
    if (!want && labels.has('needs-review')) await dropLabel(i.number, 'needs-review');
  }
}

async function dropLabel(number, name) {
  try { await api('DELETE', repoPath(`/issues/${number}/labels/${encodeURIComponent(name)}`)); console.log(`removed ${name} from #${number}`); }
  catch (e) { if (!(e instanceof GhError && e.status === 404)) throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
