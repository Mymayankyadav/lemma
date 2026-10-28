/* Explicit account-scoped cloud transfer helpers. */
const LemmaCloudBridge = (() => {
  async function authorize() {
    const client = LemmaAccount.client;
    if (!client) throw new Error('Cloud client unavailable');
    const response = await client.auth.getUser();
    if (response.error || !response.data?.user) throw new Error('Sign in first');
    const userId = response.data.user.id;
    const token = await LemmaCloud.accountToken(client, userId);
    return { client, userId, token };
  }
  async function listRemote(context) {
    const { client, userId, token } = context || await authorize();
    const rows = [];
    let cursor = null;
    for (;;) {
      await LemmaCloud.accountToken(client, userId);
      let query = client.from('notes').select('id,data,revision,deleted_at')
        .eq('user_id', userId).order('id').limit(500);
      if (cursor !== null) query = query.gt('id', cursor);
      const response = await query.setHeader('Authorization', 'Bearer ' + token);
      if (response.error) throw response.error;
      rows.push(...response.data);
      if (response.data.length < 500) break;
      cursor = response.data[response.data.length - 1].id;
    }
    return rows;
  }
  async function inspect() {
    const rows = await listRemote();
    return { local: Model.notes.size, remote: rows.filter(r => !r.deleted_at).length };
  }
  async function uploadMissing() {
    const context = await authorize();
    const { client, userId } = context;
    const snapshots = [...Model.notes.values()].map(n => structuredClone(n));
    await Store.whenSaved();
    const known = new Set((await listRemote(context)).map(r => r.id));
    let copied = 0, skipped = 0;
    for (const note of snapshots) {
      if (known.has(note.id)) { skipped++; continue; }
      const token = await LemmaCloud.accountToken(client, userId);
      const result = await client.rpc('commit_note', {
        p_note_id: note.id, p_expected_revision: 0,
        p_request_id: crypto.randomUUID(),
        p_data: JSON.parse(JSON.stringify(note)), p_delete: false
      }).setHeader('Authorization', 'Bearer ' + token);
      if (result.error) {
        if ((result.error.message || '').includes('stale_note_revision')) {
          skipped++; continue;
        }
        throw new Error('Stopped after ' + copied + ' copies: ' + result.error.message);
      }
      copied++;
    }
    return { copied, skipped };
  }
  async function importMissing() {
    if (Store.mode !== 'local') throw new Error('Browser local storage required');
    const context = await authorize();
    const rows = await listRemote(context);
    let copied = 0, skipped = 0;
    for (const row of rows) {
      await LemmaCloud.accountToken(context.client, context.userId);
      const n = row.data;
      if (row.deleted_at || Model.notes.has(row.id) || !n ||
          n.id !== row.id || typeof n.front !== 'string' ||
          typeof n.back !== 'string' || !Array.isArray(n.log)) {
        skipped++; continue;
      }
      Model.createNote(JSON.parse(JSON.stringify(n)));
      await Store.whenSaved();
      copied++;
    }
    return { copied, skipped };
  }
  // KNOWLEDGE-01 K2d. Only a deliberately accepted owner action can call the
  // structured-context write. No context outbox exists yet: NEVER fake offline
  // durability or silently convert a tutor proposal into accepted state.
  const knowledgeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = value => typeof value === 'string' && knowledgeUuid.test(value);
  const isRevision = (value, zero = false) => Number.isSafeInteger(value) &&
    (zero ? value >= 0 : value > 0);
  const stableKnowledgeErrors = new Set([
    'stale_context_revision','stale_source_revision','idempotency_key_reused',
    'knowledge_context_not_found','knowledge_source_not_found',
    'context_revision_unavailable','structured_context_requires_v1_write',
    'structured_source_not_accepted','structured_evidence_not_found',
    'invalid_structured_context','invalid_context_read','invalid_knowledge_read'
  ]);
  function assertKnowledgeAccount(context) {
    if (LemmaAccount.client !== context.client || LemmaAccount.user?.id !== context.userId)
      throw new Error('Account changed during knowledge request');
  }
  async function knowledgeRpc(name, args) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new Error('Knowledge is offline; reconnect before an accepted write or read');
    const context = await authorize();
    assertKnowledgeAccount(context);
    // Refresh the currently authenticated token at the point of RPC dispatch,
    // not just at the beginning of an asynchronous user gesture.
    const token = await LemmaCloud.accountToken(context.client, context.userId);
    assertKnowledgeAccount(context);
    let response;
    try {
      response = await context.client.rpc(name, args)
        .setHeader('Authorization', 'Bearer ' + token);
    } catch (_) {
      assertKnowledgeAccount(context);
      throw new Error('Knowledge request failed; retry when connected');
    }
    assertKnowledgeAccount(context);
    if (response.error) {
      // Never echo arbitrary PostgREST details or source content into UI/logs.
      const error = String(response.error.message || '');
      throw new Error(stableKnowledgeErrors.has(error) ? error :
        'Knowledge request failed; retry when connected');
    }
    if (response.data === undefined || response.data === null)
      throw new Error('Knowledge response unavailable');
    return response.data;
  }
  async function readAcceptedContext(contextId, revision = null) {
    if (!isUuid(contextId) || (revision !== null && !isRevision(revision)))
      throw new Error('Invalid accepted context reference');
    return knowledgeRpc('get_accepted_study_context', {
      p_context_id: contextId, p_revision: revision
    });
  }
  async function readAcceptedExcerpts(contextId, sourceId, sourceRevision,
    afterSectionId = null, limit = 6) {
    if (!isUuid(contextId) || !isUuid(sourceId) || !isRevision(sourceRevision) ||
        (afterSectionId !== null && !isUuid(afterSectionId)) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 6)
      throw new Error('Invalid knowledge citation reference');
    return knowledgeRpc('get_knowledge_excerpts', {
      p_context_id: contextId, p_source_id: sourceId,
      p_source_revision: sourceRevision, p_after_section_id: afterSectionId,
      p_limit: limit
    });
  }
  // KNOWLEDGE-01 K2i: read an accepted context AND one bounded, explicitly
  // referenced source page. The accepted structured revision selects the
  // immutable source revision; the latest source version is never substituted.
  // This is a read-only packet, not automatic enrollment or acceptance.
  async function readPinnedAcceptedCitation(contextId, sourceId,
    contextRevision = null, afterSectionId = null, limit = 6) {
    if (!isUuid(contextId) || !isUuid(sourceId) ||
        (contextRevision !== null && !isRevision(contextRevision)) ||
        (afterSectionId !== null && !isUuid(afterSectionId)) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 6)
      throw new Error('Invalid knowledge citation reference');
    const client = LemmaAccount.client;
    const userId = LemmaAccount.user?.id;
    const handle = typeof LemmaSync === 'undefined' ? null : LemmaSync.accountHandle();
    if (!client || !userId || !handle || handle.userId !== userId)
      throw new Error('Sign in to an available account cache to read knowledge');
    const check = () => {
      if (LemmaAccount.client !== client || LemmaAccount.user?.id !== userId ||
          LemmaSync.accountHandle() !== handle)
        throw new Error('Account changed during knowledge citation read');
    };
    const context = await readAcceptedContext(contextId, contextRevision);
    check();
    if (!context || typeof context !== 'object' ||
        !isUuid(context.context_id) ||
        context.context_id.toLowerCase() !== contextId.toLowerCase() ||
        !isRevision(context.revision) ||
        (contextRevision !== null && context.revision !== contextRevision) ||
        context.format !== 'structured_v1' ||
        context.accepted_json?.schema_version !== 1 ||
        !Array.isArray(context.accepted_json.source_refs))
      throw new Error('Accepted knowledge revision is not citation-ready');
    const reference = context.accepted_json.source_refs.find(ref =>
      isUuid(ref?.source_id) && ref.source_id.toLowerCase() === sourceId.toLowerCase() &&
      isRevision(ref.revision));
    if (!reference)
      throw new Error('Source is not referenced by this accepted revision');
    const page = await readAcceptedExcerpts(contextId, sourceId, reference.revision,
      afterSectionId, limit);
    check();
    // Fail closed rather than displaying sections from a different context,
    // source revision, or improperly shaped server packet as cited evidence.
    if (!page || typeof page !== 'object' || !isUuid(page.context_id) ||
        page.context_id.toLowerCase() !== contextId.toLowerCase() ||
        !isUuid(page.source_id) ||
        page.source_id.toLowerCase() !== sourceId.toLowerCase() ||
        page.source_revision !== reference.revision ||
        !isRevision(page.context_revision) ||
        page.context_revision > context.revision ||
        !Array.isArray(page.excerpts) || page.excerpts.length > limit ||
        typeof page.has_more !== 'boolean' ||
        page.excerpts.some(item =>
          !isUuid(item?.section_id) || typeof item.locator !== 'string' ||
          typeof item.title !== 'string' || typeof item.text !== 'string' ||
          !/^[0-9a-f]{64}$/i.test(item.sha256 || '')))
      throw new Error('Accepted citation packet is inconsistent; reload');
    return { context, source: page };
  }
  async function commitAcceptedContext({ contextId, expectedRevision, requestId,
    title, markdown, payload, studentApproved } = {}) {
    if (studentApproved !== true)
      throw new Error('Student approval required to accept a study context');
    if (!isUuid(contextId) || !isRevision(expectedRevision, true) ||
        !isUuid(requestId) || typeof title !== 'string' ||
        !title.trim() || typeof markdown !== 'string' ||
        !payload || Array.isArray(payload) || typeof payload !== 'object')
      throw new Error('Invalid accepted context write');
    // Caller owns the durable request key. Never generate a fresh key here:
    // after a lost response the SAME request ID must retry the same payload.
    return knowledgeRpc('commit_structured_study_context', {
      p_context_id: contextId, p_expected_revision: expectedRevision,
      p_request_id: requestId, p_title: title,
      p_context_markdown: markdown, p_payload: payload
    });
  }
  // Export is deliberately an explicit student action; merely attaching an
  // account or refreshing sync never captures personal drafts or queued edits.
  // This is an account-local companion only, NOT a transactional server backup.
  async function captureLocalRecovery(studentRequested = false) {
    if (studentRequested !== true)
      throw new Error('Explicit local account recovery export required');
    const userId = LemmaAccount.user?.id;
    const handle = typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    if (!userId || !handle || handle.userId !== userId ||
        typeof handle.storage?.localRecoverySnapshot !== 'function')
      throw new Error('Sign in to an available account cache before exporting recovery data');
    const result = await handle.storage.localRecoverySnapshot();
    if (LemmaAccount.user?.id !== userId || LemmaSync.accountHandle() !== handle ||
        result?.ownerId !== userId || result.scope !== 'account-local-recovery')
      throw new Error('Account changed during local recovery export');
    return result;
  }
  // Integrity is for accidental file damage only. This is NOT a signed,
  // encrypted, server-consistent snapshot, and cannot authorize a restore.
  const recoveryStores = ['notes','reviews','retractions','outbox','meta'];
  const recoveryByteCap = 64 * 1024 * 1024;
  const recoveryOwner = id => typeof id === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  function validateLocalRecoverySnapshot(snapshot, expectedOwnerId) {
    if (!recoveryOwner(expectedOwnerId) || snapshot?.app !== 'lemma' ||
        snapshot.version !== 1 || snapshot.scope !== 'account-local-recovery' ||
        snapshot.capture !== 'single-indexeddb-readonly-transaction' ||
        snapshot.ownerId !== expectedOwnerId ||
        !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
        !snapshot.stores || Array.isArray(snapshot.stores) ||
        JSON.stringify(Object.keys(snapshot.stores)) !== JSON.stringify(recoveryStores))
      throw new Error('Wrong owner or invalid local recovery snapshot');
    let total = 0;
    const safe = (value, depth = 0, seen = new WeakSet()) => {
      if (depth > 32) throw new Error('Local recovery nesting exceeds safety bound');
      if (value === null || typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))) return;
      if (!value || typeof value !== 'object' || seen.has(value) ||
          // Accept plain JSON records from another JS realm (e.g. IndexedDB
          // Node/VM boundary), while rejecting Date/class/Blob instances.
          (!Array.isArray(value) && Object.getPrototypeOf(value) !== null &&
            Object.getPrototypeOf(Object.getPrototypeOf(value)) !== null))
        throw new Error('Nonportable local recovery data');
      seen.add(value);
      for (const key of Object.keys(value)) {
        if (['__proto__','prototype','constructor'].includes(key))
          throw new Error('Unsafe local recovery field');
        safe(value[key], depth + 1, seen);
      }
      seen.delete(value);
    };
    for (const store of recoveryStores) {
      const entries = snapshot.stores[store], seenKeys = new Set();
      if (!Array.isArray(entries)) throw new Error('Incomplete local recovery store');
      total += entries.length;
      if (total > 200000) throw new Error('Local recovery row cap exceeded');
      for (const row of entries) {
        if (!row || typeof row !== 'object' || Array.isArray(row) ||
            (typeof row.key !== 'string' &&
              !(Number.isSafeInteger(row.key))) ||
            !Object.prototype.hasOwnProperty.call(row,'value'))
          throw new Error('Invalid local recovery row');
        const key = JSON.stringify(row.key);
        if (seenKeys.has(key)) throw new Error('Duplicate local recovery key');
        seenKeys.add(key);
        safe(row.value);
        if (row.value && typeof row.value === 'object' && !Array.isArray(row.value) &&
            ((row.value.userId !== undefined && row.value.userId !== expectedOwnerId) ||
             (row.value.user_id !== undefined && row.value.user_id !== expectedOwnerId)))
          throw new Error('Foreign owner row in local recovery');
      }
    }
    return total;
  }
  async function recoveryDigest(bytes) {
    if (!globalThis.crypto?.subtle?.digest)
      throw new Error('Secure local recovery hashing unavailable');
    const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
  }
  async function captureLocalRecoveryEnvelope(studentRequested = false) {
    if (studentRequested !== true)
      throw new Error('Explicit local recovery file export required');
    const userId = LemmaAccount.user?.id;
    const handle = typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    const snapshot = await captureLocalRecovery(true);
    validateLocalRecoverySnapshot(snapshot,userId);
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    if (bytes.length > recoveryByteCap) throw new Error('Local recovery byte cap exceeded');
    const sha256 = await recoveryDigest(bytes);
    if (LemmaAccount.user?.id !== userId || LemmaSync.accountHandle() !== handle)
      throw new Error('Account changed during local recovery sealing');
    return { app:'lemma',version:1,scope:'account-local-recovery-envelope',
      ownerId:userId,bytes:bytes.length,sha256,snapshot };
  }
  async function verifyLocalRecoveryEnvelope(envelope,expectedOwnerId) {
    if (envelope?.app !== 'lemma' || envelope.version !== 1 ||
        envelope.scope !== 'account-local-recovery-envelope' ||
        envelope.ownerId !== expectedOwnerId ||
        !Number.isSafeInteger(envelope.bytes) ||
        envelope.bytes < 1 || envelope.bytes > recoveryByteCap ||
        !/^[0-9a-f]{64}$/.test(envelope.sha256 || ''))
      throw new Error('Invalid local recovery envelope or owner');
    const rows = validateLocalRecoverySnapshot(envelope.snapshot,expectedOwnerId);
    const bytes = new TextEncoder().encode(JSON.stringify(envelope.snapshot));
    if (bytes.length !== envelope.bytes ||
        await recoveryDigest(bytes) !== envelope.sha256)
      throw new Error('Local recovery checksum or size mismatch');
    return { ownerId:expectedOwnerId, rows, bytes:bytes.length,
      sha256:envelope.sha256, readOnly:true };
  }
  // R2f: deliberately requested, read-only server capture from the R2e RPC.
  // The server uses one STABLE invoker snapshot, but this raw response is NOT a
  // signed/full archive, backup download, or permission to restore anything.
  const workspaceSnapshotKeys=Object.freeze({
    client_mutation_receipts:['request_id'],
    knowledge_section_versions:['source_id','source_revision','section_id'],
    knowledge_source_versions:['source_id','revision'],
    learning_card_links:['note_id','session_id','relation'],
    learning_events:['seq'],
    learning_sections:['id'],
    learning_sessions:['id'],
    learning_sources:['id'],
    notes:['id'],
    profiles:['user_id'],
    review_events:['event_id'],
    review_retractions:['retraction_id'],
    study_checkpoints:['plan_id','checkpoint_id'],
    study_context_files:['id'],
    study_context_revisions:['context_id','revision'],
    study_plan_versions:['plan_id','revision'],
    study_plans:['id'],
    tutor_handoff_receipts:['receipt_id'],
    tutor_handoffs:['session_id']
  });
  const workspaceSnapshotNames=Object.keys(workspaceSnapshotKeys).sort();
  function validateServerWorkspaceSnapshot(value,ownerId) {
    if(!recoveryOwner(ownerId) || !value || typeof value!=='object' ||
       Array.isArray(value) || value.app!=='lemma' ||
       value.schemaVersion!==1 || value.scope!=='account-workspace-raw' ||
       value.capture!=='stable-calling-statement-snapshot' ||
       value.ownerId!==ownerId ||
       !Number.isFinite(Date.parse(value.capturedAt)) ||
       !value.tables || typeof value.tables!=='object' ||
       Array.isArray(value.tables) ||
       JSON.stringify(Object.keys(value.tables).sort())!==
         JSON.stringify(workspaceSnapshotNames))
      throw new Error('Invalid or incomplete server workspace snapshot');
    let count=0;
    for(const name of workspaceSnapshotNames){
      const rows=value.tables[name],keys=workspaceSnapshotKeys[name];
      if(!Array.isArray(rows) || rows.length>100000)
        throw new Error('Server workspace row limit or table mismatch');
      count+=rows.length;
      if(count>200000) throw new Error('Server workspace row limit exceeded');
      const seen=new Set();
      for(const row of rows){
        if(!row || typeof row!=='object' || Array.isArray(row) ||
           row.user_id!==ownerId)
          throw new Error('Foreign owner or invalid workspace row');
        const values=keys.map(k=>row[k]);
        if(values.some(v=>v===null || v===undefined || v==='') ||
           values.some(v=>typeof v==='number' && !Number.isSafeInteger(v)))
          throw new Error('Missing or unsafe server workspace primary key');
        const id=JSON.stringify(values);
        if(seen.has(id)) throw new Error('Duplicate server workspace primary key');
        seen.add(id);
      }
    }
    let bytes;
    try { bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength; }
    catch { throw new Error('Nonportable server workspace payload'); }
    if(bytes>recoveryByteCap) throw new Error('Server workspace byte limit exceeded');
    return {snapshot:value,ownerId,count,bytes,readOnly:true};
  }
  async function captureServerWorkspaceSnapshot(studentRequested=false){
    if(studentRequested!==true)
      throw new Error('Explicit server workspace export required');
    const ownerId=LemmaAccount.user?.id;
    const client=LemmaAccount.client;
    const handle=typeof LemmaSync!=='undefined' ? LemmaSync.accountHandle() : null;
    if(!recoveryOwner(ownerId) || !client || !handle ||
       handle.userId!==ownerId)
      throw new Error('Sign in to an available account workspace before export');
    const check=()=>{
      if(LemmaAccount.user?.id!==ownerId || LemmaAccount.client!==client ||
         LemmaSync.accountHandle()!==handle)
        throw new Error('Account changed during server workspace snapshot');
    };
    const auth=await authorize();
    check();
    if(auth.userId!==ownerId || auth.client!==client || !auth.token)
      throw new Error('Authenticated workspace owner changed');
    const response=await client.rpc('capture_account_workspace_snapshot')
      .setHeader('Authorization','Bearer '+auth.token);
    check();
    if(response.error || !response.data)
      throw new Error('Server workspace snapshot unavailable');
    const verified=validateServerWorkspaceSnapshot(response.data,ownerId);
    check();
    return verified;
  }

  // R2g. Pin the same exact source migrations checked by F's archive guard.
  // Future source migrations must explicitly update this inventory and tests.
  const workspaceArchiveVersions=Object.freeze([
    '20261026085028','20261026090019','20261026090746',
    '20261026090844','20261026090959','20261026091125',
    '20261026121817','20261026130428','20261026153542',
    '20261028031800','20261028043000','20261028051500',
    '20261028094500','20261028120000','20261028163000'
  ]);
  function archiveCanonical(value,depth=0) {
    if(depth>32) throw new Error('Workspace archive nesting exceeds limit');
    if(value===null || typeof value==='string' || typeof value==='boolean')
      return JSON.stringify(value);
    if(typeof value==='number' && Number.isFinite(value))
      return JSON.stringify(value);
    if(Array.isArray(value))
      return '['+value.map(item=>archiveCanonical(item,depth+1)).join(',')+']';
    if(!value || typeof value!=='object')
      throw new Error('Nonportable workspace archive value');
    const keys=Object.keys(value).sort();
    if(keys.some(key=>['__proto__','constructor','prototype'].includes(key)))
      throw new Error('Unsafe workspace archive key');
    return '{'+keys.map(key=>JSON.stringify(key)+':'+
      archiveCanonical(value[key],depth+1)).join(',')+'}';
  }
  const archiveRowKey=(table,row)=>workspaceSnapshotKeys[table]
    .map(key=>archiveCanonical(row[key])).join('|');
  function sortedArchiveRows(table,rows){
    return [...rows].sort((a,b)=>archiveRowKey(table,a)
      .localeCompare(archiveRowKey(table,b)));
  }
  function verifyArchiveReferences(tables){
    const relationships=[
      ['learning_sessions','plan_id','study_plans','id'],
      ['tutor_handoffs','session_id','learning_sessions','id'],
      ['tutor_handoff_receipts','plan_id','study_plans','id'],
      ['learning_events','session_id','learning_sessions','id'],
      ['study_plan_versions','plan_id','study_plans','id'],
      ['study_plan_versions','context_id','study_context_files','id'],
      ['study_checkpoints','plan_id','study_plans','id'],
      ['study_checkpoints','last_evidence_event_id','learning_events','event_id'],
      ['study_context_revisions','context_id','study_context_files','id'],
      ['learning_sections','source_id','learning_sources','id'],
      ['knowledge_source_versions','source_id','learning_sources','id'],
      ['knowledge_source_versions','context_id','study_context_files','id'],
      ['learning_card_links','note_id','notes','id'],
      ['learning_card_links','session_id','learning_sessions','id'],
      ['review_events','note_id','notes','id'],
      ['review_retractions','target_event_id','review_events','event_id']
    ];
    for(const [from,field,to,target] of relationships){
      const ids=new Set(tables[to].map(row=>archiveCanonical(row[target])));
      for(const row of tables[from]){
        if(row[field]!=null && !ids.has(archiveCanonical(row[field])))
          throw new Error('Dangling workspace archive '+from+'.'+field);
      }
    }
    const accepted=new Set(tables.knowledge_source_versions.map(row=>
      archiveCanonical([row.source_id,row.revision])));
    for(const row of tables.knowledge_section_versions){
      if(!accepted.has(archiveCanonical([row.source_id,row.source_revision])))
        throw new Error('Missing exact source revision in archive');
    }
    const unique={
      learning_events:'event_id',
      study_context_revisions:'request_id',
      knowledge_source_versions:'request_id',
      review_retractions:'target_event_id'
    };
    for(const [table,field] of Object.entries(unique)){
      const seen=new Set();
      for(const row of tables[table]){
        if(row[field]==null) continue;
        const key=archiveCanonical(row[field]);
        if(seen.has(key))throw new Error('Duplicate archive unique '+table+'.'+field);
        seen.add(key);
      }
    }
    for(const table of workspaceSnapshotNames){
      for(const row of tables[table]){
        for(const field of ['seq','revision','source_revision','context_revision']){
          if(row[field]!=null && (!Number.isSafeInteger(row[field]) ||
             row[field]<0))
            throw new Error('Unsafe workspace archive revision/sequence');
        }
      }
    }
  }
  // The caller must deliberately request one authenticated read. SHA-256
  // detects accidental corruption but does not authenticate a file or grant
  // authority to restore. No export/download or write is performed here.
  async function sealServerWorkspaceArchive(studentRequested=false){
    if(studentRequested!==true)
      throw new Error('Explicit server archive export required');
    const ownerId=LemmaAccount.user?.id, client=LemmaAccount.client;
    const handle=typeof LemmaSync!=='undefined' ? LemmaSync.accountHandle() : null;
    if(!recoveryOwner(ownerId)||!client||!handle||handle.userId!==ownerId)
      throw new Error('Sign in to an available workspace before archive');
    const check=()=>{
      if(LemmaAccount.user?.id!==ownerId||LemmaAccount.client!==client||
         LemmaSync.accountHandle()!==handle)
        throw new Error('Account changed while sealing server archive');
    };
    const result=await captureServerWorkspaceSnapshot(true);
    check();
    const raw=result.snapshot;
    // Clone so a stale mutable response cannot change during async hashing.
    const tables=structuredClone(raw.tables);
    validateServerWorkspaceSnapshot({...raw,tables},ownerId);
    verifyArchiveReferences(tables);
    const canonicalTables=archiveCanonical(tables);
    if(new TextEncoder().encode(canonicalTables).byteLength>recoveryByteCap)
      throw new Error('Workspace archive canonical byte limit exceeded');
    const counts={}, hashes={};
    for(const table of workspaceSnapshotNames){
      const rows=sortedArchiveRows(table,tables[table]);
      counts[table]=rows.length;
      hashes[table]=await recoveryDigest(new TextEncoder()
        .encode(archiveCanonical(rows)));
      check();
    }
    const migrations=[...workspaceArchiveVersions];
    const exportedAt=raw.capturedAt;
    const manifestInput={app:'lemma',version:2,
      scope:'account-workspace',capture:'transactional',
      ownerId,exportedAt,migrations,counts,hashes};
    const sha256=await recoveryDigest(new TextEncoder()
      .encode(archiveCanonical(manifestInput)));
    check();
    return {app:'lemma',version:2,scope:'account-workspace',
      capture:'transactional',ownerId,exportedAt,migrations,tables,
      manifest:{counts,hashes,sha256}};
  }

  // LOCAL unaccepted drafts only. These are stored in the existing
  // account-namespaced IndexedDB cache; no network required after attach.
  // An in-flight save may finish under the *old* owner after logout, so
  // recheck the active handle before revealing any old-owner draft.
  async function withKnowledgeDraftStorage(action) {
    const userId = LemmaAccount.user?.id;
    const handle = typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    if (!userId || !handle || handle.userId !== userId)
      throw new Error('Sign in to an available account cache to edit knowledge drafts');
    const result = await action(handle.storage);
    if (LemmaAccount.user?.id !== userId || LemmaSync.accountHandle() !== handle)
      throw new Error('Account changed; previous owner draft remains saved');
    return result;
  }
  async function readKnowledgeDraft(contextId) {
    if (!isUuid(contextId)) throw new Error('Invalid knowledge context reference');
    return withKnowledgeDraftStorage(storage => storage.knowledgeDraft(contextId));
  }
  async function saveKnowledgeDraft(input) {
    if (!input || !isUuid(input.contextId))
      throw new Error('Invalid knowledge context reference');
    return withKnowledgeDraftStorage(storage => storage.saveKnowledgeDraft(input));
  }
  async function discardKnowledgeDraft(contextId, expectedLocalRevision) {
    if (!isUuid(contextId)) throw new Error('Invalid knowledge context reference');
    return withKnowledgeDraftStorage(storage =>
      storage.discardKnowledgeDraft(contextId, expectedLocalRevision));
  }
  async function approveKnowledgeDraft(contextId, expectedLocalRevision, studentApproved) {
    if (!isUuid(contextId)) throw new Error('Invalid knowledge context reference');
    if (studentApproved !== true) throw new Error('Explicit student approval required');
    return withKnowledgeDraftStorage(storage =>
      storage.approveKnowledgeDraft(contextId, expectedLocalRevision, studentApproved));
  }
  // The student consent was persisted by approveKnowledgeDraft. Submission
  // MUST reuse its original immutable requestId and expected server revision.
  // No tutor proposal can call this API before that explicit transition.
  async function submitApprovedKnowledgeDraft(contextId) {
    if (!isUuid(contextId)) throw new Error('Invalid knowledge context reference');
    const userId = LemmaAccount.user?.id;
    const handle = typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    if (!userId || !handle || handle.userId !== userId)
      throw new Error('Sign in to an available account cache to submit knowledge');
    const check = () => {
      if (LemmaAccount.user?.id !== userId || LemmaSync.accountHandle() !== handle)
        throw new Error('Account changed during knowledge submission');
    };
    const storage = handle.storage;
    const draft = await storage.knowledgeDraft(contextId);
    check();
    if (!draft) {
      const receipt = await storage.knowledgeIntentReceipt(contextId);
      check();
      if (receipt) return {status:'confirmed',revision:receipt.revision,requestId:receipt.requestId};
      throw new Error('No approved knowledge intent pending');
    }
    if (draft.status === 'needs_review')
      return {status:'conflict',requestId:draft.requestId};
    if (draft.status !== 'approved_pending' || draft.approvedBy !== 'student' ||
        !isUuid(draft.requestId))
      throw new Error('Explicit student approval required before submission');
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return {status:'queued',requestId:draft.requestId};
    const attempted = await storage.markKnowledgeIntentAttempt(contextId,draft.requestId);
    check();
    let revision;
    try {
      revision = await commitAcceptedContext({
        contextId,expectedRevision:attempted.expectedRevision,
        requestId:attempted.requestId,title:attempted.title,
        markdown:attempted.markdown,payload:attempted.payload,
        studentApproved:true
      });
    } catch (err) {
      check();
      if (err?.message === 'stale_context_revision') {
        await storage.markKnowledgeIntentConflict(contextId,draft.requestId);
        check();
        return {status:'conflict',requestId:draft.requestId};
      }
      // Transport may have committed before the response was lost: keep
      // attempted:true and retry the SAME key. Do not invent a new intent.
      throw err;
    }
    check();
    if (!Number.isSafeInteger(revision) || revision <= attempted.expectedRevision)
      throw new Error('Invalid knowledge acceptance receipt');
    const receipt = await storage.acknowledgeKnowledgeIntent(contextId,draft.requestId,revision);
    check();
    return {status:'confirmed',revision:receipt.revision,requestId:receipt.requestId};
  }
  // K2h1: prepare a read-only, account-scoped comparison packet after a
  // stale approved intent. Never rebase or approve a new revision on read.
  async function inspectKnowledgeConflict(contextId) {
    if (!isUuid(contextId)) throw new Error('Invalid knowledge context reference');
    const userId = LemmaAccount.user?.id;
    const client = LemmaAccount.client;
    const handle = typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    if (!userId || !client || !handle || handle.userId !== userId)
      throw new Error('Sign in to an available account cache to inspect knowledge');
    const check = () => {
      if (LemmaAccount.user?.id !== userId || LemmaAccount.client !== client ||
          LemmaSync.accountHandle() !== handle)
        throw new Error('Account changed during knowledge conflict inspection');
    };
    const local = await handle.storage.knowledgeDraft(contextId);
    check();
    if (!local || local.userId !== userId || local.status !== 'needs_review' ||
        local.approvedBy !== 'student' || !isUuid(local.requestId) ||
        !isRevision(local.localRevision) || !isRevision(local.expectedRevision, true))
      throw new Error('No reviewed stale knowledge conflict in this account');
    // get_accepted_study_context is an authenticated owner-filtered RPC. Its
    // current revision is deliberately fetched, not the stale local revision.
    const accepted = await readAcceptedContext(contextId);
    check();
    if (!accepted || typeof accepted !== 'object' ||
        typeof accepted.context_id !== 'string' ||
        accepted.context_id.toLowerCase() !== contextId.toLowerCase() ||
        !isRevision(accepted.revision) || accepted.revision <= local.expectedRevision)
      throw new Error('Accepted knowledge revision unavailable for comparison');
    // Another tab can resolve the conflict while this remote read is pending.
    // Do not project an outdated local-vs-remote packet as current.
    const latest = await handle.storage.knowledgeDraft(contextId);
    check();
    if (!latest || latest.status !== 'needs_review' ||
        latest.localRevision !== local.localRevision ||
        latest.requestId !== local.requestId)
      throw new Error('Knowledge conflict changed during inspection');
    return { status: 'needs_review', contextId:local.contextId,
      local:latest, accepted };
  }
  // K2h2: a deliberate student gesture may reopen a stale approved intent
  // as an UNAPPROVED local draft. Inspect the latest owner-only server state
  // first; never treat comparison or reopening as a cloud acceptance.
  async function reopenReviewedKnowledgeConflict(contextId, expectedLocalRevision,
    requestId, acceptedRevision, studentReviewed) {
    if (!isUuid(contextId) || !isUuid(requestId) ||
        !isRevision(expectedLocalRevision) || !isRevision(acceptedRevision) ||
        studentReviewed !== true)
      throw new Error('Explicit reviewed knowledge conflict choice required');
    const userId=LemmaAccount.user?.id, client=LemmaAccount.client;
    const handle=typeof LemmaSync !== 'undefined' ? LemmaSync.accountHandle() : null;
    if (!userId || !client || !handle || handle.userId!==userId)
      throw new Error('Sign in to an available account cache to review knowledge');
    const check=()=>{
      if (LemmaAccount.user?.id!==userId || LemmaAccount.client!==client ||
          LemmaSync.accountHandle()!==handle)
        throw new Error('Account changed during knowledge conflict review');
    };
    const previous=await handle.storage.knowledgeDraft(contextId);
    check();
    // Retry after a lost local response is safe and does not fetch or
    // regenerate a different server base. Edits after reopening invalidate it.
    if (previous?.status==='draft' &&
        previous.reopenedFromRequestId===requestId &&
        previous.reopenedFromLocalRevision===expectedLocalRevision &&
        previous.localRevision===expectedLocalRevision+1 &&
        previous.expectedRevision===acceptedRevision)
      return previous;
    const packet=await inspectKnowledgeConflict(contextId);
    check();
    if (packet.local.localRevision!==expectedLocalRevision ||
        packet.local.requestId!==requestId ||
        packet.accepted.revision!==acceptedRevision)
      throw new Error('Knowledge conflict changed; compare again');
    const draft=await handle.storage.reopenKnowledgeConflictDraft(
      contextId,expectedLocalRevision,requestId,acceptedRevision,true);
    check();
    return draft;
  }
  return { captureLocalRecovery, captureLocalRecoveryEnvelope, verifyLocalRecoveryEnvelope,
    captureServerWorkspaceSnapshot, validateServerWorkspaceSnapshot,
    sealServerWorkspaceArchive,
    authorize, listRemote, inspect, uploadMissing, importMissing,
    readAcceptedContext, readAcceptedExcerpts, readPinnedAcceptedCitation,
    commitAcceptedContext,
    readKnowledgeDraft, saveKnowledgeDraft, discardKnowledgeDraft,
    approveKnowledgeDraft, submitApprovedKnowledgeDraft, inspectKnowledgeConflict,
    reopenReviewedKnowledgeConflict };
})();

