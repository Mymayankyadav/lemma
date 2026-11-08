// Additive-only migration guard (AGENTS.md "Safety", v1.5). Agent PRs (N<id>, bug #, incident #) merge
// straight to production, so a migration they add may only CREATE things. Pure helpers, fully unit-tested;
// scope.mjs applies them. `rules:` and CI revert PRs are exempt.
import { readdirSync, readFileSync } from 'node:fs';

export const MIGRATIONS_DIR = 'supabase/migrations/';
const isMigration = (p) => typeof p === 'string' && p.startsWith(MIGRATIONS_DIR) && p.endsWith('.sql');

/** Remove comments and dollar-quoted bodies ($$ … $$, $tag$ … $tag$): statements inside a new function body are
 *  that function's own logic, not schema changes made by the migration. String literals are blanked too. */
export function stripSql(sql) {
  let s = String(sql || '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/--[^\n]*/g, ' '); // before dollar quotes, so a "$$" inside a comment cannot open a body
  s = s.replace(/(\$[A-Za-z_]*\$)[\s\S]*?\1/g, ' $body$ ');
  s = s.replace(/'(?:[^']|'')*'/g, "''");
  return s;
}

/** Function names created anywhere in the given SQL text (lower-case, schema stripped). */
export function functionNames(sql) {
  const out = new Set();
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/gi;
  for (const m of stripSql(sql).matchAll(re)) out.add(m[2].toLowerCase());
  return out;
}

/** Function names defined by the migrations of the checked-out base branch. */
export function existingFunctionNames(dir = MIGRATIONS_DIR) {
  const names = new Set();
  try {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) for (const n of functionNames(readFileSync(dir + f, 'utf8'))) names.add(n);
  } catch { /* no migrations folder: nothing exists yet */ }
  return names;
}

const RULES = [
  [/\bdrop\s+/i, 'DROP'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\balter\s+table\b[\s\S]*\bdrop\b/i, 'ALTER TABLE … DROP'],
  [/\balter\s+table\b[\s\S]*\brename\b/i, 'ALTER TABLE … RENAME'],
  [/\balter\s+table\b[\s\S]*\balter\s+(?:column\s+)?\S+\s+(?:set\s+data\s+)?type\b/i, 'ALTER COLUMN … TYPE'],
  [/^\s*alter\s+type\b/i, 'ALTER TYPE'],
  [/\bdelete\s+from\b/i, 'DELETE FROM'],
  [/^\s*update\s+\S+\s+set\b/i, 'UPDATE … SET (changes existing rows)'],
  [/\brevoke\b/i, 'REVOKE'],
  [/\balter\s+policy\b/i, 'ALTER POLICY'],
];

/** Pure: true for `revoke all|execute on function f(...)[, g(...)] from …` where EVERY listed function is created by this
 *  same migration and does not already exist on the base branch. Locking down a function you just created only removes
 *  default access from it (Postgres grants EXECUTE to PUBLIC by default), so it cannot harm anything that exists. Revoking
 *  on existing functions, tables, schemas or `all functions in schema` stays rejected. */
export function isRevokeOnNewFunction(stmt, created) {
  const m = /^\s*revoke\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([\s\S]+?)\s+from\s+/i.exec(stmt);
  if (!m) return false;
  const names = [...m[1].matchAll(/(?:"?\w+"?\.)?"?(\w+)"?\s*\(/g)].map((x) => x[1].toLowerCase());
  return names.length > 0 && names.every((n) => created.has(n));
}

/** Pure (v2.7, bugs #1126/#1145): tables this migration creates with a plain `create table` (not `if not exists`, which
 *  could name an existing table). */
export function createdTables(stripped) {
  return new Set([...String(stripped).matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+(?!if\s+not\s+exists\b)(?:"?public"?\.)?"?(\w+)"?/gi)].map((m) => m[1].toLowerCase()));
}

const TABLE_PRIVS = new Set(['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger', 'all', 'all privileges']);
/** Pure (v2.7): true for `revoke <table privileges> on [table] t[, u] from anon|authenticated|public…` where EVERY table is
 *  created by this same migration. AGENTS.md requires it (Supabase grants new tables to browsers by default); it only
 *  removes default access from a table that did not exist before, so it cannot harm anything. Revoking on existing
 *  tables, schemas or `all tables in schema` stays rejected, and `truncate` as a statement is still rejected. */
export function isRevokeOnNewTable(stmt, created) {
  const m = /^\s*revoke\s+([a-z,\s]+?)\s+on\s+(?:table\s+)?([\w".,\s]+?)\s+from\s+([\w",\s]+)$/i.exec(stmt);
  if (!m) return false;
  const privs = m[1].split(',').map((x) => x.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!privs.length || !privs.every((x) => TABLE_PRIVS.has(x))) return false;
  if (/\ball\s+tables\b|\bschema\b/i.test(m[2])) return false;
  const tables = m[2].split(',').map((x) => x.trim().replace(/"/g, '').replace(/^public\./i, '').toLowerCase());
  const roles = m[3].split(',').map((x) => x.trim().replace(/"/g, '').toLowerCase());
  return tables.length > 0 && tables.every((t) => /^\w+$/.test(t) && created.has(t)) && roles.every((r) => /^\w+$/.test(r));
}

/** Pure: findings for one new migration's SQL. replacesOk = names the PR body declares with
 *  `Replaces function: <name> (reviewer verified signature and behaviour)`. */
export function sqlFindings(sql, { existing = new Set(), replacesOk = new Set() } = {}) {
  const findings = [];
  const stripped = stripSql(sql);
  const created = new Set([...functionNames(sql)].filter((n) => !existing.has(n)));
  const newTables = createdTables(stripped);
  for (const stmt of stripped.split(';')) {
    const st = stmt.trim();
    if (!st) continue;
    if (isRevokeOnNewTable(st, newTables)) continue;
    for (const [re, label] of RULES) {
      if (!re.test(st)) continue;
      if (!(label === 'REVOKE' && isRevokeOnNewFunction(st, created))) findings.push(`${label}: \`${st.replace(/\s+/g, ' ').slice(0, 90)}\``);
      break;
    }
    const m = /create\s+or\s+replace\s+function\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(/i.exec(st);
    if (m && existing.has(m[1].toLowerCase()) && !replacesOk.has(m[1].toLowerCase())) {
      findings.push(`replaces existing function \`${m[1]}\` without a "Replaces function: ${m[1]} (reviewer verified signature and behaviour)" line in the PR body`);
    }
  }
  return findings;
}

/** Names declared in the PR body as reviewed replacements. */
export function declaredReplacements(body) {
  const out = new Set();
  for (const m of String(body || '').matchAll(/^Replaces function:\s*(?:"?\w+"?\.)?"?(\w+)"?\s*\(reviewer verified signature and behaviour\)\s*$/gim)) out.add(m[1].toLowerCase());
  return out;
}

/** Pure: added SQL lines of a unified diff patch (new files have every line added). */
export function addedSql(patch) {
  return String(patch || '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

/** Pure: all migration findings for a PR's files ([{filename, status, previous_filename, patch}]). */
export function migrationFindings(files, { existing = new Set(), body = '' } = {}) {
  const out = [];
  const replacesOk = declaredReplacements(body);
  for (const f of files || []) {
    const touches = isMigration(f.filename) || isMigration(f.previous_filename);
    if (!touches) continue;
    if (f.status !== 'added') {
      out.push(`\`${f.previous_filename && f.status === 'renamed' ? f.previous_filename + ' → ' + f.filename : f.filename}\` is an existing migration (${f.status}); applied migrations must never change`);
      continue;
    }
    if (f.patch === undefined) { out.push(`\`${f.filename}\`: the diff is too large to inspect; split the migration into smaller files`); continue; }
    for (const x of sqlFindings(addedSql(f.patch), { existing, replacesOk })) out.push(`\`${f.filename}\`: ${x}`);
  }
  return out;
}
