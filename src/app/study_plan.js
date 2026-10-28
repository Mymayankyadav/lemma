/* PLAN-01: approved plan reads and account-scoped, append-only study evidence.
 * The Study UI stays hidden until P2–P5 acceptance gates are verified. */
const StudyPlan = (() => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const eventTypes = new Set([
    'objective','question','attempt','hint','feedback','misconception',
    'proof_step','mastery_evidence','source_read','flashcard_link','session_note'
  ]);
  let identityEpoch = 0;
  // Never cache a prior owner's plan or event payload across identity changes.
  if (typeof LemmaAccount !== 'undefined' &&
      typeof LemmaAccount.onIdentityChange === 'function') {
    LemmaAccount.onIdentityChange(() => { identityEpoch++; });
  }
  const isUuid = v => typeof v === 'string' && uuid.test(v);
  const revision = v => Number.isSafeInteger(v) && v >= 1;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const same = (a,b) => typeof a === 'string' && typeof b === 'string' &&
    a.toLowerCase() === b.toLowerCase();

  function account() {
    const client = LemmaAccount.client, userId = LemmaAccount.user?.id;
    if (!client || !isUuid(userId))
      throw new Error('Sign in before accessing a study plan');
    const epoch = identityEpoch;
    const check = () => {
      if (LemmaAccount.client !== client ||
          !same(LemmaAccount.user?.id, userId) || identityEpoch !== epoch)
        throw new Error('Account changed during study request');
    };
    return { client,userId,check };
  }
  async function authorized(context, builder) {
    context.check();
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new Error('Study is offline; no cloud evidence has been recorded');
    const token = await LemmaCloud.accountToken(context.client,context.userId);
    context.check();
    let result;
    try {
      result = await builder(context.client).setHeader('Authorization','Bearer ' + token);
    } catch (_) {
      context.check();
      throw new Error('Study request failed; retry with the same event ID');
    }
    context.check();
    if (result.error) {
      const message = String(result.error.message || '');
      const publicErrors = new Set(['stale_plan_revision','stale_or_missing_context',
        'context_id_required','invalid_plan_payload','idempotency_key_reused',
        'checkpoint_not_in_approved_plan','invalid_study_event']);
      throw new Error(publicErrors.has(message) ? message :
        'Study request failed; retry with the same event ID');
    }
    if (result.data === undefined || result.data === null)
      throw new Error('Study response unavailable');
    return result.data;
  }
  function rows(data) {
    if (!Array.isArray(data)) throw new Error('Invalid study response');
    return data;
  }
  const list = (ctx,table,columns,configure) => authorized(ctx,client => {
    let q = client.from(table).select(columns).eq('user_id',ctx.userId);
    return configure(q);
  }).then(rows);

  async function activeContext() {
    const ctx = account();
    const plans = await list(ctx,'study_plans',
      'id,title,revision,updated_at,plan',
      q => q.order('updated_at',{ascending:false}).limit(1));
    if (!plans.length) return null;
    const plan = plans[0];
    if (!isUuid(plan.id) || !revision(plan.revision)) throw new Error('Invalid plan record');
    const versions = await list(ctx,'study_plan_versions',
      'context_id,context_revision,snapshot',
      q => q.eq('plan_id',plan.id).eq('revision',plan.revision).limit(1));
    // A legacy/unapproved row must never be mistaken for a published revision.
    if (versions.length !== 1 || !object(versions[0].snapshot)) return null;
    const version = versions[0];
    if (version.context_id !== null) {
      if (!isUuid(version.context_id) || !revision(version.context_revision) ||
          typeof LemmaCloudBridge === 'undefined' ||
          typeof LemmaCloudBridge.readAcceptedContext !== 'function')
        throw new Error('Accepted context unavailable for this plan');
      const accepted = await LemmaCloudBridge.readAcceptedContext(
        version.context_id,version.context_revision);
      ctx.check();
      if (!same(accepted?.context_id,version.context_id) ||
          accepted.revision !== version.context_revision)
        throw new Error('Accepted context revision changed');
    }
    const checkpoints = Array.isArray(version.snapshot.checkpoints)
      ? version.snapshot.checkpoints : [];
    const statuses = await list(ctx,'study_checkpoints',
      'checkpoint_id,title,status,progress_details',
      q => q.eq('plan_id',plan.id));
    const state = new Map(statuses.map(item => [item.checkpoint_id,item]));
    const choice = checkpoints.map(cp => {
      const id = cp?.checkpoint_id || cp?.id;
      if (typeof id !== 'string' || !id.trim()) return null;
      const saved = state.get(id);
      return { id, title:saved?.title || cp.title || id,
        objective:cp.objective || '',
        status:saved?.status || cp.status || 'not_started',
        prerequisiteIds:Array.isArray(cp.prerequisite_checkpoint_ids)
          ? cp.prerequisite_checkpoint_ids : [],
        sourceRefs:Array.isArray(cp.source_refs) ? cp.source_refs : [] };
    }).filter(Boolean);
    // Prefer the explicitly in-progress checkpoint. Otherwise recover the
    // latest unfinished proof from the immutable active-session event ledger:
    // record_study_event creates a session, not a checkpoint status update.
    const sessions = await list(ctx,'learning_sessions',
      'id,state,updated_at',q => q.eq('plan_id',plan.id)
        .eq('state','active').order('updated_at',{ascending:false}).limit(1));
    const sessionId = sessions.length && isUuid(sessions[0].id) ? sessions[0].id : null;
    const recent = sessionId ? await list(ctx,'learning_events',
      'event_id,event_type,payload,seq,created_at',q => q.eq('session_id',sessionId)
        .order('seq',{ascending:false}).limit(50)) : [];
    // Keep historical ledger rows intact, but do not display evidence
    // explicitly pinned to an older approved plan as current-revision work.
    // Legacy events without a revision remain readable for compatibility.
    const currentEvents = recent.filter(e =>
      e.payload?.plan_revision == null ||
      e.payload.plan_revision === plan.revision);
    const resumable = new Set(['attempt','proof_step','hint','session_note']);
    const incomplete = new Set(['not_started','review_due','blocked','in_progress']);
    const latestWork = currentEvents.find(e => resumable.has(e.event_type) &&
      typeof e.payload?.checkpoint_id === 'string' &&
      choice.some(cp => cp.id === e.payload.checkpoint_id &&
        incomplete.has(cp.status)));
    const selected = choice.find(cp => cp.status === 'in_progress') ||
      (latestWork && choice.find(cp => cp.id === latestWork.payload.checkpoint_id)) ||
      choice.find(cp => cp.status === 'review_due') ||
      choice.find(cp => cp.status === 'not_started') ||
      choice.find(cp => cp.status === 'blocked');
    if (!selected) return null;
    const attempt = currentEvents.find(e => e.payload?.checkpoint_id === selected.id &&
      (e.event_type === 'attempt' || e.event_type === 'proof_step'));
    const hint = currentEvents.find(e => e.payload?.checkpoint_id === selected.id &&
      e.event_type === 'hint' && Number.isSafeInteger(e.payload?.data?.level));
    // These are read-only excerpts from the immutable event ledger, never
    // checkpoint status changes or evidence of mastery by themselves.
    const latest = type => currentEvents.find(e => e.payload?.checkpoint_id === selected.id &&
      e.event_type === type);
    const detail = type => { const e = latest(type);
      return e && object(e.payload?.data) ? { ...e.payload.data,
        eventId:e.event_id,createdAt:e.created_at } : null; };
    // A second device may finish this session or start a newer one while
    // events are loading. A stable plan revision alone cannot establish that
    // this proof/hint packet still belongs to the active learning session.
    // Re-read only the selected session identity; never rewrite old evidence.
    const currentSessions = await list(ctx,'learning_sessions','id',
      q => q.eq('plan_id',plan.id).eq('state','active')
        .order('updated_at',{ascending:false}).limit(1));
    const currentSessionId = currentSessions.length && isUuid(currentSessions[0].id)
      ? currentSessions[0].id : null;
    if (currentSessionId !== sessionId)
      throw new Error('Active study session changed; reload checkpoint');
    // A different device may publish an amendment while the individual
    // plan/version/checkpoint/event requests are in flight. Do not hand a tutor
    // an old revision as the *current* approved checkpoint after that change.
    // The write RPC still owns CAS; this final owner-scoped read guards display.
    const stillApproved = await list(ctx,'study_plans','id,revision',
      q => q.eq('id',plan.id).limit(1));
    if (stillApproved.length !== 1 || !same(stillApproved[0].id,plan.id) ||
        stillApproved[0].revision !== plan.revision)
      throw new Error('Approved study plan changed; reload checkpoint');
    ctx.check();
    return {
      planId:plan.id,planRevision:plan.revision,
      contextId:version.context_id || null,
      contextRevision:version.context_revision || null,
      checkpoint:{
        id:selected.id,title:selected.title,objective:selected.objective,
        status:selected.status,prerequisiteIds:selected.prerequisiteIds
      },sessionId,lastAttempt:attempt ? {
        eventId:attempt.event_id,type:attempt.event_type,
        payload:attempt.payload.data,createdAt:attempt.created_at
      } : null,
      hintLevel:hint ? Math.max(0,hint.payload.data.level) : 0,
      lastFeedback:detail('feedback'),lastEvidence:detail('mastery_evidence'),
      nextAction:detail('session_note'),
      sourceRefs:selected.sourceRefs
    };
  }

  async function recordEvent({planId,checkpointId,expectedPlanRevision,
    type,payload,eventId,source = null} = {}) {
    if (!isUuid(planId) || !isUuid(eventId) || !revision(expectedPlanRevision) ||
        typeof checkpointId !== 'string' || !checkpointId.trim() ||
        checkpointId.length > 160 || !eventTypes.has(type) || !object(payload) ||
        (source !== null && (typeof source !== 'string' || source.length > 200)))
      throw new Error('Invalid study event');
    // Freeze the JSON wire value by copying it before account-token/network awaits.
    // Without this, caller mutations can change the evidence associated with a
    // stable retry UUID after validation, defeating idempotent intent.
    let wirePayload;
    try {
      const json = JSON.stringify(payload);
      if (typeof json !== 'string' || json.length > 12000)
        throw new Error('Invalid study event');
      wirePayload = JSON.parse(json);
      if (!object(wirePayload)) throw new Error('Invalid study event');
    } catch (_) { throw new Error('Invalid study event'); }
    const ctx = account();
    // A retry MUST reuse the original event ID and identical payload, even
    // after a lost response. The SQL RPC enforces revision and idempotency.
    const receipt = await authorized(ctx,client => client.rpc('record_study_event',{
      p_plan_id:planId,p_checkpoint_id:checkpointId,
      p_expected_plan_revision:expectedPlanRevision,p_event_type:type,
      p_payload:wirePayload,p_event_id:eventId,p_source:source
    }));
    if (!same(receipt?.eventId,eventId) || !isUuid(receipt?.sessionId) ||
        !Number.isSafeInteger(receipt?.seq) || receipt.seq < 1 ||
        receipt.planRevision !== expectedPlanRevision)
      throw new Error('Invalid study event receipt; retry the same event ID');
    return receipt;
  }
  // P2a: a dedicated IndexedDB namespace per authenticated owner. This is
  // durable LOCAL staging, never a cloud write or plan acceptance.
  function openDraftDB(userId) {
    if (typeof indexedDB === 'undefined')
      return Promise.reject(new Error('Durable plan draft storage unavailable'));
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('lemma-plan-drafts-v1-' + userId,3);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('drafts'))
          request.result.createObjectStore('drafts',{keyPath:'planId'});
        if (!request.result.objectStoreNames.contains('receipts'))
          request.result.createObjectStore('receipts',{keyPath:'planId'});
        if (!request.result.objectStoreNames.contains('conflict_archive'))
          request.result.createObjectStore('conflict_archive',{keyPath:'requestId'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Could not open durable plan draft storage'));
      request.onblocked = () => reject(new Error('Plan draft storage upgrade blocked'));
    });
  }
  async function draftTransaction(planId,write,mutate) {
    if (!isUuid(planId)) throw new Error('Invalid study plan ID');
    const ctx = account();
    const db = await openDraftDB(ctx.userId);
    try {
      ctx.check();
      const result = await new Promise((resolve,reject) => {
        let tx;
        try { tx = db.transaction(['drafts','receipts','conflict_archive'],write ? 'readwrite' : 'readonly'); }
        catch (_) { reject(new Error('Plan draft storage unavailable')); return; }
        const store = tx.objectStore('drafts');
        let answer;
        const request = store.get(planId);
        request.onsuccess = () => {
          try { ctx.check(); answer = mutate(request.result || null,store,ctx.userId,tx); }
          catch (e) { tx.abort(); reject(e); }
        };
        request.onerror = () => reject(new Error('Could not read plan draft'));
        tx.oncomplete = () => resolve(answer);
        tx.onabort = () => reject(new Error('Plan draft transaction not saved'));
        tx.onerror = () => reject(new Error('Plan draft transaction failed'));
      });
      ctx.check();
      return result;
    } finally { db.close(); }
  }
  function draftInput(input) {
    if (!object(input) || ['status','approvedBy','studentApproved','requestId',
       'approvedAt'].some(k => Object.hasOwn(input,k)) ||
        !isUuid(input.planId) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !Number.isSafeInteger(input.expectedLocalRevision ?? 0) ||
        (input.expectedLocalRevision ?? 0) < 0 ||
        !object(input.snapshot) ||
        !Array.isArray(input.snapshot.checkpoints) ||
        input.snapshot.checkpoints.length < 1 ||
        input.snapshot.checkpoints.length > 120 ||
        typeof input.changeSummary !== 'string' ||
        !input.changeSummary.trim() || input.changeSummary.length > 4000 ||
        typeof (input.title ?? '') !== 'string' || (input.title ?? '').length > 200 ||
        typeof (input.objective ?? '') !== 'string' ||
        (input.objective ?? '').length > 4000 ||
        (input.contextId != null && !isUuid(input.contextId)) ||
        ((input.contextId == null) !== (input.contextRevision == null)) ||
        (input.contextRevision != null && !revision(input.contextRevision)) ||
        (input.source != null && (typeof input.source !== 'string' ||
          input.source.length > 200)) ||
        (input.proposalId != null && !isUuid(input.proposalId)))
      throw new Error('Invalid plan draft');
    const ids = input.snapshot.checkpoints.map(cp => cp?.checkpoint_id || cp?.id);
    if (ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 160) ||
        new Set(ids).size !== ids.length)
      throw new Error('Invalid or duplicate plan checkpoint IDs');
    // Snapshot before any async storage operation so a caller cannot mutate a
    // queued input and silently change the reviewed proposal.
    let snapshot;
    try { snapshot = JSON.parse(JSON.stringify(input.snapshot)); }
    catch (_) { throw new Error('Invalid plan draft snapshot'); }
    if (JSON.stringify(snapshot).length > 100000)
      throw new Error('Plan draft too large');
    return {
      planId:input.planId,expectedRevision:input.expectedRevision,
      expectedLocalRevision:input.expectedLocalRevision ?? 0,
      contextId:input.contextId ?? null,contextRevision:input.contextRevision ?? null,
      title:input.title ?? '',objective:input.objective ?? '',
      snapshot,changeSummary:input.changeSummary,source:input.source ?? null,
      proposalId:input.proposalId ?? null
    };
  }
  async function savePlanDraft(input) {
    const data = draftInput(input);
    // A caller's ID is stable across an ambiguous local write retry; if absent
    // this method generates one only for a new proposal.
    const draftId = data.proposalId || crypto.randomUUID();
    const base = {...data,draftId};
    delete base.proposalId;
    delete base.expectedLocalRevision;
    return draftTransaction(data.planId,true,(previous,store,ownerId) => {
      if (previous && previous.userId !== ownerId)
        throw new Error('Plan draft account mismatch');
      if (previous?.status !== undefined && previous.status !== 'draft')
        throw new Error('Plan draft is already under approval');
      if (previous?.draftId === draftId) {
        const {localRevision,createdAt,updatedAt,userId,status,...oldFields} = previous;
        if (JSON.stringify(oldFields) !== JSON.stringify(base))
          throw new Error('Plan draft ID reused with changed content');
        return structuredClone(previous);
      }
      if ((previous?.localRevision ?? 0) !== data.expectedLocalRevision)
        throw new Error('Plan draft changed; reload before editing');
      const stamp = Date.now();
      const result = {...base,status:'draft',userId:ownerId,
        localRevision:(previous?.localRevision ?? 0)+1,
        createdAt:previous?.createdAt ?? stamp,updatedAt:stamp};
      store.put(result);
      return structuredClone(result);
    });
  }
  async function readPlanDraft(planId) {
    return draftTransaction(planId,false,row => row ? structuredClone(row) : null);
  }
  async function discardPlanDraft(planId,expectedLocalRevision) {
    if (!revision(expectedLocalRevision))
      throw new Error('Invalid local plan draft revision');
    return draftTransaction(planId,true,(row,store) => {
      if (!row) return false;
      if (row.status !== 'draft' || row.localRevision !== expectedLocalRevision)
        throw new Error('Plan draft changed; reload before deleting');
      store.delete(planId);
      return true;
    });
  }
  // P2b: student consent is a durable local transition. No RPC is called by
  // approval itself. The immutable request key survives offline and crashes.
  async function approvePlanDraft(planId,expectedLocalRevision,studentApproved) {
    if (studentApproved !== true)
      throw new Error('Explicit student approval required for a plan');
    if (!revision(expectedLocalRevision))
      throw new Error('Invalid plan draft revision');
    return draftTransaction(planId,true,(row,store,ownerId) => {
      if (!row || row.userId !== ownerId)
        throw new Error('No plan draft pending review');
      if (row.status === 'approved_pending' &&
          row.approvedFromLocalRevision === expectedLocalRevision)
        return structuredClone(row);
      if (row.status !== 'draft' || row.localRevision !== expectedLocalRevision)
        throw new Error('Plan draft changed; review again before approval');
      if (!row.title.trim())
        throw new Error('Plan needs a title before student approval');
      const approved = {...row,status:'approved_pending',requestId:crypto.randomUUID(),
        localRevision:row.localRevision+1,
        approvedFromLocalRevision:row.localRevision,
        approvedBy:'student',approvedAt:Date.now(),
        attempted:false,attempts:0};
      store.put(approved);
      return structuredClone(approved);
    });
  }
  async function readPlanReceipt(planId) {
    if (!isUuid(planId)) throw new Error('Invalid study plan ID');
    const ctx = account();
    const db = await openDraftDB(ctx.userId);
    try {
      ctx.check();
      const receipt = await new Promise((resolve,reject) => {
        const tx = db.transaction('receipts','readonly');
        let result = null;
        const req = tx.objectStore('receipts').get(planId);
        req.onsuccess = () => { try {
          ctx.check();result = req.result || null;
        } catch (e) { reject(e); } };
        req.onerror = () => reject(new Error('Could not read plan receipt'));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(new Error('Plan receipt storage unavailable'));
        tx.onabort = () => reject(new Error('Plan receipt read interrupted'));
      });
      ctx.check();
      return receipt ? structuredClone(receipt) : null;
    } finally { db.close(); }
  }
  async function markPlanAttempt(planId,requestId) {
    return draftTransaction(planId,true,(row,store) => {
      if (!row || row.status !== 'approved_pending' || row.requestId !== requestId)
        throw new Error('Approved plan request changed');
      const next = {...row,attempted:true,attempts:(row.attempts || 0)+1};
      store.put(next);
      return structuredClone(next);
    });
  }
  async function markPlanConflict(planId,requestId) {
    return draftTransaction(planId,true,(row,store) => {
      if (!row || row.requestId !== requestId)
        throw new Error('Approved plan request changed');
      if (row.status === 'needs_review') return structuredClone(row);
      if (row.status !== 'approved_pending')
        throw new Error('Approved plan request changed');
      const next = {...row,status:'needs_review',conflictAt:Date.now()};
      store.put(next);
      return structuredClone(next);
    });
  }
  async function acknowledgePlan(planId,requestId,acceptedRevision) {
    if (!revision(acceptedRevision))
      throw new Error('Invalid plan publication revision');
    try {
      return await draftTransaction(planId,true,(row,store,userId,tx) => {
        if (!row || row.status !== 'approved_pending' ||
            row.requestId !== requestId ||
            acceptedRevision <= row.expectedRevision)
          throw new Error('Approved plan receipt no longer matches intent');
        const receipt = {planId,userId,requestId,revision:acceptedRevision,
          confirmedAt:Date.now()};
        tx.objectStore('receipts').put(receipt);
        store.delete(planId);
        return structuredClone(receipt);
      });
    } catch (error) {
      // A second tab may have already committed the same immutable receipt.
      const existing = await readPlanReceipt(planId);
      if (existing?.requestId === requestId && existing.revision === acceptedRevision)
        return existing;
      throw error;
    }
  }
  async function submitApprovedPlanDraft(planId) {
    if (!isUuid(planId)) throw new Error('Invalid study plan ID');
    const ctx = account();
    const draft = await readPlanDraft(planId);
    ctx.check();
    if (!draft) {
      const receipt = await readPlanReceipt(planId);
      ctx.check();
      if (receipt) return {status:'confirmed',revision:receipt.revision,
        requestId:receipt.requestId};
      throw new Error('No student-approved plan intent pending');
    }
    if (draft.status === 'needs_review')
      return {status:'conflict',requestId:draft.requestId};
    if (draft.status !== 'approved_pending' ||
        draft.approvedBy !== 'student' || !isUuid(draft.requestId))
      throw new Error('Explicit student approval required before publication');
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return {status:'queued',requestId:draft.requestId};
    const attempt = await markPlanAttempt(planId,draft.requestId);
    ctx.check();
    let serverRevision;
    try {
      serverRevision = await authorized(ctx,client => client.rpc('publish_study_plan',{
        p_plan_id:attempt.planId,
        p_expected_revision:attempt.expectedRevision,
        p_request_id:attempt.requestId,
        p_title:attempt.title,p_objective:attempt.objective,
        p_snapshot:attempt.snapshot,p_change_summary:attempt.changeSummary,
        p_context_id:attempt.contextId,
        p_expected_context_revision:attempt.contextRevision,
        p_author_model:attempt.source
      }));
    } catch (error) {
      ctx.check();
      if (error?.message === 'stale_plan_revision' ||
          error?.message === 'stale_or_missing_context') {
        await markPlanConflict(planId,draft.requestId);
        ctx.check();
        return {status:'conflict',requestId:draft.requestId};
      }
      // The server might have committed before transport failed. Preserve
      // the exact approved snapshot and requestId for retry; never reapprove.
      throw error;
    }
    ctx.check();
    if (!revision(serverRevision) || serverRevision <= draft.expectedRevision)
      throw new Error('Invalid plan publication receipt; retry same request ID');
    const receipt = await acknowledgePlan(planId,draft.requestId,serverRevision);
    ctx.check();
    return {status:'confirmed',revision:receipt.revision,
      requestId:receipt.requestId};
  }
  // P4a: pure diff of two reviewed JSON snapshots. It never reads cloud,
  // edits evidence, reuses another owner's data, or approves an amendment.
  function snapshotGraph(input) {
    if (!object(input)) throw new Error('Invalid study plan snapshot');
    let json;
    try { json = JSON.stringify(input); }
    catch (_) { throw new Error('Invalid study plan snapshot'); }
    if (!json || json.length > 100000) throw new Error('Study plan snapshot too large');
    let snapshot;
    try { snapshot = JSON.parse(json); }
    catch (_) { throw new Error('Invalid study plan snapshot'); }
    if (!object(snapshot) || !Array.isArray(snapshot.checkpoints) ||
        snapshot.checkpoints.length < 1 || snapshot.checkpoints.length > 120)
      throw new Error('Invalid study plan checkpoints');
    const byId = new Map();
    for (const cp of snapshot.checkpoints) {
      if (!object(cp) || (cp.checkpoint_id != null && cp.id != null &&
            cp.checkpoint_id !== cp.id))
        throw new Error('Invalid checkpoint identity');
      const id = cp.checkpoint_id ?? cp.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 160 ||
          byId.has(id)) throw new Error('Duplicate or invalid checkpoint ID');
      const prerequisites = cp.prerequisite_checkpoint_ids ?? [];
      if (!Array.isArray(prerequisites) || prerequisites.length > 120 ||
          prerequisites.some(p => typeof p !== 'string' || !p.trim()) ||
          new Set(prerequisites).size !== prerequisites.length)
        throw new Error('Invalid checkpoint prerequisites');
      byId.set(id,{id,cp,prerequisites});
    }
    for (const {prerequisites} of byId.values()) {
      if (prerequisites.some(id => !byId.has(id)))
        throw new Error('Dangling checkpoint prerequisite');
    }
    const visiting = new Set(),visited = new Set();
    const visit = id => {
      if (visiting.has(id)) throw new Error('Cyclic checkpoint prerequisites');
      if (visited.has(id)) return;
      visiting.add(id);
      for (const p of byId.get(id).prerequisites) visit(p);
      visiting.delete(id);visited.add(id);
    };
    for (const id of byId.keys()) visit(id);
    return {snapshot,byId};
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function diffPlanSnapshots(accepted,proposed) {
    const a=snapshotGraph(accepted),b=snapshotGraph(proposed);
    const added=[],removed=[],modified=[],unchanged=[],requiresReassessment=[];
    const evidenceSensitive = new Set(['mastery_criterion','assessment_prompt',
      'learning_tasks','review_policy']);
    const fieldsChanged = (left,right,skip) => [...new Set([
      ...Object.keys(left),...Object.keys(right)
    ])].filter(k => !skip.has(k) &&
      canonical(left[k]) !== canonical(right[k])).sort();
    for (const id of a.byId.keys()) if (!b.byId.has(id)) removed.push(id);
    for (const [id,newCp] of b.byId) {
      const oldCp = a.byId.get(id);
      if (!oldCp) {added.push(id);continue;}
      const skip=new Set(['id','checkpoint_id','prerequisite_checkpoint_ids']);
      const fields=fieldsChanged(oldCp.cp,newCp.cp,skip);
      const oldDeps=new Set(oldCp.prerequisites),newDeps=new Set(newCp.prerequisites);
      const addedPrerequisites=[...newDeps].filter(x=>!oldDeps.has(x));
      const removedPrerequisites=[...oldDeps].filter(x=>!newDeps.has(x));
      if (fields.length || addedPrerequisites.length || removedPrerequisites.length) {
        const reassess=fields.some(f=>evidenceSensitive.has(f));
        if (reassess) requiresReassessment.push(id);
        modified.push({checkpointId:id,fields,addedPrerequisites,
          removedPrerequisites,requiresReassessment:reassess});
      } else unchanged.push(id);
    }
    const planFieldsChanged=fieldsChanged(a.snapshot,b.snapshot,
      new Set(['checkpoints']));
    const beforeIds=[...a.byId.keys()],afterIds=[...b.byId.keys()];
    return {added,removed,modified,unchanged,planFieldsChanged,
      reordered:canonical(beforeIds.filter(id=>b.byId.has(id))) !==
        canonical(afterIds.filter(id=>a.byId.has(id))),
      requiresReassessment};
  }
  // P4b1: compare only an unapproved local draft against the exact owner-private
  // immutable published version. No student consent or publication is implied.
  async function reviewPendingAmendment(planId) {
    if (!isUuid(planId)) throw new Error('Invalid study plan ID');
    const ctx = account();
    const draft = await readPlanDraft(planId);
    ctx.check();
    if (!draft) return null;
    if (draft.status !== 'draft' || !revision(draft.localRevision))
      throw new Error('Amendment is not an unapproved draft');
    if (!revision(draft.expectedRevision))
      throw new Error('Initial study plan uses the separate approval flow');
    // Read the pinned server version, never use a cache or latest draft as the
    // accepted baseline. The account owner filter applies to every table read.
    const plans = await list(ctx,'study_plans','id,revision',
      q => q.eq('id',planId).limit(1));
    ctx.check();
    if (plans.length !== 1 || !same(plans[0].id,planId) ||
        !revision(plans[0].revision))
      throw new Error('Published study plan unavailable');
    if (plans[0].revision !== draft.expectedRevision)
      return {status:'stale',planId,currentRevision:plans[0].revision,
        expectedRevision:draft.expectedRevision};
    const versions = await list(ctx,'study_plan_versions',
      'revision,context_id,context_revision,snapshot',
      q => q.eq('plan_id',planId).eq('revision',draft.expectedRevision).limit(1));
    ctx.check();
    if (versions.length !== 1 || !object(versions[0].snapshot) ||
        versions[0].revision !== draft.expectedRevision)
      throw new Error('Accepted study plan version unavailable');
    const published = versions[0];
    if (!same(published.context_id ?? '',draft.contextId ?? '') ||
        (published.context_revision ?? null) !== draft.contextRevision)
      return {status:'stale_context',planId,
        expectedRevision:draft.expectedRevision};
    if (published.context_id !== null) {
      if (typeof LemmaCloudBridge === 'undefined' ||
          typeof LemmaCloudBridge.readAcceptedContext !== 'function')
        throw new Error('Accepted context unavailable for amendment review');
      const accepted = await LemmaCloudBridge.readAcceptedContext(
        published.context_id,published.context_revision);
      ctx.check();
      if (!same(accepted?.context_id,published.context_id) ||
          accepted.revision !== published.context_revision)
        throw new Error('Accepted context revision changed');
    }
    const diff = diffPlanSnapshots(published.snapshot,draft.snapshot);
    // Revalidate both sides after every async read: a newer publication or a
    // changed draft cannot be accepted based on this stale preview.
    const latest = await list(ctx,'study_plans','revision',
      q => q.eq('id',planId).limit(1));
    const currentDraft = await readPlanDraft(planId);
    ctx.check();
    if (latest.length !== 1 || latest[0].revision !== draft.expectedRevision ||
        !currentDraft || currentDraft.status !== 'draft' ||
        currentDraft.localRevision !== draft.localRevision ||
        currentDraft.draftId !== draft.draftId ||
        canonical(currentDraft.snapshot) !== canonical(draft.snapshot))
      throw new Error('Amendment changed; reopen review');
    return {status:'review',planId,expectedRevision:draft.expectedRevision,
      expectedLocalRevision:draft.localRevision,draftId:draft.draftId,
      changeSummary:draft.changeSummary,source:draft.source,diff};
  }
  // P4c1: inspect a rejected student-approved intent. The original approval
  // is NOT transferable to another published revision; restart is separate.
  async function reviewConflictedAmendment(planId) {
    if (!isUuid(planId)) throw new Error('Invalid study plan ID');
    const ctx = account();
    const draft = await readPlanDraft(planId);
    ctx.check();
    if (!draft || draft.status !== 'needs_review' ||
        draft.approvedBy !== 'student' || !isUuid(draft.requestId) ||
        !revision(draft.expectedRevision) || !revision(draft.localRevision))
      throw new Error('No rejected student-approved amendment to review');
    const plans = await list(ctx,'study_plans','id,revision',
      q => q.eq('id',planId).limit(1));
    if (plans.length !== 1 || !same(plans[0].id,planId) ||
        !revision(plans[0].revision))
      throw new Error('Latest published study plan unavailable');
    const currentRevision = plans[0].revision;
    const version = async rev => {
      const rows = await list(ctx,'study_plan_versions',
        'revision,context_id,context_revision,snapshot',
        q => q.eq('plan_id',planId).eq('revision',rev).limit(1));
      if (rows.length !== 1 || rows[0].revision !== rev ||
          !object(rows[0].snapshot))
        throw new Error('Immutable study plan version unavailable');
      return rows[0];
    };
    const base = await version(draft.expectedRevision);
    const current = currentRevision === draft.expectedRevision ?
      base : await version(currentRevision);
    if (current.context_id !== null && current.context_id !== undefined) {
      if (!isUuid(current.context_id) || !revision(current.context_revision) ||
          typeof LemmaCloudBridge === 'undefined' ||
          typeof LemmaCloudBridge.readAcceptedContext !== 'function')
        throw new Error('Accepted context unavailable for conflict restart');
      const accepted = await LemmaCloudBridge.readAcceptedContext(
        current.context_id,current.context_revision);
      ctx.check();
      if (!same(accepted?.context_id,current.context_id) ||
          accepted.revision !== current.context_revision)
        throw new Error('Accepted context revision changed');
    }
    const proposedChanges = diffPlanSnapshots(base.snapshot,draft.snapshot);
    const serverChanges = diffPlanSnapshots(base.snapshot,current.snapshot);
    const latestComparison = diffPlanSnapshots(current.snapshot,draft.snapshot);
    const touched = diff => new Set([...diff.added,...diff.removed,
      ...diff.modified.map(item => item.checkpointId)]);
    const changedServer = touched(serverChanges);
    const overlaps = [...touched(proposedChanges)].filter(id => changedServer.has(id));
    const recheck = await list(ctx,'study_plans','id,revision',
      q => q.eq('id',planId).limit(1));
    const unchangedDraft = await readPlanDraft(planId);
    ctx.check();
    if (recheck.length !== 1 || recheck[0].revision !== currentRevision ||
        !unchangedDraft || unchangedDraft.status !== 'needs_review' ||
        unchangedDraft.localRevision !== draft.localRevision ||
        unchangedDraft.requestId !== draft.requestId ||
        canonical(unchangedDraft.snapshot) !== canonical(draft.snapshot))
      throw new Error('Conflict changed; reopen amendment review');
    return {status:'review_conflict',planId,
      originalRequestId:draft.requestId,
      originalRevision:draft.expectedRevision,
      originalLocalRevision:draft.localRevision,
      currentRevision,
      currentContextId:current.context_id ?? null,
      currentContextRevision:current.context_revision ?? null,
      changeSummary:draft.changeSummary,
      proposedChanges,serverChanges,latestComparison,overlapIds:overlaps};
  }
  // Caller must show the conflict diff and receive explicit student consent.
  // A fresh remote read and a single local CAS archive+replace transaction
  // retain the rejected intent even if storage fails partway through.
  async function restartConflictedAmendment(planId,review,studentConfirmed) {
    if (studentConfirmed !== true)
      throw new Error('Explicit student conflict restart required');
    if (!isUuid(planId) || !object(review) ||
        review.status !== 'review_conflict' || review.planId !== planId ||
        !isUuid(review.originalRequestId) ||
        !revision(review.originalRevision) ||
        !revision(review.originalLocalRevision) ||
        !revision(review.currentRevision))
      throw new Error('Invalid conflict review');
    const ctx = account();
    const current = await reviewConflictedAmendment(planId);
    ctx.check();
    if (canonical(current) !== canonical(review))
      throw new Error('Conflict changed; reopen amendment review');
    return draftTransaction(planId,true,(row,store,ownerId,tx) => {
      if (!row || row.userId !== ownerId ||
          row.status !== 'needs_review' ||
          row.localRevision !== current.originalLocalRevision ||
          row.requestId !== current.originalRequestId ||
          row.expectedRevision !== current.originalRevision)
        throw new Error('Conflict changed; reopen amendment review');
      const stamp = Date.now();
      const {requestId,approvedBy,approvedAt,approvedFromLocalRevision,
        attempted,attempts,conflictAt,...unapproved} = row;
      const next = {...unapproved,status:'draft',
        draftId:crypto.randomUUID(),requestId:undefined,
        expectedRevision:current.currentRevision,
        contextId:current.currentContextId,
        contextRevision:current.currentContextRevision,
        localRevision:row.localRevision+1,createdAt:stamp,updatedAt:stamp};
      delete next.requestId;
      tx.objectStore('conflict_archive').put({
        ...structuredClone(row),archivedAt:stamp,
        restartedAsDraftId:next.draftId,
        restartExpectedRevision:current.currentRevision
      });
      store.put(next);
      return structuredClone(next);
    });
  }
  async function readConflictArchive(planId,requestId) {
    if (!isUuid(planId) || !isUuid(requestId))
      throw new Error('Invalid conflict archive key');
    const ctx=account();
    const db=await openDraftDB(ctx.userId);
    try {
      ctx.check();
      const record=await new Promise((resolve,reject) => {
        const tx=db.transaction('conflict_archive','readonly');
        let found=null;
        const req=tx.objectStore('conflict_archive').get(requestId);
        req.onsuccess=()=>{ try {
          ctx.check();found=req.result||null;
        } catch (error) {reject(error);} };
        req.onerror=()=>reject(new Error('Conflict archive read failed'));
        tx.oncomplete=()=>resolve(found);
        tx.onabort=()=>reject(new Error('Conflict archive unavailable'));
      });
      ctx.check();
      if (!record) return null;
      if (record.planId!==planId || record.userId!==ctx.userId)
        throw new Error('Conflict archive owner or plan mismatch');
      return structuredClone(record);
    } finally {db.close();}
  }
  // Tutor proposals are staged only, even when the tutor reports approval.
  async function proposeAmendment(input) {
    const draft = await savePlanDraft(input);
    return draft.draftId;
  }
  return { ready:false, activeContext,recordEvent,proposeAmendment,
    savePlanDraft,readPlanDraft,discardPlanDraft,
    approvePlanDraft,submitApprovedPlanDraft,readPlanReceipt,diffPlanSnapshots,reviewPendingAmendment,
    reviewConflictedAmendment,restartConflictedAmendment,readConflictArchive };
})();
