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
let holdSave = null, holdApproval=null, offline=false, submissionMode='confirmed';
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
  },
  async approveKnowledgeDraft(contextId,localRevision,confirmed){
    calls.push(['approve',contextId,localRevision,confirmed]);
    if(holdApproval)return new Promise(resolve=>{holdApproval=()=>resolve({
      ...rows.get(contextId),status:'approved_pending',
      approvedFromLocalRevision:localRevision,requestId:id
    });});
    const old=rows.get(contextId);
    if (!confirmed || old?.status!=='draft' || old.localRevision!==localRevision)
      throw Error('Knowledge draft changed; review before approval');
    const row={...old,status:'approved_pending',localRevision:localRevision+1,
      approvedFromLocalRevision:localRevision,requestId:id,approvedBy:'student'};
    rows.set(contextId,structuredClone(row));
    return structuredClone(row);
  },
  async submitApprovedKnowledgeDraft(contextId){
    const old=rows.get(contextId);
    calls.push(['publish',contextId,old?.requestId]);
    if(old?.status!=='approved_pending'||old?.approvedBy!=='student')
      throw Error('Explicit student approval required');
    if(offline)return {status:'queued',requestId:old.requestId};
    if(submissionMode==='failure')throw Error('Simulated lost response');
    if(submissionMode==='conflict'){
      rows.set(contextId,{...old,status:'needs_review'});
      return {status:'conflict',requestId:old.requestId};
    }
    rows.delete(contextId);
    return {status:'confirmed',revision:1,requestId:old.requestId};
  },
  async inspectKnowledgeConflict(contextId) {
    calls.push(['compare', contextId]);
    const local = structuredClone(rows.get(contextId));
    if (local?.status !== 'needs_review') throw Error('No reviewed stale knowledge conflict');
    return { status: 'needs_review', contextId, local,
      accepted: { context_id: contextId, revision: 4, title: 'Accepted server context',
        context_markdown: 'Latest proof', accepted_json: { schema_version:1,summary:'Current' } } };
  },
  async reopenReviewedKnowledgeConflict(contextId, localRevision, requestId,
    acceptedRevision, studentReviewed) {
    calls.push(['reopen', contextId, localRevision, requestId, acceptedRevision, studentReviewed]);
    const row = rows.get(contextId);
    if (!studentReviewed || row.status !== 'needs_review' || row.localRevision !== localRevision ||
        row.requestId !== requestId || acceptedRevision !== 4)
      throw Error('Knowledge conflict changed; compare again');
    const result = { ...row, status: 'draft', localRevision: localRevision + 1,
      expectedRevision: acceptedRevision, reopenedFromRequestId: requestId };
    delete result.requestId;
    delete result.approvedBy;
    rows.set(contextId, structuredClone(result));
    return structuredClone(result);
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
  const writesBeforeReview=calls.filter(c=>['save','approve','publish'].includes(c[0])).length;
  await assert.rejects(second.approveReviewed(null),/review/);
  await assert.rejects(second.submitApproved(),/Approve a reviewed context/);
  const reviewed=await second.reviewSaved();
  assert.equal(reviewed.status,'draft');
  assert.equal(reviewed.localRevision,2);
  assert.equal(calls.filter(c=>['save','approve','publish'].includes(c[0])).length,
    writesBeforeReview,'review is read-only and never approves or publishes');
  await assert.rejects(second.approveReviewed({...reviewed,title:'tampered'}),/changed/);
  const approved=await second.approveReviewed(reviewed);
  assert.equal(approved.status,'approved_pending');
  assert.equal(approved.approvedFromLocalRevision,2);
  assert.equal(approved.requestId,id);
  assert.equal(calls.filter(c=>c[0]==='publish').length,0,'approval never publishes');
  offline=true;
  const queued=await second.submitApproved();
  assert.equal(queued.status,'queued');
  assert.equal(second.current().status,'approved_pending');
  offline=false;submissionMode='failure';
  await assert.rejects(second.submitApproved(),/lost response/);
  assert.equal(second.current().status,'approved_pending','lost response keeps original approval');
  submissionMode='confirmed';
  const confirmed=await second.submitApproved();
  assert.equal(confirmed.status,'confirmed');
  assert.equal(second.current().status,'published');
  assert.equal(second.current().publishedRevision,1);
  assert.deepEqual(calls.filter(c=>c[0]==='publish').map(c=>c[2]),[id,id,id],
    'offline and lost-response retries preserve exact request ID');
  await assert.rejects(second.submitApproved(),/Approve a reviewed context/);
  rows.set(id, { ...approved, status: 'approved_pending', requestId: id });
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
  const countBeforeCompare = calls.filter(c => c[0] === 'save' || c[0] === 'reopen').length;
  const packet = await second.compareConflict();
  assert.equal(packet.local.requestId, id);
  assert.equal(packet.accepted.revision, 4);
  assert.equal(second.current().status, 'needs_review', 'comparison must not approve or reopen');
  assert.equal(calls.filter(c => c[0] === 'save' || c[0] === 'reopen').length,
    countBeforeCompare, 'read-only comparison cannot write');
  const reopened = await second.reopenConflict(packet);
  assert.equal(reopened.status, 'draft', 'explicitly reopened context is not approved');
  assert.equal(reopened.expectedRevision, 4);
  assert.equal(reopened.localRevision, 4);
  assert.equal(reopened.reopenedFromRequestId, id);
  assert.equal(reopened.requestId, undefined, 'new draft does not reuse original accepted request');
  await assert.rejects(second.reopenConflict(packet), /changed; compare again/);
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
  assert(source.slice(begin,end).includes('approveKnowledgeDraft('));
  assert(source.slice(begin,end).includes('submitApprovedKnowledgeDraft('));
  assert(!source.slice(begin,end).includes('commitAcceptedContext('),
    'UI must call A guarded submission API, never write to cloud directly');
  console.log('PASS KNOWLEDGE K3d: local CAS, reviewed consent, explicit idempotent publication, conflict reopen, account isolation');
})().catch(err => { console.error(err); process.exitCode = 1; });
