-- N165: reviewed additive bug-hunt corrections; ordered part 19.
create function public.replay_timer_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $replay$
declare u uuid:=auth.uid(); a uuid:=(p->>'id')::uuid; e public.study_entries%rowtype;
 prior jsonb; result jsonb; op text:=p->>'action'; device text:=p->>'device';
 at_time timestamptz:=to_timestamp((p->>'at')::numeric/1000); base int:=(p->>'version')::int;
 inner_id uuid:=md5((p->>'id')||':timer')::uuid; envelope jsonb; open_kind text;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'version') is distinct from 'number' or
   jsonb_typeof(p->'at') is distinct from 'number' or at_time is null or base is null or op is null or a is null or op not in ('pause','resume','break','finish','save','thought') or
   length(device) not between 1 and 120 or device is null or base<1 or
   (op<>'thought' and (at_time>clock_timestamp() or at_time<clock_timestamp()-interval '7 days')) then raise exception 'Invalid native action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||a::text,0));
 select r.result into result from public.command_receipts r where r.user_id=u and r.operation_id=a;
 if found then
  if result->'_request' is distinct from p then raise exception 'Native action ID reused'; end if;
  return result-'_request';
 end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','replay_timer_action',true);perform set_config('lemma.summary','Replay native timer action',true);
 if op='thought' then
  result:=public.parked_thoughts_command(jsonb_build_object('operationId',inner_id,'schemaVersion',1,
   'resource','parked_thoughts','operation','create','patch',jsonb_build_object('text',p->>'text','study_entry_id',(select id from public.study_entries where user_id=u and id=(p->>'entryId')::uuid))));
  result:=result||jsonb_build_object('outcome','applied');
 else
  select * into e from public.study_entries where id=(p->>'entryId')::uuid and user_id=u for update;
  if not found or e.status not in ('running','paused') then return jsonb_build_object('outcome','skipped'); end if;
  if e.version<>base and not exists(select 1 from public.command_receipts r where r.user_id=u and
    r.result#>>'{_native,entryId}'=e.id::text and r.result#>>'{_native,device}'=device and
    (r.result#>>'{_native,base}')::int=base and (r.result#>>'{_native,version}')::int=e.version and
    (r.result#>>'{_native,at}')::numeric<=(p->>'at')::numeric) then
    return jsonb_build_object('outcome','skipped'); end if;
  if e.lease_device is not null and e.lease_expires_at>clock_timestamp() and e.lease_device<>device then
    return jsonb_build_object('outcome','skipped'); end if;
  if exists(select 1 from public.study_intervals where user_id=u and entry_id=e.id and
     (started_at>at_time or ended_at>at_time)) then raise exception 'Action predates recorded timer history'; end if;
  select kind into open_kind from public.study_intervals where user_id=u and entry_id=e.id and ended_at is null;
  if op='finish' then op:=case when e.status='running' and open_kind='focus' then 'pause' else null end; end if;
  if op is not null then
   if op='break' or (op='resume' and open_kind='break') then
    op:='next_phase';
    if e.lease_device is null or e.lease_expires_at<=clock_timestamp() then
     perform public.study_command(jsonb_build_object('operationId',md5(a::text||':lease')::uuid,'schemaVersion',1,
      'resource','study_entries','operation','take_lease','target',jsonb_build_object('id',e.id),
      'expectedVersion',e.version,'patch',jsonb_build_object('device',device)));
     select * into e from public.study_entries where id=e.id and user_id=u;
    end if;
   end if;
   envelope:=jsonb_build_object('operationId',inner_id,'schemaVersion',1,'resource','study_entries',
    'operation',op,'target',jsonb_build_object('id',e.id),'expectedVersion',e.version,'at',at_time,
    'device',device,'leaseVersion',e.lease_version,'patch',case when op='next_phase' then
      jsonb_build_object('device',device,'lease_version',e.lease_version) else '{}'::jsonb end);
   result:=public.study_command(envelope);
   if result->>'status'<>'ok' then return jsonb_build_object('outcome','skipped'); end if;
  end if;
  select * into e from public.study_entries where id=e.id and user_id=u;
  result:=jsonb_build_object('outcome',case when p->>'action'='finish' then 'finish' else 'applied' end,
   'version',e.version,'_native',jsonb_build_object('entryId',e.id,'base',base,'version',e.version,'at',p->'at','device',device));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,a,'study_entries',result||jsonb_build_object('_request',p));
 return result;
end $replay$;
revoke all on function public.replay_timer_action(jsonb) from public,anon,service_role;
grant execute on function public.replay_timer_action(jsonb) to authenticated;

-- Delivery claims expire. A transient transport failure is retried with a bounded backoff, never recorded as sent.
alter table public.notifications add column delivery_claimed_at timestamptz, add column delivery_attempts integer not null default 0;
