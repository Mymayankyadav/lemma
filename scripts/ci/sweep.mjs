// Scheduled sweep (every 30 minutes, sweep.yml):
//  1. `escalate` label: an open PR/issue with >=3 `No progress:` comments from >=2 distinct `Agent:` names
//  2. S1 incident open > 2 h with no fix PR (`incident #<n>` PR) gets S0 added
//  3. `lease-expired` label: open PR whose lease passed and that has no commits for 3 hours (removed again when renewed)
import { api, paginate, repoPath, ensureLabels, addLabels, parseLine1, GhError } from './gh.mjs';
import { readJson } from './lib.mjs';

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
  // 3. lease-expired
  for (const i of prs) {
    const line1 = parseLine1(i.body);
    if (!line1) continue;
    const pr = await api('GET', repoPath(`/pulls/${i.number}`));
    const commit = await api('GET', repoPath(`/commits/${pr.head.sha}`));
    const lastCommit = new Date(commit.commit.committer.date).getTime();
    const expired = line1.lease.getTime() < now && now - lastCommit >= 3 * HOUR;
    const has = labelsOf(i).has('lease-expired');
    if (expired && !has) { await addLabels(i.number, ['lease-expired']); console.log(`lease-expired #${i.number}`); }
    if (!expired && has) { try { await api('DELETE', repoPath(`/issues/${i.number}/labels/lease-expired`)); } catch (e) { if (!(e instanceof GhError && e.status === 404)) throw e; } }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
