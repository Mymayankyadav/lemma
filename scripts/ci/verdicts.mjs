// Review verdicts and the Ready signal, as plain functions (no network) shared by approve.mjs and sweep.mjs.
import { stripFooter, validAgentName, agentKey } from './lib.mjs';
import { checkSession } from './sessions.mjs';

const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const isTrusted = (c) => TRUSTED.has(c.author_association);
const NAME = '([^\\s·:][^·:\\n]*?)';
const APPROVE = new RegExp(`^Approve\\s*·\\s*Agent:\\s*${NAME}\\s*$`);
const CHANGES = new RegExp(`^Changes requested\\s*·\\s*Agent:\\s*${NAME}\\s*:\\s*(\\S[\\s\\S]*)$`);
const READY = new RegExp(`^Ready\\s*·\\s*Agent:\\s*${NAME}\\s*$`);

/** A verdict comment, or null. An Approve must be the whole comment apart from a footer after a `---` line. */
export function parseVerdict(body) {
  const text = stripFooter(body);
  let m = APPROVE.exec(text);
  if (m) return { kind: 'approve', agent: m[1].trim() };
  m = CHANGES.exec(text);
  if (m) return { kind: 'changes', agent: m[1].trim(), what: m[2].trim() };
  return null;
}
/** `Ready · Agent: <name>` (the whole comment, footer aside), or null. */
export function parseReady(body) {
  const m = READY.exec(stripFooter(body));
  return m ? { agent: m[1].trim() } : null;
}

const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at);

/**
 * Verdicts that count for the current head commit: from a trusted commenter, a valid agent name and a chat session that
 * is not locked out, written after the head commit (a push voids earlier ones), and only the LATEST per agent
 * (duplicates are ignored). Also reports what was ignored and why.
 */
export function effectiveVerdicts({ comments, headAt, sessions = {}, now = Date.now() }) {
  const byAgent = new Map();
  const invalid = new Set();
  const locked = new Map();
  const stale = [];
  let attempted = false;
  for (const c of [...comments].sort(byTime)) {
    if (!isTrusted(c)) continue;
    const v = parseVerdict(c.body);
    if (!v) continue;
    attempted = true;
    if (!validAgentName(v.agent)) { invalid.add(v.agent); continue; }
    const lock = checkSession(sessions, v.agent, now);
    if (!lock.ok) { locked.set(v.agent, lock); continue; }
    if (new Date(c.created_at).getTime() <= headAt) { stale.push({ ...v, id: c.id }); continue; }
    byAgent.set(agentKey(v.agent), { ...v, key: agentKey(v.agent), id: c.id, at: new Date(c.created_at).getTime() });
  }
  return { byAgent, invalid: [...invalid], locked: [...locked.values()], stale, attempted };
}

/** The latest valid `Ready · Agent: <author>` after the head commit, or null. */
export function validReady({ comments, headAt, authorKey, sessions = {}, now = Date.now() }) {
  let found = null;
  for (const c of [...comments].sort(byTime)) {
    if (!isTrusted(c)) continue;
    const r = parseReady(c.body);
    if (!r || !validAgentName(r.agent) || agentKey(r.agent) !== authorKey) continue;
    if (!checkSession(sessions, r.agent, now).ok) continue;
    if (new Date(c.created_at).getTime() <= headAt) continue;
    found = { ...r, id: c.id, at: new Date(c.created_at).getTime() };
  }
  return found;
}

/** Should the PR carry needs-review? The author said Ready after the last push, fast-gate and scope pass, no changes-requested,
 *  and (v2.0) the PR needs an independent review at all (review-policy.mjs); other PRs merge on Ready without the label. */
export function needsReviewWanted({ authorKey, comments, headAt, checks, labels, draft, isCi, sessions, now, reviewRequired = true }) {
  if (!reviewRequired) return false;
  if (draft || isCi || !authorKey || labels.has('changes-requested')) return false;
  if (checks['fast-gate'] !== 'success' || checks.scope !== 'success') return false;
  return !!validReady({ comments, headAt, authorKey, sessions, now });
}
