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
  return { captureLocalRecovery, authorize, listRemote, inspect, uploadMissing, importMissing,
    readAcceptedContext, readAcceptedExcerpts, readPinnedAcceptedCitation,
    commitAcceptedContext,
    readKnowledgeDraft, saveKnowledgeDraft, discardKnowledgeDraft,
    approveKnowledgeDraft, submitApprovedKnowledgeDraft, inspectKnowledgeConflict,
    reopenReviewedKnowledgeConflict };
})();

