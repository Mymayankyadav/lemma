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
      const publicErrors = new Set(['stale_plan_revision','idempotency_key_reused',
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
    const selected = choice.find(cp => cp.status === 'in_progress') ||
      choice.find(cp => cp.status === 'review_due') ||
      choice.find(cp => cp.status === 'not_started') ||
      choice.find(cp => cp.status === 'blocked');
    if (!selected) return null;
    const sessions = await list(ctx,'learning_sessions',
      'id,state,updated_at',q => q.eq('plan_id',plan.id)
        .eq('state','active').order('updated_at',{ascending:false}).limit(1));
    const sessionId = sessions.length && isUuid(sessions[0].id) ? sessions[0].id : null;
    const recent = sessionId ? await list(ctx,'learning_events',
      'event_id,event_type,payload,seq,created_at',q => q.eq('session_id',sessionId)
        .order('seq',{ascending:false}).limit(50)) : [];
    const attempt = recent.find(e => e.payload?.checkpoint_id === selected.id &&
      (e.event_type === 'attempt' || e.event_type === 'proof_step'));
    const hint = recent.find(e => e.payload?.checkpoint_id === selected.id &&
      e.event_type === 'hint' && Number.isSafeInteger(e.payload?.data?.level));
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
      sourceRefs:selected.sourceRefs
    };
  }

  async function recordEvent({planId,checkpointId,expectedPlanRevision,
    type,payload,eventId,source = null} = {}) {
    if (!isUuid(planId) || !isUuid(eventId) || !revision(expectedPlanRevision) ||
        typeof checkpointId !== 'string' || !checkpointId.trim() ||
        checkpointId.length > 160 || !eventTypes.has(type) || !object(payload) ||
        JSON.stringify(payload).length > 12000 ||
        (source !== null && (typeof source !== 'string' || source.length > 200)))
      throw new Error('Invalid study event');
    const ctx = account();
    // A retry MUST reuse the original event ID and identical payload, even
    // after a lost response. The SQL RPC enforces revision and idempotency.
    const receipt = await authorized(ctx,client => client.rpc('record_study_event',{
      p_plan_id:planId,p_checkpoint_id:checkpointId,
      p_expected_plan_revision:expectedPlanRevision,p_event_type:type,
      p_payload:payload,p_event_id:eventId,p_source:source
    }));
    if (!same(receipt?.eventId,eventId) || !isUuid(receipt?.sessionId) ||
        !Number.isSafeInteger(receipt?.seq) || receipt.seq < 1 ||
        receipt.planRevision !== expectedPlanRevision)
      throw new Error('Invalid study event receipt; retry the same event ID');
    return receipt;
  }
  // P2 introduces durable, unapproved drafts; no tutor or background process
  // may call publication directly from this P1 module.
  async function proposeAmendment() {
    throw new Error('Plan amendment drafts are unavailable until PLAN-01 P2');
  }
  return { ready:false, activeContext,recordEvent,proposeAmendment };
})();
