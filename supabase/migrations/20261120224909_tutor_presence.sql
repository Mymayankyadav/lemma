-- Owner-readable presence is updated only after an authorized connector read.
alter table public.tutor_threads add column listener_seen_at timestamptz;

create or replace function public.tutor_connector_command(
 p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb
) returns jsonb language plpgsql security definer set search_path='' as $connector$
declare
 secret text;
 target_turn uuid;
 anchor_grant uuid;
 anchor_thread uuid;
 anchor_sequence bigint;
 operation text:=p_command->>'operation';
 list_pending boolean:=p_command is null and p_grant_operation_id is null;
 result jsonb;
 verifier text;
 previous_question text;
 checkpoint jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'Restricted tutor connector' using errcode='42501';
 end if;
 select s.connector_secret into secret from public.settings s
 where s.user_id=p_owner and encode(sha256(convert_to(s.connector_secret,'UTF8')),'hex')=p_connector_hash;
 if not found or not public.tutor_plan_released()
  or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
  or exists(select 1 from public.account_deletion_requests d where d.user_id=p_owner) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;

 if not list_pending then
  if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object'
   or coalesce(operation,'') not in ('get','claim','renew','reply','next') then
   raise exception 'Invalid tutor connector command' using errcode='22023';
  end if;
  target_turn:=(p_command->>'turnId')::uuid;
  verifier:=public.tutor_connector_verifier(secret,target_turn,p_grant_operation_id);
  select g.id into anchor_grant from public.command_receipts r
  join public.tutor_grants g on g.user_id=r.user_id and g.id::text=r.result->>'grantId'
  join public.tutor_grant_credentials c on c.grant_id=g.id
  where r.user_id=p_owner and r.operation_id=p_grant_operation_id and r.resource='tutor'
   and r.trusted_writer_version=1 and r.result->>'status'='granted'
   and g.turn_id=target_turn and g.revoked_at is null and g.expires_at>clock_timestamp() and c.token_hash=verifier;
  if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
  if operation='next' then
   select t.thread_id,t.sequence into anchor_thread,anchor_sequence
   from public.tutor_turns t join public.tutor_attempts a on a.turn_id=t.id and a.user_id=t.user_id
   where t.user_id=p_owner and t.id=target_turn and t.status='completed'
    and a.grant_id=anchor_grant and a.reason='reply';
   if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
  end if;
 end if;

 if list_pending or operation='next' then
  select jsonb_agg(jsonb_build_object('id',p.turn_id::text||'.'||p.operation_id::text)
     order by p.created_at desc,p.turn_id)
  into result
  from (
   select available.* from (
    select distinct on (g.turn_id) g.turn_id,r.operation_id,g.created_at
    from public.tutor_grants g
    join public.tutor_turns t on t.id=g.turn_id and t.user_id=g.user_id
    join public.tutor_grant_credentials c on c.grant_id=g.id
    join public.command_receipts r on r.user_id=g.user_id and r.resource='tutor'
     and r.trusted_writer_version=1 and r.result->>'status'='granted' and r.result->>'grantId'=g.id::text
    where g.user_id=p_owner and g.revoked_at is null and g.expires_at>clock_timestamp() and t.status='pending'
     and (anchor_thread is null or (t.thread_id=anchor_thread and t.sequence>anchor_sequence))
     and c.token_hash=public.tutor_connector_verifier(secret,g.turn_id,r.operation_id)
    order by g.turn_id,g.created_at desc,g.id
   ) available order by available.created_at desc,available.turn_id limit 10
  ) p;
  if operation='next' then
   update public.tutor_threads
     set listener_seen_at=greatest(listener_seen_at,clock_timestamp())
     where id=anchor_thread and user_id=p_owner;
   return result->0;
  end if;
  -- The pending list contains only live grants from the authenticated connector.
  update public.tutor_threads h set listener_seen_at=greatest(h.listener_seen_at,clock_timestamp())
   where h.user_id=p_owner and exists(
    select 1 from jsonb_array_elements(coalesce(result,'[]'::jsonb)) handoff
     join public.tutor_turns t on t.id=split_part(handoff->>'id','.',1)::uuid
     where t.user_id=h.user_id and t.thread_id=h.id
   );
  return coalesce(result,'[]'::jsonb);
 end if;

 result:=public.tutor_grant_command(verifier,p_command);
 -- The delegated command locks this settings row when it records activity.
 -- If a secret rotation won that race, roll back the delegated command.
 if not exists(select 1 from public.settings s where s.user_id=p_owner and s.connector_secret=secret) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 if operation='get' then
  update public.tutor_threads h set listener_seen_at=greatest(h.listener_seen_at,clock_timestamp())
   from public.tutor_turns t where t.user_id=p_owner and t.id=target_turn and h.user_id=t.user_id and h.id=t.thread_id;
 end if;
 if operation='get' and result->>'status'='pending' then
  if to_regclass('public.tutor_turn_attachments') is not null then
   if exists(select 1 from public.tutor_turn_attachments a where a.user_id=p_owner and a.turn_id=target_turn) then
    result:=result||'{"hasAttachments":true}'::jsonb;
   end if;
  end if;
  select jsonb_build_object('code',cp.code,'title',cp.title) into checkpoint
  from public.tutor_turns t
  join public.tutor_threads h on h.id=t.thread_id and h.user_id=t.user_id
  join public.checkpoints cp on cp.id=h.checkpoint_id and cp.user_id=h.user_id
  where t.id=target_turn and t.user_id=p_owner;
  if checkpoint is not null then result:=result||jsonb_build_object('checkpoint',checkpoint); end if;
  -- Older clients and manual imports have no structured question. Keep their
  -- bounded final-paragraph hint and prefer the exact field whenever present.
  select coalesce(r.next_question,
   right(regexp_replace(rtrim(replace(r.body,chr(13),''), E' \t\n'), '(?s)^.*\n[[:blank:]]*\n',''),1500))
  into previous_question
  from public.tutor_turns target
  join public.tutor_turns prior on prior.user_id=target.user_id and prior.thread_id=target.thread_id
   and prior.sequence<target.sequence
  join public.tutor_replies r on r.user_id=prior.user_id and r.turn_id=prior.id
  where target.user_id=p_owner and target.id=target_turn
  order by prior.sequence desc limit 1;
  if nullif(btrim(previous_question),'') is not null then
   result:=result||jsonb_build_object('previousTutorQuestion',previous_question);
  end if;
 end if;
 return result;
end $connector$;

create or replace function public.tutor_thread_state(p_owner uuid,p_slug text,p_checkpoint uuid,p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $state$
declare
 u uuid:=auth.uid(); cp public.checkpoints%rowtype; h public.tutor_threads%rowtype;
 items jsonb; first_sequence bigint; pending uuid;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to open the tutor' using errcode='42501';
 end if;
 select c.* into cp from public.checkpoints c join public.projects p on p.id=c.project_id and p.user_id=c.user_id
 where c.id=p_checkpoint and c.user_id=u and p.slug=p_slug;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then raise exception 'Checkpoint is unavailable' using errcode='42501'; end if;
 select * into h from public.tutor_threads where user_id=u and checkpoint_id=cp.id;
 select jsonb_agg(public.tutor_turn_json(u,x.id) order by x.sequence),min(x.sequence) into items,first_sequence
 from (select id,sequence from public.tutor_turns where thread_id=h.id and (p_before is null or sequence<p_before)
  order by sequence desc limit 40) x;
 select id into pending from public.tutor_turns where thread_id=h.id and status='pending';
 return jsonb_build_object(
  'readAt',statement_timestamp(),'listenerSeenAt',h.listener_seen_at,
  'head',jsonb_build_object('threadId',h.id,'lastSequence',coalesce(h.last_sequence,0),'pendingTurnId',pending),
  'turns',coalesce(items,'[]'::jsonb),'before',case when first_sequence>1 then first_sequence end,
  'canSubmit',public.tutor_plan_released() and exists(select 1 from public.tutor_release_controls where capability='manual' and enabled),
  'canConnect',public.tutor_plan_released() and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled),
  'recoveredDrafts',coalesce((select jsonb_agg(jsonb_build_object('draftId',d.id,'messageId',d.message_id,'turnId',d.turn_id,'body',d.body) order by d.created_at)
   from public.tutor_recovered_replies d join public.tutor_turns t on t.id=d.turn_id
   where t.thread_id=h.id and t.sequence>=first_sequence and (p_before is null or t.sequence<p_before)),'[]'::jsonb));
end $state$;
