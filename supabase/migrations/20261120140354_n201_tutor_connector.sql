-- Browser and PostgreSQL derive the same per-turn verifier. Keep the helper
-- private to the two RPC boundaries below.
create function public.tutor_connector_verifier(p_secret text,p_turn uuid,p_operation uuid)
returns text language plpgsql immutable strict security invoker set search_path='' as $verifier$
begin
 return encode(sha256(convert_to(encode(extensions.hmac(
  convert_to('lemma:tutor-connector:v1:'||p_turn::text||':'||p_operation::text,'UTF8'),
  convert_to(p_secret,'UTF8'),'sha256'),'hex'),'UTF8')),'hex');
end $verifier$;
revoke all on function public.tutor_connector_verifier(text,uuid,uuid) from public,anon,authenticated,service_role;

-- The regular connector sees only turns the learner granted to its current URL.
-- Reuse the narrow tutor command's release, ownership, lease and receipt checks.
create function public.tutor_connector_command(
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
  if operation='next' then return result->0; end if;
  return coalesce(result,'[]'::jsonb);
 end if;

 result:=public.tutor_grant_command(verifier,p_command);
 -- The delegated command locks this settings row when it records activity.
 -- If a secret rotation won that race, roll back the delegated command.
 if not exists(select 1 from public.settings s where s.user_id=p_owner and s.connector_secret=secret) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 if operation='get' and result->>'status'='pending' then
  select jsonb_build_object('code',cp.code,'title',cp.title) into checkpoint
  from public.tutor_turns t
  join public.tutor_threads h on h.id=t.thread_id and h.user_id=t.user_id
  join public.checkpoints cp on cp.id=h.checkpoint_id and cp.user_id=h.user_id
  where t.id=target_turn and t.user_id=p_owner;
  if checkpoint is not null then result:=result||jsonb_build_object('checkpoint',checkpoint); end if;
  select right(regexp_replace(rtrim(replace(r.body,chr(13),''), E' \t\n'), '(?s)^.*\n[[:blank:]]*\n',''),1500)
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
revoke all on function public.tutor_connector_command(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tutor_connector_command(uuid,text,uuid,jsonb) to service_role;

create function public.tutor_owner_grant_active(p_turn_id uuid,p_grant_id uuid,p_grant_operation_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $active$
declare owner_id uuid:=auth.uid();
begin
 return public.tutor_plan_released()
 and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
 and not exists(select 1 from public.account_deletion_requests d where d.user_id=owner_id)
 and exists(select 1 from public.tutor_grants g
  join public.tutor_turns t on t.user_id=g.user_id and t.id=g.turn_id
  join public.tutor_grant_credentials c on c.grant_id=g.id
  join public.settings s on s.user_id=g.user_id
  join public.command_receipts r on r.user_id=g.user_id and r.operation_id=p_grant_operation_id
   and r.resource='tutor' and r.trusted_writer_version=1 and r.result->>'status'='granted'
   and r.result->>'grantId'=g.id::text
  where g.user_id=owner_id and g.id=p_grant_id and t.id=p_turn_id and t.status='pending'
   and g.revoked_at is null and g.expires_at>statement_timestamp()
   and c.token_hash=public.tutor_connector_verifier(s.connector_secret,t.id,p_grant_operation_id));
end $active$;
revoke all on function public.tutor_owner_grant_active(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.tutor_owner_grant_active(uuid,uuid,uuid) to authenticated;
