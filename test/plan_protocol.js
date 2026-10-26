'use strict';
// Lightweight structural guard against a stale or missing chatbot handoff.
// It cannot establish truth of CI claims; the incoming agent must verify them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const plan = fs.readFileSync('plan.md', 'utf8');
const agents = fs.readFileSync('AGENTS.md', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

const sections = [
  '# Lemma — canonical execution plan and chatbot handoff',
  '## 0. Operator instructions',
  '## 1. CURRENT HANDOFF',
  '## 2. Task queue',
  '## 3. Sequential chatbot protocol',
  '## 4. Ownership, architecture, and reference precedence',
  '## 5. Completed evidence ledger',
  '## 6. Five-line end-of-session report template'
];
for (const title of sections)
  assert.ok(plan.includes(title), 'Missing canonical plan section: ' + title);
const fields = ['Last verified handoff', 'Known-good main baseline', 'Next action, in one sentence',
  'Cloud confidence', 'Backend security check', 'READY_FOR_NEXT_AGENT'];
for (const field of fields)
  assert.ok(plan.includes(field), 'Missing critical handoff datum: ' + field);
const tasks = [...plan.matchAll(/^\|\s*\*\*([A-Z]+-\d+)\*\*\s*\|\s*\*\*(NEXT|DONE|IN_PROGRESS|BLOCKED|LATER)/gm)];
assert.ok(tasks.length >= 8, 'Too few stable task IDs');
assert.equal(new Set(tasks.map(m => m[1])).size, tasks.length, 'Duplicate task IDs');
assert.equal(tasks.filter(m => m[2] === 'NEXT').length, 1, 'Exactly one immediate NEXT task required');
assert.ok(plan.includes('yemqnhnztlbyxmjxidis'), 'Backend project must be explicit');
assert.ok(plan.includes('Carrel'), 'Explicitly isolate other project');
assert.ok(plan.includes('src/fsrs.js'), 'State original FSRS must be reused');
assert.match(agents, /plan\.md/);
assert.match(readme, /plan\.md/);
console.log('ok: canonical plan, single NEXT task, ownership and chatbot handoff contract');
