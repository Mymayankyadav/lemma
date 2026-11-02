// FIX-679a: diagnostics must inspect a plan without re-executing the
// 30k-card candidate query after a failed first-attempt timing gate.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildReadOnlyExplain } from './notif1b-diagnostic.mjs'

const candidates = buildReadOnlyExplain('select public.notify_candidates($1,now())')
assert.match(candidates, /^explain \(verbose, costs, settings\) select public\.notify_candidates/i)
assert.doesNotMatch(candidates, /\banalyze\b/i)

const cte = buildReadOnlyExplain('with prefs as (select 1) select count(*) from prefs')
assert.match(cte, /^explain \(verbose, costs, settings\) with /i)
assert.doesNotMatch(cte, /\banalyze\b/i)

for (const unsafe of ['delete from public.cards', 'update public.cards set due=now()', 'explain analyze select 1', '']) {
  assert.throws(() => buildReadOnlyExplain(unsafe), /read-only SELECT or WITH/i)
}

const stress = await readFile(new URL('./notif1b-stress.mjs', import.meta.url), 'utf8')
assert.match(stress, /buildReadOnlyExplain\(/)
assert.doesNotMatch(stress, /explain\s*\(\s*analyze\b/i)
assert.match(stress, /assert\.ok\(elapsed<150,/,
  'original strict first-attempt 150ms gate must remain unchanged')
console.log('PASS NOTIF-1b diagnostics inspect plans without rerunning candidate queries')
