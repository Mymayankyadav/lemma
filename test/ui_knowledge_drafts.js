// KNOWLEDGE-01 K3a: account-local unaccepted study context editor state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/view_settings.js', 'utf8');
const begin = source.indexOf('/* KNOWLEDGE-01 K3a:');
const end = source.indexOf('const SettingsView = (() => {', begin);
assert(begin >= 0 && end > begin);
const id = '11111111-2222-4333-8444-555555555555';
let owner = 'owner-a', mode = 'account', generation = 1, blocked = false;
let handle = { userId: owner };
const rows = new Map();
const calls = [];
let holdSave = null;
const bridge = {
  async readKnowledgeDraft(contextId) {
    calls.push(['read', contextId]);
    return rows.has(contextId) ? structuredClone(rows.get(contextId)) : null;
  },
  async saveKnowledgeDraft(input) {
    calls.push(['save', structuredClone(input)]);
    if (holdSave) return new Promise(resolve => { holdSave = () => resolve({
      ...input, localRevision: input.expectedLocalRevision + 1, status: 'draft'
    }); });
    const previous = rows.get(input.contextId);
    if ((previous?.localRevision || 0) !== input.expectedLocalRevision)
      throw new Error('Knowledge draft changed; reload before editing');
    if (previous?.status === 'approved_pending')
      throw new Error('Approved knowledge intent is pending; no editing allowed');
    const next = { ...input, localRevision: input.expectedLocalRevision + 1,
      status: 'draft', userId: owner };
    rows.set(input.contextId, structuredClone(next));
    return structuredClone(next);
  }
};
const scope = vm.createContext({
  LemmaAccount: { get user() { return owner ? { id: owner } : null; } },
  LemmaSync: { accountHandle() { return handle; } },
  Store: { get mode() { return mode; } },
  App: { get workspaceBlocked() { return blocked; },
    get workspaceRevision() { return generation; } },
  LemmaCloudBridge: bridge,
  window: { crypto: { randomUUID: () => id } },
  TextEncoder, structuredClone
});
vm.runInContext(source.slice(begin, end) + '\nthis.editorFactory = KnowledgeDraftEditor;', scope);
const make = () => scope.editorFactory.create();
const fields = { title: 'Topology', markdown: '# Open covers',
  summary: 'Understand compactness', goals: 'Learn compactness\nProve Heine-Borel' };
(async () => {
  const first = make();
  assert.equal(first.start().status, 'unsaved');
  assert.equal(first.current().contextId, id);
  assert.equal(calls.length, 0, 'new draft never sends network or writes');
  await assert.rejects(first.save({ ...fields, title: '' }), /limits/);
  assert.equal(calls.length, 0);
  const saved = await first.save(fields);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.localRevision, 1);
  assert.equal(saved.authorKind, 'student');
  assert.equal(saved.payload.schema_version, 1);
  assert.deepEqual(Array.from(saved.payload.goals), ['Learn compactness', 'Prove Heine-Borel']);
  assert.equal(saved.payload.summary, 'Understand compactness');
  assert.equal(calls.length, 1);
  const second = make();
  assert.equal((await second.open(id.toUpperCase())).localRevision, 1);
  const updated = await first.save({ ...fields, summary: 'Version two' });
  assert.equal(updated.localRevision, 2);
  await assert.rejects(second.save(fields), /changed; reload/);
  assert.equal(second.current().localRevision, 1, 'failed CAS preserves editor state');
  await second.open(id);
  assert.equal(second.current().localRevision, 2);
  rows.set(id, { ...rows.get(id), status: 'approved_pending', requestId: id });
  await second.open(id);
  const beforeLocked = calls.length;
  await assert.rejects(second.save(fields), /locked after approval/);
  assert.equal(calls.length, beforeLocked, 'pending approved intent never re-saved');
  // A-owned K2g marks a stale approved intent 'needs_review'; it is just
  // as immutable as 'approved_pending', and reopening cannot unlock it.
  rows.set(id, { ...rows.get(id), status: 'needs_review', approvedBy: 'student' });
  await second.open(id);
  const beforeConflict = calls.length;
  await assert.rejects(second.save(fields), /locked after approval/);
  assert.equal(calls.length, beforeConflict, 'conflicted intent never re-saved');
  assert.equal(second.current().status, 'needs_review');
  rows.set(id, { ...rows.get(id), status: 'draft', authorKind: 'tutor',
    payload: { schema_version: 1, summary: '', goals: [], notation: ['\\mathbb{R}'] } });
  await second.open(id);
  const tutor = await second.save(fields);
  assert.equal(tutor.authorKind, 'tutor', 'UI must not silently relabel tutor proposals');
  assert.deepEqual(Array.from(tutor.payload.notation), ['\\mathbb{R}']);
  assert.equal(tutor.status, 'draft', 'tutor content remains unapproved');
  mode = 'local';
  assert.throws(() => make().start(), /account workspace/);
  await assert.rejects(second.save(fields), /account workspace/);
  mode = 'account';
  const third = make();
  await third.open(id);
  holdSave = true;
  const pending = third.save(fields);
  owner = 'owner-b'; handle = { userId: owner }; generation++;
  holdSave();
  await assert.rejects(pending, /Account or workspace changed/);
  assert.equal(third.current().localRevision, tutor.localRevision,
    'old owner result must not replace editor state');
  owner = 'owner-a'; handle = { userId: owner }; generation++;
  blocked = true;
  assert.throws(() => make().start(), /account workspace/);
  blocked = false;
  assert(!source.slice(begin, end).includes('approveKnowledgeDraft('));
  assert(!source.slice(begin, end).includes('commitAcceptedContext('));
  console.log('PASS KNOWLEDGE K3a: local CAS, offline draft, account isolation, pending lock, tutor provenance, no auto-approval');
})().catch(err => { console.error(err); process.exitCode = 1; });
