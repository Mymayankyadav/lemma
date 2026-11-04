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
