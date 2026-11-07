// Scheduled sweep (every 30 minutes, sweep.yml):
//  1. `escalate` label: an open PR/issue with >=3 `No progress:` comments from >=2 distinct `Agent:` names
//  2. S1 incident open > 2 h with no fix PR (`incident #<n>` PR) gets S0 added
//  3. `lease-expired` label: open PR with no commit and no comment from its own Agent for 1 hour (v2.4; removed on
//     activity). A PR whose Agent said Ready after the last push and has no failed required check is waiting, not stalled.
//  4. `needs-review` label: only when the PR's author commented `Ready · Agent: <author>` after the last push and
//     fast-gate and scope pass (the same rule as approve.mjs); removed again after a push or when checks stop passing
//  5. run plans: every agent posts `Plan · Agent: <name>: 1) … 2) …` on its closed `run-log: <base name>` issue and edits
//     in `Result: 1) done|skipped because …`. The sweep records plan-short / no-result and the share of steps done, and
//     writes a per-agent table into the closed issue `agent-metrics` (labelled ci-registry; agents never edit it).
import { api, paginate, repoPath, ensureLabels, addLabels, parseLine1, GhError } from './gh.mjs';
import { readJson, commentAgent, stripFooter, agentKey, baseName, chatParts, validAgentName } from './lib.mjs';
import { parseVerdict, needsReviewWanted, validReady } from './verdicts.mjs';
import { loadSessions, saveSessions, checkSession, touchSession } from './sessions.mjs';
import { checkConflict } from './conflicts.mjs';
import { effectiveHeadDate, verifiedBookkeepingShas } from './bookkeeping.mjs';
import { reviewRequired } from './review-policy.mjs';

const NO_PROGRESS = /^No progress:\s*(?:·\s*)?Agent:\s*([^·\n]+?)\s*(?:·|$)/;
const HOUR = 3600e3;
const RUNLOG_PREFIX = () => process.env.RUNLOG_PREFIX || 'run-log: ';
const METRICS_TITLE = () => process.env.METRICS_TITLE || 'agent-metrics';
const NO_RESULT_MIN = () => Number(process.env.NO_RESULT_MIN) || 90;
const SCHEDULED_AGENTS = ['lemma-1', 'lemma-2', 'lemma-3', 'lemma-4', 'lemma-5'];

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
export const LEASE_HOURS = 1;
export const isLeaseExpired = ({ lastActivity, now, waiting = false }) => !waiting && now - lastActivity >= LEASE_HOURS * HOUR;
/** Pure (v2.4): Ready after the last push and no failed required check = waiting on CI or a review, so not up for takeover. */
export const waitingOnCi = ({ ready, checks, labels = [] }) => Boolean(ready) && ![...labels].some((l) => (l?.name ?? l) === 'changes-requested') && !Object.values(checks || {}).some((c) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c));

// ---- run plans ----
const PLAN = /^Plan\s*·\s*Agent:\s*([^\s·:][^·:\n]*?)\s*:\s*([\s\S]*)$/;
const STEP = /(\d+)\)\s*([\s\S]*?)(?=\s+\d+\)\s|$)/g;
const steps = (text) => [...String(text).matchAll(STEP)].map((m) => m[2].trim()).filter(Boolean);

/** Pure: a `Plan · Agent: <name>: 1) … 2) …` comment with an optional `Result: 1) … 2) …`, or null. */
export function parsePlan(body) {
  const m = PLAN.exec(stripFooter(body));
  if (!m) return null;
  const [planText, resultText] = m[2].split(/\n\s*Result:\s*|\s+Result:\s*/);
  return { agent: m[1].trim(), steps: steps(planText), results: resultText === undefined ? null : steps(resultText), text: planText };
}

/** Pure: intervals during which a PR carried needs-review, from its issue events. */
export function needsReviewIntervals(events, now = Date.now()) {
  const out = [];
  let from = null;
  for (const e of [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    const t = new Date(e.created_at).getTime();
    if (e.event === 'labeled' && e.label?.name === 'needs-review' && from === null) from = t;
    else if ((e.event === 'unlabeled' && e.label?.name === 'needs-review') || e.event === 'closed' || e.event === 'merged') {
      if (from !== null) { out.push({ from, to: t }); from = null; }
    }
  }
  if (from !== null) out.push({ from, to: now + 1 });
  return out;
}

/**
 * Pure: judge one plan. needsReviewPrs = [{ authorKey, intervals }]. Returns { planned, done, planShort, noResult, share }.
 * plan-short: a needs-review PR not authored by the agent existed when the plan was posted and the plan has no review step.
 */
export function analysePlan({ plan, createdAt, now, needsReviewPrs = [], noResultMin = 90 }) {
  const t = new Date(createdAt).getTime();
  const me = agentKey(plan.agent);
  const hasReviewStep = /review/i.test(plan.text);
  const planShort = !hasReviewStep && needsReviewPrs.some((p) => p.authorKey !== me && p.intervals.some((i) => i.from <= t && t < i.to));
  const noResult = plan.results === null && now - t > noResultMin * 60e3;
  const done = plan.results ? plan.results.filter((r) => /^done\b/i.test(r)).length : 0;
  const planned = plan.steps.length;
  return { planned, done, planShort, noResult, share: planned ? done / planned : null };
}

/** Pure: per-agent rows (key = base name) and the markdown table. */
export function buildMetrics({ plans, reviews = [], commits = [], now }) {
  const rows = new Map();
  const invalid = new Map();
  // rows only for valid agent names; activity under other names is summed on one line below the table
  const row = (name) => {
    if (!validAgentName(name)) { invalid.set(baseName(name).toLowerCase(), (invalid.get(baseName(name).toLowerCase()) || 0) + 1); return null; }
    const k = baseName(name).toLowerCase();
    if (!rows.has(k)) rows.set(k, { agent: k, runs: 0, plans: 0, planned: 0, done: 0, planShort: 0, noResult: 0, reviews: 0, commits: 0, runs24: 0, reviews24: 0, commits24: 0 });
    return rows.get(k);
  };
  const day = now - 24 * HOUR;
  for (const p of plans) {
    const r = row(p.agent);
    if (!r) continue;
    r.runs++;
    if (p.at >= day) r.runs24++;
    if (p.planned > 0) r.plans++;
    r.planned += p.planned;
    r.done += p.done;
    if (p.planShort) r.planShort++;
    if (p.noResult) r.noResult++;
  }
  for (const v of reviews) { const r = row(v.agent); if (!r) continue; r.reviews++; if (v.at >= day) r.reviews24++; }
  for (const c of commits) { const r = row(c.agent); if (!r) continue; r.commits++; if (c.at >= day) r.commits24++; }
  const list = [...rows.values()].sort((a, b) => a.agent.localeCompare(b.agent, 'en', { numeric: true }));
  const pct = (r) => (r.planned ? `${Math.round((100 * r.done) / r.planned)}%` : '–');
  const md = ['| Agent | Runs | Plans | Planned steps | Done | Done % | plan-short | no-result | Reviews | Commits | Runs 24h | Reviews 24h | Commits 24h |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...list.map((r) => `| ${r.agent} | ${r.runs} | ${r.plans} | ${r.planned} | ${r.done} | ${pct(r)} | ${r.planShort} | ${r.noResult} | ${r.reviews} | ${r.commits} | ${r.runs24} | ${r.reviews24} | ${r.commits24} |`)].join('\n');
  const ignored = [...invalid.entries()].sort().map(([n, c]) => `${n} (${c})`).join(', ');
  return { rows: list, markdown: ignored ? `${md}\n\nActivity under invalid names (not counted above): ${ignored}.` : md, invalid: Object.fromEntries(invalid) };
}

/** Pure: keep only activity at or after `since` (ms). Older activity is never credited to anyone. */
export const filterSince = (items, since) => items.filter((x) => x.at >= since);
export const parseSince = (body) => { const m = /<!-- since: (\S+) -->/.exec(body || ''); return m ? new Date(m[1]).getTime() : null; };
/** Pure: the oldest commit (list is newest first) of an unbroken run of commits whose AGENTS.md is version >= 1.4. */
export function v14Start(commits) {
  let since = null;
  for (const c of commits) { if (c.v14) since = c.date; else break; }
  return since ? new Date(since).getTime() : null;
}

export function renderMetricsBody(markdown, now = Date.now(), since = null) {
  return `<!-- since: ${new Date(since ?? now).toISOString()} -->\nCI-maintained state. **Not work; do not edit.** Closed on purpose. Read by the priority run.\n\nUpdated ${new Date(now).toISOString()} by the sweep from the Plan/Result comments on the \`run-log: <agent>\` issues, review verdicts and commits on PRs. Only activity since ${new Date(since ?? now).toISOString()} (the v1.4 merge) is counted; earlier commits and comments are not credited to anyone.\n\n- **plan-short**: a needs-review PR not authored by the agent existed when its plan was posted and the plan has no review step.\n- **no-result**: no \`Result:\` ${NO_RESULT_MIN()} minutes after the plan.\n- **Done %**: done steps / planned steps over all plans.\n\n${markdown}\n`;
}

async function ensureClosedIssue(title, body) {
  const found = await paginate(repoPath('/issues?labels=ci-registry&state=all'));
  let issue = found.find((i) => !i.pull_request && i.title === title);
  if (!issue) {
    issue = await api('POST', repoPath('/issues'), { title, body, labels: ['ci-registry'] });
    issue = await api('PATCH', repoPath(`/issues/${issue.number}`), { state: 'closed', state_reason: 'not_planned' });
  }
  return { issue, all: found };
}

async function dropLabel(number, name) {
  try { await api('DELETE', repoPath(`/issues/${number}/labels/${encodeURIComponent(name)}`)); console.log(`removed ${name} from #${number}`); }
  catch (e) { if (!(e instanceof GhError && e.status === 404)) throw e; }
}

async function checksOf(sha) {
  const runs = (await api('GET', repoPath(`/commits/${sha}/check-runs?per_page=100`))).check_runs;
  const checks = {};
  for (const n of ['fast-gate', 'scope']) {
    const mine = runs.filter((r) => r.name === n).sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
    checks[n] = mine ? (mine.status === 'completed' ? mine.conclusion : 'pending') : 'missing';
  }
  return checks;
}

/** When v1.4 went live: the stored marker, else the commit that first put AGENTS.md at version 1.4 or later on the default branch. */
async function metricsStart(issue, now) {
  if (process.env.METRICS_FROM) return new Date(process.env.METRICS_FROM).getTime();
  const stored = parseSince(issue.body);
  if (stored) return stored;
  const commits = await api('GET', repoPath('/commits?path=AGENTS.md&per_page=30'));
  const info = [];
  for (const c of commits) {
    const f = await api('GET', repoPath(`/contents/AGENTS.md?ref=${c.sha}`));
    const v = /version (\d+)\.(\d+)/.exec(Buffer.from(f.content, 'base64').toString('utf8').split('\n')[0]);
    const ok = !!v && (Number(v[1]) > 1 || Number(v[2]) >= 4);
    info.push({ v14: ok, date: c.commit.committer.date });
    if (!ok) break;
  }
  return v14Start(info) ?? now; // v1.4 not on the default branch yet: nothing counts
}

async function runPlans(now) {
  // make sure the scheduled agents' run-log issues exist (closed, not work)
  const found = await paginate(repoPath('/issues?labels=ci-registry&state=all'));
  const titles = new Set(found.map((i) => i.title));
  for (const a of SCHEDULED_AGENTS) {
    const title = `run-log: ${a}`; // always the real titles, whatever prefix a test scans
    if (!titles.has(title)) { await ensureClosedIssue(title, `Run log of \`${a}\`. CI-created, closed on purpose, not work. The agent posts one \`Plan · Agent: ${a}: 1) … 2) …\` comment per run and edits \`Result: 1) done|skipped because …\` into it.`); console.log(`created ${title}`); }
  }
  // run-log issues: CI-created ones carry ci-registry; agent-created ones are found by title search
  const byNumber = new Map(found.filter((i) => !i.pull_request && i.title.startsWith(RUNLOG_PREFIX())).map((i) => [i.number, i]));
  try {
    const q = encodeURIComponent(`repo:${process.env.GITHUB_REPOSITORY} is:issue in:title "${RUNLOG_PREFIX().trim()}"`);
    for (const i of (await api('GET', `/search/issues?q=${q}&per_page=100`)).items || []) if (!i.pull_request && i.title.startsWith(RUNLOG_PREFIX())) byNumber.set(i.number, i);
  } catch (e) { console.log(`run-log title search failed (${e.message}); using the labelled ones only`); }
  const logs = [...byNumber.values()];
  // recent PRs: needs-review history, review verdicts and commits
  const prs = (await paginate(repoPath('/pulls?state=all&sort=updated&direction=desc'))).filter((p) => now - new Date(p.updated_at).getTime() < 7 * 24 * HOUR).slice(0, 40);
  const nrPrs = [];
  const reviews = [];
  const commits = [];
  for (const pr of prs) {
    const line1 = parseLine1(pr.body || '');
    const events = await paginate(repoPath(`/issues/${pr.number}/events`));
    if (line1) nrPrs.push({ authorKey: agentKey(line1.agent), intervals: needsReviewIntervals(events, now) });
    for (const c of await paginate(repoPath(`/issues/${pr.number}/comments`))) {
      const v = parseVerdict(c.body);
      if (v && validAgentName(v.agent)) reviews.push({ agent: v.agent, at: new Date(c.created_at).getTime() });
    }
    if (line1) for (const c of await paginate(repoPath(`/pulls/${pr.number}/commits`))) commits.push({ agent: line1.agent, at: new Date(c.commit.committer.date).getTime() });
  }
  const plans = [];
  let sessions = null;
  for (const log of logs) {
    for (const c of await paginate(repoPath(`/issues/${log.number}/comments`))) {
      const plan = parsePlan(c.body);
      if (!plan) continue;
      const a = analysePlan({ plan, createdAt: c.created_at, now, needsReviewPrs: nrPrs, noResultMin: NO_RESULT_MIN() });
      plans.push({ agent: plan.agent, at: new Date(c.created_at).getTime(), ...a });
      if (chatParts(plan.agent) && now - new Date(c.created_at).getTime() < 3 * HOUR) { // keep the chat session lock fresh
        sessions ||= await loadSessions();
        if (checkSession(sessions.map, plan.agent, now).ok && touchSession(sessions.map, plan.agent, c.created_at)) await saveSessions(sessions.issue, sessions.map);
      }
    }
  }
  const { issue } = await ensureClosedIssue(METRICS_TITLE(), 'pending');
  const since = await metricsStart(issue, now);
  const { markdown } = buildMetrics({ plans: filterSince(plans, since), reviews: filterSince(reviews, since), commits: filterSince(commits, since), now });
  await api('PATCH', repoPath(`/issues/${issue.number}`), { body: renderMetricsBody(markdown, now, since) });
  console.log(`agent-metrics #${issue.number}: ${plans.length} plan(s)\n${markdown}`);
}

/** Pure: true when the agent-metrics issue was last updated longer ago than `everyMin` (or never). */
export const isStale = (updatedAt, now, everyMin) => !updatedAt || now - new Date(updatedAt).getTime() >= everyMin * 60e3;

async function metricsStale(now) {
  const everyMin = Number(process.env.METRICS_EVERY_MIN) || 30;
  const found = (await paginate(repoPath('/issues?labels=ci-registry&state=all'))).find((i) => i.title === METRICS_TITLE());
  return isStale(found?.updated_at, now, everyMin);
}

async function main() {
  const now = Date.now();
  await ensureLabels(readJson('ci/labels.json'));
  if (process.env.SWEEP_ONLY === 'plans') { await runPlans(now); return; } // dry runs of the metrics (self-tests)
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
  // 3 + 4. lease-expired and needs-review (Ready-driven)
  let sessions = null;
  for (const i of prs) {
    const line1 = parseLine1(i.body);
    const labels = labelsOf(i);
    const pr = await api('GET', repoPath(`/pulls/${i.number}`));
    const isCi = line1?.agent?.toLowerCase() === 'ci';
    const comments = await paginate(repoPath(`/issues/${i.number}/comments`));
    const commits = await paginate(repoPath(`/pulls/${i.number}/commits`));
    const bookkeeping = await verifiedBookkeepingShas(commits, api, repoPath); // v1.9: CI merges are not author activity
    const headAt = effectiveHeadDate(commits, bookkeeping);
    const checks = await checksOf(pr.head.sha);
    if (line1 && !isCi) {
      const lastActivity = lastAgentActivity({ agent: line1.agent, createdAt: pr.created_at, commitDates: commits.filter((c) => !bookkeeping.has(c.sha)).map((c) => c.commit.committer.date), comments });
      const ready = validReady({ comments, headAt, authorKey: agentKey(line1.agent), now });
      const expired = isLeaseExpired({ lastActivity, now, waiting: waitingOnCi({ ready, checks, labels: pr.labels }) });
      if (expired && !labels.has('lease-expired')) { await addLabels(i.number, ['lease-expired']); console.log(`lease-expired #${i.number}`); }
      if (!expired && labels.has('lease-expired')) await dropLabel(i.number, 'lease-expired');
    }
    if (line1 && chatParts(line1.agent) && !sessions) sessions = await loadSessions();
    const want = needsReviewWanted({ authorKey: line1 ? agentKey(line1.agent) : null, comments, headAt, checks, labels, draft: pr.draft, isCi, sessions: sessions?.map || {}, now, reviewRequired: reviewRequired(await paginate(repoPath(`/pulls/${i.number}/files`))).required });
    if (want && !labels.has('needs-review')) { await addLabels(i.number, ['needs-review']); console.log(`needs-review #${i.number}`); }
    if (!want && labels.has('needs-review')) await dropLabel(i.number, 'needs-review');
    // merge conflicts appear when main moves (no PR event), so the sweep re-checks every open PR
    await checkConflict(i.number, { pr, tries: 1 });
  }
  // 5. run plans and metrics (never lets a metrics problem break the labels above). Event-triggered
  // ("light") sweeps skip the heavy metrics pass unless agent-metrics is older than METRICS_EVERY_MIN, so
  // frequent sweeps stay within the Actions token's hourly API budget.
  if (process.env.SWEEP_MODE === 'light' && !(await metricsStale(now))) { console.log('light sweep: agent-metrics is fresh, metrics pass skipped'); return; }
  try { await runPlans(now); } catch (e) { console.log(`::warning::run-plan metrics failed: ${e instanceof GhError ? e.message : e}`); }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
