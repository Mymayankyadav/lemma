'use strict';
// Parallel-lane guard (see plan.md section 3 and lanes.json).
//   node test/lane_guard.js              -> validate lanes.json: no file has two owners
//   node test/lane_guard.js B            -> check this branch only touches lane B files
//   node test/lane_guard.js integration  -> owner-requested integration session
// Options: --base <ref> (default origin/main), --allow-delete (only with owner approval).
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const cfg = JSON.parse(fs.readFileSync('lanes.json', 'utf8'));
const toRegex = glob => new RegExp('^' + glob.split('**').map(part =>
  part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
const groups = [];
for (const [id, lane] of Object.entries(cfg.lanes)) groups.push({ id: 'lane ' + id, lane: id, globs: lane.owns });
groups.push({ id: 'shared_append_only', globs: cfg.shared_append_only });
groups.push({ id: 'integration_only', globs: cfg.integration_only });
groups.push({ id: 'frozen', globs: cfg.frozen });
for (const g of groups) g.res = g.globs.map(toRegex);
const owners = path => groups.filter(g => g.res.some(re => re.test(path)));
const git = args => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base');

if (!target) {
  const problems = [];
  let tracked = [];
  try { tracked = git(['ls-files']); } catch { /* not a git checkout; check globs only */ }
  const literals = groups.flatMap(g => g.globs.filter(x => !x.includes('*')));
  for (const path of new Set([...tracked, ...literals])) {
    const o = owners(path);
    if (o.length > 1) problems.push(path + ' -> ' + o.map(g => g.id).join(', '));
  }
  for (const lane of Object.values(cfg.lanes))
    if (!fs.existsSync(lane.status)) problems.push('missing lane status file ' + lane.status);
  if (problems.length) { console.error('lanes.json overlap:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log('ok: lanes.json gives every path at most one owner');
  process.exit(0);
}

const lane = target.toUpperCase() === 'INTEGRATION' ? 'integration' : target.toUpperCase();
if (lane !== 'integration' && !cfg.lanes[lane]) { console.error('Unknown lane ' + target); process.exit(2); }
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const changes = new Map();
for (const line of git(['diff', '--name-status', base + '...HEAD'])) {
  const [status, ...paths] = line.split('\t');
  for (const p of paths) changes.set(p, status[0]);
}
for (const line of git(['status', '--porcelain', '--untracked-files=all'])) {
  const status = line.slice(0, 2).trim()[0] || 'M';
  for (const p of line.slice(3).split(' -> ')) changes.set(p, status === '?' ? 'A' : status);
}
const errors = [], notes = [];
for (const [path, status] of changes) {
  const o = owners(path);
  if ((status === 'D' || status === 'R') && !args.includes('--allow-delete'))
    errors.push(path + ': deleting/renaming tracked files needs owner approval (--allow-delete)');
  else if (o.some(g => g.id === 'frozen')) errors.push(path + ': frozen, never edit');
  else if (o.some(g => g.id === 'shared_append_only'))
    notes.push(path + ': shared file - append/edit only your own lines; never remove other lanes\' text');
  else if (o.some(g => g.id === 'integration_only')) {
    if (lane !== 'integration') errors.push(path + ': integration-only file (owner-requested sessions only)');
  } else if (!o.length) errors.push(path + ': unowned file - ask the owner which lane owns it');
  else if (lane === 'integration' && /^docs\/.*\.md$/.test(path))
    notes.push(path + ': lane-owned doc edited by integration - keep the lane\'s content; never edit lane code');
  else if (lane === 'integration' || o[0].lane !== lane)
    errors.push(path + ': owned by ' + o[0].id + ' - write a request in its status file instead');
}
for (const n of notes) console.log('note: ' + n);
if (errors.length) { console.error('Lane guard FAILED for ' + lane + ':\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('ok: ' + changes.size + ' changed file(s) are within ' + lane + ' ownership');
