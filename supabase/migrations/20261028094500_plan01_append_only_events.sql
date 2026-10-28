-- PLAN-01 P1: append-only event evidence and revision-checked, idempotent writes.
-- Applied to Lemma only, after merge by lane A. Existing events are untouched.
revoke all on public.learning_events from anon, authenticated;
grant select, insert on public.learning_events to authenticated;
drop policy if exists lemma_owner on public.learning_events;
create policy learning_events_select_own on public.learning_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy learning_events_insert_own on public.learning_events
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Direct owner inserts remain possible for compatibility. Application writes
-- must use this CAS RPC: it checks the approved snapshot before appending.
create function public.record_study_event(
  p_plan_id uuid, p_checkpoint_id text, p_expected_plan_revision bigint,
  p_event_type text, p_payload jsonb, p_event_id uuid, p_source text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_revision bigint;
  v_snapshot jsonb;
  v_session uuid;
  v_event public.learning_events%rowtype;
  v_existing_plan uuid;
  v_envelope jsonb;
  v_seq bigint;
  v_topic text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_plan_id is null or p_event_id is null or p_expected_plan_revision is null
     or p_expected_plan_revision < 1 or p_checkpoint_id is null
     or length(p_checkpoint_id) not between 1 and 160
     or p_event_type is null or p_event_type not in
       ('objective','question','attempt','hint','feedback','misconception',
        'proof_step','mastery_evidence','source_read','flashcard_link','session_note')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 16384
     or length(coalesce(p_source,'')) > 200 then
    raise exception 'invalid_study_event';
  end if;

  -- The stable caller-supplied event ID is an immutable retry key.
  -- Lock the key even when its row does not yet exist.
  v_envelope := jsonb_build_object(
    'data', p_payload, 'checkpoint_id', p_checkpoint_id,
    'plan_revision', p_expected_plan_revision, 'source', nullif(trim(p_source),''));
  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':plan01-event:' || p_event_id::text, 0));
  select * into v_event from public.learning_events
    where user_id = v_user and event_id = p_event_id;
  if found then
    select plan_id into v_existing_plan from public.learning_sessions
      where user_id = v_user and id = v_event.session_id;
    if v_existing_plan is distinct from p_plan_id
       or v_event.event_type <> p_event_type or v_event.payload <> v_envelope then
      raise exception 'idempotency_key_reused';
    end if;
    return jsonb_build_object('eventId',v_event.event_id,
      'sessionId',v_event.session_id,'seq',v_event.seq,'planRevision',p_expected_plan_revision);
  end if;

  -- Lock the published plan against concurrent publication for this event.
  select revision, title into v_revision, v_topic from public.study_plans
    where user_id = v_user and id = p_plan_id for share;
  if not found or v_revision <> p_expected_plan_revision then
    raise exception 'stale_plan_revision';
  end if;
  select snapshot into v_snapshot from public.study_plan_versions
    where user_id = v_user and plan_id = p_plan_id and revision = v_revision;
  if not found or jsonb_typeof(v_snapshot->'checkpoints') <> 'array'
     or not exists (
       select 1 from jsonb_array_elements(v_snapshot->'checkpoints') c
       where c->>'checkpoint_id' = p_checkpoint_id
          or c->>'id' = p_checkpoint_id
     ) then
    raise exception 'checkpoint_not_in_approved_plan';
  end if;

  select id into v_session from public.learning_sessions
    where user_id = v_user and plan_id = p_plan_id and state = 'active'
    order by updated_at desc, id limit 1 for update;
  if v_session is null then
    insert into public.learning_sessions(user_id,plan_id,topic,state)
      values(v_user,p_plan_id,v_topic,'active') returning id into v_session;
  end if;
  insert into public.learning_events(user_id,event_id,session_id,event_type,payload)
    values(v_user,p_event_id,v_session,p_event_type,v_envelope)
    returning seq into v_seq;
  return jsonb_build_object('eventId',p_event_id,'sessionId',v_session,
    'seq',v_seq,'planRevision',v_revision);
end $$;
revoke all on function public.record_study_event(uuid,text,bigint,text,jsonb,uuid,text)
  from PUBLIC, anon;
grant execute on function public.record_study_event(uuid,text,bigint,text,jsonb,uuid,text)
  to authenticated;
