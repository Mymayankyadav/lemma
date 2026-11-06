// Bookkeeping merges (v1.9). Almost every PR edits CURRENT.md and NEXT.md, usually by adding or deleting a whole
// `## ` section, so a PR goes stale on those two files whenever another PR merges. Resolving that by hand cost agents
// whole runs (they have no git and rewrite 30 KB files through the API). CI resolves it instead:
//   - autoresolve.mjs merges main into a PR whose ONLY conflicts are in BOOKKEEPING files, using mergeSections()
//     below (section-by-section 3-way merge; a section changed differently on both sides falls back to a line merge
//     that only accepts pure additions). Anything else is left to the author, as before.
//   - The merge commit gets a `bookkeeping-merge` check run created by the Actions token, which agents cannot create,
//     and effectiveHeadDate() skips such commits, so the author's Ready and reviewers' approvals stay valid.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BOOKKEEPING = ['CURRENT.md', 'NEXT.md'];
export const CHECK_NAME = 'bookkeeping-merge';
export const COMMIT_PREFIX = 'ci: merge main (bookkeeping only:';

const PRE = '\u0000pre';
const TRAILER = '\u0000trailer';

/** Pure: split a markdown file into [{key, text}] at `## ` headings; text before the first heading is the preamble and
 *  a final "(…)" paragraph after the last section is a trailer of its own (NEXT.md ends with one). */
export function splitSections(text) {
  const parts = String(text ?? '').split(/^(?=## )/m);
  const seen = new Map();
  const out = parts.map((p, i) => {
    let key = i === 0 ? PRE : p.split('\n', 1)[0].trim();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) key += `\u0000${n}`;
    return { key, text: p };
  });
  const last = out[out.length - 1];
  const m = out.length > 1 ? /\n\n(\([^\n]*\)\n*)$/.exec(last.text) : null;
  if (m) {
    last.text = last.text.slice(0, last.text.length - m[1].length);
    out.push({ key: TRAILER, text: m[1] });
  }
  return out;
}

const same = (a, b) => (a == null || b == null ? a == null && b == null : a.trimEnd() === b.trimEnd());
const linesOf = (s) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));
const startsWith = (arr, pre) => pre.length <= arr.length && pre.every((l, i) => arr[i] === l);
const endsWith = (arr, suf) => suf.length <= arr.length && suf.every((l, i) => arr[arr.length - suf.length + i] === l);

/** Pure: resolve one conflict hunk, or null. Accepted only when both sides ADDED lines next to the same base lines
 *  (base empty, or base is a common prefix or suffix of both): the result keeps base once, main's lines, then the PR's. */
export function resolveHunk({ ours, base, theirs }) {
  if (ours.join('\n') === theirs.join('\n')) return ours;
  if (!base.length) return [...theirs, ...ours];
  if (startsWith(ours, base) && startsWith(theirs, base)) return [...base, ...theirs.slice(base.length), ...ours.slice(base.length)];
  if (endsWith(ours, base) && endsWith(theirs, base)) return [...theirs.slice(0, theirs.length - base.length), ...ours.slice(0, ours.length - base.length), ...base];
  return null;
}

/** Pure: resolve `git merge-file --diff3` output (markers `<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`), or null. */
export function resolveDiff3(text) {
  const out = [];
  let mode = null;
  let h = null;
  for (const line of linesOf(text)) {
    if (mode === null && line.startsWith('<<<<<<< ')) { mode = 'ours'; h = { ours: [], base: [], theirs: [] }; continue; }
    if (mode === 'ours' && line.startsWith('||||||| ')) { mode = 'base'; continue; }
    if ((mode === 'ours' || mode === 'base') && line === '=======') { mode = 'theirs'; continue; }
    if (mode === 'theirs' && line.startsWith('>>>>>>> ')) {
      const r = resolveHunk(h);
      if (!r) return null;
      out.push(...r);
      mode = null;
      continue;
    }
    if (mode) h[mode].push(line); else out.push(line);
  }
  if (mode) return null;
  return out.length ? out.join('\n') + '\n' : '';
}

/** Line-level 3-way merge of one section with git (pure additions only), or null. */
export function lineMerge(base, ours, theirs) {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  try {
    const f = (n, s) => { const p = join(dir, n); writeFileSync(p, s.endsWith('\n') ? s : s + '\n'); return p; };
    const o = f('ours', ours), b = f('base', base ?? ''), t = f('theirs', theirs);
    const r = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', 'ours', '-L', 'base', '-L', 'theirs', o, b, t], { encoding: 'utf8' });
    if (r.status < 0 || r.status === null || r.error) return null;
    return r.status === 0 ? r.stdout : resolveDiff3(r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/**
 * Pure apart from lineMerge: 3-way merge of a bookkeeping file by `## ` section. ours = the PR branch, theirs = main.
 * A section changed on one side only takes that side (deleting it included); changed identically on both, either;
 * changed differently on both, a line merge that only accepts pure additions; deleted on one side and changed on the
 * other, a conflict. Section order is main's, with sections only the PR has inserted after their predecessor in the
 * PR. Returns { text } or { error }.
 */
export function mergeSections(baseText, oursText, theirsText) {
  const [B, O, T] = [baseText, oursText, theirsText].map((s) => splitSections(s));
  const map = (xs) => new Map(xs.map((x) => [x.key, x.text]));
  const [b, o, t] = [B, O, T].map(map);
  const result = new Map();
  for (const key of new Set([...b.keys(), ...o.keys(), ...t.keys()])) {
    const [bv, ov, tv] = [b.get(key), o.get(key), t.get(key)];
    let v;
    if (same(ov, tv)) v = ov ?? tv;
    else if (same(ov, bv)) v = tv;
    else if (same(tv, bv)) v = ov;
    else if (ov == null || tv == null) return { error: `section "${label(key)}" was deleted on one side and changed on the other` };
    else {
      v = lineMerge(bv ?? '', ov, tv);
      if (v == null) return { error: `section "${label(key)}" was edited differently on both sides` };
    }
    if (v != null) result.set(key, v);
  }
  const order = T.map((x) => x.key).filter((k) => result.has(k));
  const oKeys = O.map((x) => x.key);
  for (let i = 0; i < oKeys.length; i++) {
    const k = oKeys[i];
    if (!result.has(k) || order.includes(k)) continue;
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) at = order.indexOf(oKeys[j]);
    let pos = at >= 0 ? at + 1 : order[0] === PRE ? 1 : 0;
    while (pos < order.length && !o.has(order[pos]) && !b.has(order[pos])) pos++; // after main's own insertions there
    order.splice(pos, 0, k);
  }
  const texts = order.map((k) => result.get(k)).filter((s) => s !== '');
  const text = texts.map((s, i) => (i < texts.length - 1 ? s.replace(/\n*$/, '\n\n') : s.replace(/\n*$/, '\n'))).join('');
  return { text };
}
const label = (key) => (key === PRE ? '(top of file)' : key === TRAILER ? '(closing note)' : key.replace(/\u0000\d+$/, ''));

/** Pure: commits (oldest first, as /pulls/{n}/commits lists them) → committer date (ms) of the newest commit that is
 *  not a verified bookkeeping merge. Ready and verdicts must be newer than this, not than the raw head. */
export function effectiveHeadDate(commits, verifiedShas) {
  const list = commits || [];
  for (let i = list.length - 1; i >= 0; i--) if (!verifiedShas.has(list[i].sha)) return new Date(list[i].commit.committer.date).getTime();
  return list.length ? new Date(list[0].commit.committer.date).getTime() : 0;
}

/** Pure: does this check-runs listing verify a bookkeeping merge (created by the Actions token, successful)? */
export const verifiesBookkeeping = (runs) => (runs || []).some((r) => r.name === CHECK_NAME && r.app?.slug === 'github-actions' && r.conclusion === 'success');

/** The trailing commits of a PR that are verified bookkeeping merges (checked newest first; stops at the first other). */
export async function verifiedBookkeepingShas(commits, api, repoPath) {
  const out = new Set();
  for (let i = (commits || []).length - 1; i >= 0; i--) {
    const c = commits[i];
    if (!String(c.commit?.message || '').startsWith(COMMIT_PREFIX)) break;
    const runs = (await api('GET', repoPath(`/commits/${c.sha}/check-runs?check_name=${CHECK_NAME}&per_page=20`))).check_runs;
    if (!verifiesBookkeeping(runs)) break;
    out.add(c.sha);
  }
  return out;
}
