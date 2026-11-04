// Non-blocking perf-report summary: counts and failures per perf check, to the job summary and (on PRs) one sticky comment.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseJUnit, jobKind } from './signatures.mjs';
import { appendSummary, api, paginate, repoPath } from './gh.mjs';

const walk = (d, o = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, o) : n.endsWith('.xml') && o.push(p); } return o; };
const dir = process.argv[2] || 'junit';
const cases = walk(dir).flatMap((f) => parseJUnit(readFileSync(f, 'utf8')));
const failed = cases.filter((c) => c.failed);
const md = [`### perf-report (non-blocking)`, '',
  `${cases.length} perf checks ran, ${failed.length} over budget. Budgets are unchanged; this report never blocks a merge.`, '',
  ...failed.slice(0, 25).map((c) => `- ❌ ${jobKind(c.file)} \`${c.file}\` ${c.name}: ${c.message.slice(0, 140)}`)].join('\n');
appendSummary(md);
const pr = process.env.PR_NUMBER;
if (pr) {
  const marker = '<!-- perf-report -->';
  const comments = await paginate(repoPath(`/issues/${pr}/comments`));
  const mine = comments.find((c) => (c.body || '').startsWith(marker));
  const body = `${marker}\n${md}\n`;
  if (mine) await api('PATCH', repoPath(`/issues/comments/${mine.id}`), { body }); else await api('POST', repoPath(`/issues/${pr}/comments`), { body });
}
