-- Both tutor transports authorize the turn and take the posting lock before acknowledging its messages.
create function public.tutor_read_followups(p_owner uuid, p_turn uuid, p_mark_seen boolean)
returns jsonb language plpgsql set search_path='' as $read$
declare unseen integer; items jsonb;
begin
 select count(*) filter (where f.seen_at is null),
  coalesce(jsonb_agg(public.tutor_followup_json(f) order by f.created_at,f.id),'[]'::jsonb)
 into unseen,items from public.tutor_followups f where f.user_id=p_owner and f.turn_id=p_turn;
 if p_mark_seen and unseen>0 then
  update public.tutor_followups set seen_at=clock_timestamp() where user_id=p_owner and turn_id=p_turn and seen_at is null;
 end if;
 return jsonb_build_object('followups',items,'unseen',unseen);
end $read$;
revoke all on function public.tutor_read_followups(uuid,uuid,boolean) from public, anon, authenticated, service_role;

-- Use the same checkpoint lock for reading and acknowledging follow-ups as for posting them.
-- Keep the RPC signature, grants and pre-read seen flags for existing callers.
create or replace function public.tutor_followup_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fconn$
declare
 secret text; verifier text; checkpoint uuid; target_turn uuid;
 mark_seen boolean;
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
 if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' or p_command->>'operation' is distinct from 'followups'
  or (p_command-array['operation','turnId','markSeen'])<>'{}' then
  raise exception 'Invalid tutor follow-up command' using errcode='22023';
 end if;
 target_turn:=(p_command->>'turnId')::uuid;
 mark_seen:=coalesce((p_command->>'markSeen')::boolean,false);
 select h.checkpoint_id into checkpoint
 from public.tutor_turns t join public.tutor_threads h on h.user_id=t.user_id and h.id=t.thread_id
 where t.user_id=p_owner and t.id=target_turn;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 if mark_seen then
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':tutor:'||checkpoint::text,0));
 end if;
 verifier:=public.tutor_connector_verifier(secret,target_turn,p_grant_operation_id);
 if not exists(select 1 from public.command_receipts rc
  join public.tutor_grants g on g.user_id=rc.user_id and g.id::text=rc.result->>'grantId'
  join public.tutor_grant_credentials c on c.grant_id=g.id
  where rc.user_id=p_owner and rc.operation_id=p_grant_operation_id and rc.resource='tutor'
   and rc.trusted_writer_version=1 and rc.result->>'status'='granted'
   and g.turn_id=target_turn and g.revoked_at is null and g.expires_at>clock_timestamp() and c.token_hash=verifier) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 return public.tutor_read_followups(p_owner,target_turn,mark_seen);
end $fconn$;

-- A one-turn bearer has no connector secret or handoff ID. The existing grant command
-- validates the bearer against this exact turn and holds the checkpoint lock for this transaction.
create function public.tutor_grant_followups(p_token_hash text, p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $grant$
declare turn_owner uuid;
begin
 perform public.tutor_grant_command(p_token_hash,jsonb_build_object('operation','get','turnId',p_turn));
 select user_id into strict turn_owner from public.tutor_turns where id=p_turn;
 return public.tutor_read_followups(turn_owner,p_turn,true);
end $grant$;
revoke all on function public.tutor_grant_followups(text,uuid) from public, anon, authenticated;
grant execute on function public.tutor_grant_followups(text,uuid) to service_role;

-- tutor_apply already holds the posting lock after authorizing the claim. Checking at insertion
-- covers both connector transports, including callers that skip a separate follow-up read.
create function public.tutor_require_seen_followups() returns trigger
language plpgsql set search_path='' as $reply$
declare unseen integer;
begin
 select count(*) into unseen from public.tutor_followups
 where user_id=new.user_id and turn_id=new.turn_id and seen_at is null;
 if unseen>0 then
  raise exception using errcode='P2281', message=format(
   'The learner posted %s %s while you were writing. Read the follow-ups with get(what=tutor_followups, id=<handoff ID>), include them in your reply, and send it again.',
   unseen,case when unseen=1 then 'more message' else 'more messages' end);
 end if;
 return new;
end $reply$;
revoke all on function public.tutor_require_seen_followups() from public, anon, authenticated, service_role;
create trigger tutor_reply_require_seen_followups before insert on public.tutor_replies
for each row when (new.provenance='connector') execute function public.tutor_require_seen_followups();
