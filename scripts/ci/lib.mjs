// Pure helpers shared by the CI scripts (no network, fully unit-tested).
import { readFileSync } from 'node:fs';

/** Convert a glob (`**`, `*`, `?`) to a RegExp. Globs without `/` match the basename anywhere. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const cache = new Map();
export function matches(path, glob) {
  let re = cache.get(glob);
  if (!re) { re = globToRegExp(glob); cache.set(glob, re); }
  if (!glob.includes('/')) return re.test(path.split('/').pop());
  return re.test(path);
}
export const matchesAny = (path, globs) => globs.some((g) => matches(path, g));

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Split NEXT.md into { preamble, items: Map<id, block>, trailer }. Item = `## N<id> ...` + lines until next heading. */
export function parseNext(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const preamble = [];
  const trailer = [];
  const items = new Map();
  let current = null;
  for (const line of lines) {
    const h = /^##\s+N(\d+(?:\.\d+)*)\b/.exec(line);
    if (h) { current = { id: h[1], lines: [line] }; items.set(current.id, current); continue; }
    if (/^\(.*\)\s*$/.test(line) && current) { trailer.push(line); current = null; continue; }
    if (current) current.lines.push(line);
    else if (items.size === 0) preamble.push(line);
    else trailer.push(line);
  }
  const blocks = new Map();
  for (const [id, it] of items) blocks.set(id, it.lines.join('\n').replace(/\n+$/, ''));
  return { preamble: preamble.join('\n').trim(), blocks, trailer: trailer.join('\n').trim() };
}

/** Compare NEXT.md before/after; returns {removed:[ids], added:[ids], changed:[ids], otherChanged:boolean}. */
export function diffNext(baseMd, headMd) {
  const a = parseNext(baseMd);
  const b = parseNext(headMd);
  const removed = [...a.blocks.keys()].filter((id) => !b.blocks.has(id));
  const added = [...b.blocks.keys()].filter((id) => !a.blocks.has(id));
  const changed = [...a.blocks.keys()].filter((id) => b.blocks.has(id) && a.blocks.get(id) !== b.blocks.get(id));
  const otherChanged = a.preamble !== b.preamble || a.trailer !== b.trailer;
  return { removed, added, changed, otherChanged, base: a, head: b };
}

/** Added and removed lines of a unified-diff patch (without the +/- markers and headers). */
export function patchLines(patch) {
  const added = [];
  const removed = [];
  for (const line of String(patch || '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) added.push(line.slice(1));
    else if (line.startsWith('-')) removed.push(line.slice(1));
  }
  return { added, removed };
}

export const isTestFile = (path) =>
  /^tests\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

const SKIP_RE = /(\.(only|skip|fixme|todo)\s*\()|\b(xit|xdescribe|xtest|fdescribe|fit)\s*\(|\btest\.(fixme|skip|only|todo)\b/;
export const addsSkipOnly = (lines) => lines.filter((l) => SKIP_RE.test(l));

export const countExpects = (lines) =>
  lines.reduce((n, l) => n + (l.match(/\bexpect\s*\(|\bassert(\.\w+)?\s*\(/g) || []).length, 0);

export function isoNow() { return new Date().toISOString(); }
export function plusHours(h, from = new Date()) { return new Date(from.getTime() + h * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z'); }

/**
 * CI_BOT_TOKEN may appear only in main-side workflows (push / schedule / dispatch): never in a workflow that a
 * pull request can trigger, and only in the files listed here. Returns a list of problems (pure).
 */
export const BOT_TOKEN_ALLOWED = ['ci.yml', 'calibrate.yml', 'review-merge.yml'];
export function botTokenViolations(workflows) {
  const out = [];
  for (const { name, text } of workflows) {
    if (!/CI_BOT_TOKEN/.test(text)) continue;
    if (!BOT_TOKEN_ALLOWED.includes(name)) out.push(`${name}: CI_BOT_TOKEN is only allowed in ${BOT_TOKEN_ALLOWED.join(', ')}`);
    if (/^\s{2}pull_request(_target)?:/m.test(text)) out.push(`${name}: CI_BOT_TOKEN must never be used in a workflow triggered by pull_request or pull_request_target`);
  }
  return out;
}

/**
 * Name of the Agent that wrote a comment: the last non-empty line `Agent: <name>`, or the first line when it
 * carries `· Agent: <name>` (Approve, Changes requested, No progress:) or `Taking over: Agent <name>`.
 */
export function commentAgent(body) {
  const lines = stripFooter(body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const re = /(?:^|·\s*|^Taking over:\s*)Agent:?\s*([^\s·:][^·:\n]*?)\s*(?::.*|·.*)?$/;
  for (const l of [lines[lines.length - 1], lines[0]]) {
    const m = l ? re.exec(l) : null;
    if (m) return m[1].trim();
  }
  return null;
}

/** A comment without its footer: everything from the first line that is exactly `---` is dropped (connectors append signatures there). */
export function stripFooter(body) {
  const lines = String(body || '').split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim() === '---');
  return (i >= 0 ? lines.slice(0, i) : lines).join('\n').trim();
}

// ---- Agent names (AGENTS.md v1.4 "Names") ----
export const NAME_FORMATS = '`lemma-<n>` (scheduled tasks), `chat-<n>#<tag>` (ordinary chats; <tag> = 4 random lowercase letters or digits chosen at the first run and kept for the whole conversation), `owner-setup*`, `priority`, `ci`';
const NAME_RES = [/^lemma-\d+$/, /^chat-\d+#[a-z0-9]{4}$/, /^owner-setup[A-Za-z0-9_-]*$/, /^priority$/, /^ci$/];
export const validAgentName = (n) => NAME_RES.some((re) => re.test(String(n ?? '').trim()));
/** `chat-3#ab12` -> `chat-3`; every other name is its own base name. */
export const baseName = (n) => String(n ?? '').trim().split('#')[0];
/** Identity used to compare agents: lemma-<n> by base name, chat sessions by their full name (tag included). */
export const agentKey = (n) => { const s = String(n ?? '').trim(); return (/^chat-/.test(s) ? s : baseName(s)).toLowerCase(); };
export function chatParts(n) {
  const m = /^chat-(\d+)#([a-z0-9]{4})$/.exec(String(n ?? '').trim());
  return m ? { base: `chat-${m[1]}`, tag: m[2] } : null;
}
