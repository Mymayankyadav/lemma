// Chat session lock. Ordinary chats sign as `chat-<n>#<tag>`; <tag> is chosen once per conversation. CI records, in a
// closed `ci-registry` issue, the last tag and time seen for each chat-<n>. If a different tag uses the same chat-<n>
// within 3 hours of the last activity, its PR fails `scope` and its verdicts are ignored.
import { api, paginate, repoPath } from './gh.mjs';
import { chatParts } from './lib.mjs';

export const LOCK_MS = 3 * 3600e3;
export const SESSIONS_TITLE = () => process.env.SESSIONS_TITLE || 'ci-registry: chat sessions';
const KEEP_MS = 24 * 3600e3;

/** Pure: may `name` use its chat number now? */
export function checkSession(map, name, now = Date.now()) {
  const p = chatParts(name);
  if (!p) return { ok: true };
  const cur = map?.[p.base];
  if (!cur || cur.tag === p.tag) return { ok: true };
  const last = new Date(cur.seen).getTime();
  if (Number.isNaN(last) || now - last >= LOCK_MS) return { ok: true };
  return { ok: false, base: p.base, owner: cur.tag, until: new Date(last + LOCK_MS).toISOString() };
}
export const lockMessage = (r) => `${r.base} is in use by session ${r.owner} until ${r.until}; pick another number`;

/** Pure: record activity (call only when checkSession was ok). Returns true when the map changed. */
export function touchSession(map, name, at = Date.now()) {
  const p = chatParts(name);
  if (!p) return false;
  const seen = new Date(at).toISOString();
  const cur = map[p.base];
  if (cur && cur.tag === p.tag && new Date(cur.seen).getTime() >= new Date(seen).getTime()) return false;
  map[p.base] = { tag: p.tag, seen };
  return true;
}
export function prune(map, now = Date.now()) {
  for (const [k, v] of Object.entries(map)) if (now - new Date(v.seen).getTime() > KEEP_MS) delete map[k];
}

export const renderSessions = (map) => `CI-maintained state. **Not work; do not edit.** Closed on purpose.\n\nLast tag and time seen for each chat number (a different tag within 3 hours is rejected).\n\n\`\`\`json\n${JSON.stringify(map)}\n\`\`\`\n`;
export function parseSessions(body) {
  const m = /```json\n([\s\S]*?)\n```/.exec(body || '');
  try { return m ? JSON.parse(m[1]) : {}; } catch { return {}; }
}

export async function loadSessions() {
  const found = await paginate(repoPath('/issues?labels=ci-registry&state=all'));
  let issue = found.find((i) => !i.pull_request && i.title === SESSIONS_TITLE());
  if (!issue) {
    issue = await api('POST', repoPath('/issues'), { title: SESSIONS_TITLE(), body: renderSessions({}), labels: ['ci-registry'] });
    issue = await api('PATCH', repoPath(`/issues/${issue.number}`), { state: 'closed', state_reason: 'not_planned' });
  }
  return { issue, map: parseSessions(issue.body) };
}
export async function saveSessions(issue, map) {
  prune(map);
  await api('PATCH', repoPath(`/issues/${issue.number}`), { body: renderSessions(map) });
}
