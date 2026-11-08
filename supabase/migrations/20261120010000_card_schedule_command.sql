-- N104: card due-date reschedule and reset without changing review grading.
-- All effects occur in one owner-audited, receipt-idempotent transaction.
create function public.card_schedule_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $schedule$
declare
 v_owner uuid:=auth.uid();
 v_role text:=pg_catalog.current_setting('role',true);
 v_operation uuid;v_op text;v_bad text;
 v_target jsonb;v_patch jsonb;v_note_no bigint;v_ord integer;
 v_card public.cards%rowtype;v_action bigint;v_result jsonb;v_previous jsonb;
 v_due timestamptz;v_due_text text;
begin
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authenticated card owner required';end if;
 if pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or p->>'schemaVersion' is distinct from '1'
  or p->>'resource' is distinct from 'card_schedule'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid card scheduling command';end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as x(key)
  where key not in ('schemaVersion','resource','operationId','operation','target','patch')
  limit 1;
 if v_bad is not null then raise exception 'Unexpected card command field';end if;
 v_operation:=(p->>'operationId')::uuid;
 v_op:=p->>'operation';
 if v_op not in ('reschedule','reset') or v_op is null then
  raise exception 'Unknown card scheduling operation';end if;
 v_target:=p->'target';v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
  or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Card target and patch must be objects';end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as x(key)
   where key not in ('noteNo','ord') limit 1;
 if v_bad is not null or (v_target->>'noteNo') !~ '^[1-9][0-9]*$'
  or (v_target->>'ord') !~ '^[1-9][0-9]*$'
  or (v_target->>'noteNo')::numeric>9223372036854775807
  or (v_target->>'ord')::numeric>2147483647 then
  raise exception 'Positive note number and ordinal required';end if;
 v_note_no:=(v_target->>'noteNo')::bigint;
 v_ord:=(v_target->>'ord')::integer;
 if v_op='reset' and v_patch<>'{}'::jsonb then
  raise exception 'Reset does not accept a patch';end if;
 if v_op='reschedule' then
  if (select count(*) from pg_catalog.jsonb_object_keys(v_patch))<>1
   or pg_catalog.jsonb_typeof(v_patch->'due') is distinct from 'string' then
   raise exception 'Reschedule needs exactly one due instant';end if;
  v_due_text:=v_patch->>'due';
  if v_due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Due date must be an explicit offset-aware ISO instant';end if;
  v_due:=v_due_text::timestamptz;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation::text,0));
 select result into v_previous from public.command_receipts
  where user_id=v_owner and operation_id=v_operation;
 if found then
  if v_previous->'_request'=p then return v_previous-'_request';end if;
  return pg_catalog.jsonb_build_object('status','conflict','operationId',v_operation,
   'reason','operationId reused with changed payload','actionNo',null,'changed','[]'::jsonb);
 end if;
 select c.* into v_card from public.cards c
 join public.notes n on n.id=c.note_id and n.user_id=c.user_id
 where c.user_id=v_owner and n.no=v_note_no and c.ord=v_ord
 for update of c;
 if not found then raise exception 'Card not found for owner';end if;
 perform pg_catalog.set_config('lemma.source',
   case when v_role='service_role' and pg_catalog.current_setting('lemma.source',true)
    in ('claude','chatgpt','other','system')
     then pg_catalog.current_setting('lemma.source',true)
    when v_role='service_role' then 'other' else 'app' end,true);
 perform pg_catalog.set_config('lemma.tool','card_schedule',true);
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Card '||v_op,200),true);
 if v_op='reschedule' then
  update public.cards set due=v_due where id=v_card.id and user_id=v_owner
   returning * into v_card;
 else
  update public.cards set state=0,due=pg_catalog.clock_timestamp(),
   stability=0,difficulty=0,last_review=null,step=0,reps=0,lapses=0
  where id=v_card.id and user_id=v_owner returning * into v_card;
 end if;
 select no into v_action from public.actions
  where txid=pg_catalog.txid_current() and user_id=v_owner;
 if v_action is null then raise exception 'Card schedule change lacks audit action';end if;
 v_result:=pg_catalog.jsonb_build_object(
  'status','ok','operationId',v_operation,'actionNo',v_action,
  'changed',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('resource','cards','id',v_card.id)),
  'card',pg_catalog.to_jsonb(v_card));
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation,'card_schedule',
   v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end $schedule$;
revoke all on function public.card_schedule_command(jsonb) from public,anon;
grant execute on function public.card_schedule_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('card_schedule','card_schedule_command',true,
 '{"operations":["reschedule","reset"],"fields":["due"]}'::jsonb);
