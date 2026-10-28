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
  return { authorize, listRemote, inspect, uploadMissing, importMissing,
    readAcceptedContext, readAcceptedExcerpts, commitAcceptedContext };
})();

