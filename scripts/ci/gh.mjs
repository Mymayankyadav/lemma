// Minimal GitHub REST/GraphQL helper for CI scripts. No dependencies (Node 22 fetch).
import { appendFileSync } from 'node:fs';
// Env: GITHUB_TOKEN (or GH_TOKEN), GITHUB_REPOSITORY (owner/name), GITHUB_API_URL.
export const API = process.env.GITHUB_API_URL || 'https://api.github.com';
export const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
export const REPO = process.env.GITHUB_REPOSITORY || '';

export class GhError extends Error {
  constructor(status, method, path, body) {
    super(`GitHub ${method} ${path} -> ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`.slice(0, 600));
    this.status = status;
    this.body = body;
  }
}

/** `opts.token` overrides the default token for this one call (used only for CI_BOT_TOKEN, see automerge.mjs). */
export async function api(method, path, body, opts = {}) {
  const token = opts.token || TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      'user-agent': 'lemma-ci',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new GhError(res.status, method, path, data);
  return data;
}

/** GET every page of a list endpoint (per_page=100). */
export async function paginate(path, key) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await api('GET', `${path}${sep}per_page=100&page=${page}`);
    const items = key ? data[key] : data;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

export async function graphql(query, variables) {
  const data = await api('POST', '/graphql', { query, variables });
  if (data.errors?.length) throw new GhError(200, 'POST', '/graphql', data.errors);
  return data.data;
}

export const repoPath = (suffix) => `/repos/${REPO}${suffix}`;

export function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) { console.log(markdown); return; }
  appendFileSync(file, markdown + '\n');
}

const LINE1 = /^Agent:\s*(.+?)\s*·\s*Item:\s*(.+?)\s*·\s*Lease until\s+(\S+)\s*$/;
/** Parse `Agent: <name> · Item: <id> · Lease until <ISO-8601>` from the first line of a body. */
export function parseLine1(body) {
  const first = String(body || '').replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  const m = LINE1.exec(first);
  if (!m) return null;
  const lease = new Date(m[3]);
  const isoShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(m[3]);
  if (!isoShape || Number.isNaN(lease.getTime())) return null;
  return { agent: m[1], item: m[2], lease };
}

/** Make sure every label in ci/labels.json exists. Idempotent. */
export async function ensureLabels(labels) {
  const existing = new Set((await paginate(repoPath('/labels'))).map((l) => l.name.toLowerCase()));
  for (const l of labels) {
    if (existing.has(l.name.toLowerCase())) continue;
    try {
      await api('POST', repoPath('/labels'), l);
      console.log(`created label ${l.name}`);
    } catch (e) {
      if (!(e instanceof GhError && e.status === 422)) throw e; // 422 = already exists (race)
    }
  }
}

export async function addLabels(number, labels) {
  if (!labels.length) return;
  await api('POST', repoPath(`/issues/${number}/labels`), { labels });
}
