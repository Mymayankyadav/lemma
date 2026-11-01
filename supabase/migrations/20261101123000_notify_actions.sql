-- NOTIF-1b: atomic, owner-scoped notification actions.
-- Depends on 20261101104000_notifications_base.sql. No live data or cron changes.
-- The notification tables are plumbing and intentionally have no action-log triggers.

create function public.approve_card_proposals(p_user uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $batch$
declare
  proposal_row record;
  proposal_id uuid;
  eligible uuid[] := '{}'::uuid[];
  eligible_numbers bigint[] := '{}'::bigint[];
  all_ids uuid[];
  approved jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  action_number bigint;
begin
  if p_user is null or p_ids is null or cardinality(p_ids)>50 or array_position(p_ids,null) is not null then
    raise exception 'bad_action: expected at most 50 proposal UUIDs';
  end if;
  select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into all_ids
    from unnest(p_ids) as requested(id);

  -- Stable lock order across concurrent batches. Lock first, then perform
  -- approvals, so one transaction and one action journal group are guaranteed.
  for proposal_row in
    select id,no,kind,status from public.proposals
    where user_id=p_user and id=any(all_ids)
    order by id for update
  loop
    if proposal_row.kind='card' and proposal_row.status='pending' then
      eligible:=array_append(eligible,proposal_row.id);
      eligible_numbers:=array_append(eligible_numbers,proposal_row.no);
    else
      skipped:=skipped || to_jsonb('P'||proposal_row.no::text);
    end if;
  end loop;

  for proposal_id in select id from unnest(all_ids) as requested(id)
    where not exists(select 1 from public.proposals p where p.user_id=p_user and p.id=requested.id)
  loop
    skipped:=skipped || to_jsonb(proposal_id::text);
  end loop;

  if cardinality(eligible)=0 then
    return jsonb_build_object('approved',approved,'skipped',skipped,'action',null);
  end if;

  perform pg_catalog.set_config('lemma.source','system',true);
  perform pg_catalog.set_config('lemma.tool','notification',true);
  perform pg_catalog.set_config('lemma.summary',
    left('approve '||(select string_agg('P'||n::text, ', ' order by n)
       from unnest(eligible_numbers) as chosen(n))||' from notification',200),true);

  for proposal_id in select id from unnest(eligible) as chosen(id) loop
    perform public.approve_proposal(proposal_id,null);
  end loop;

  select coalesce(jsonb_agg('P'||n::text order by n),'[]'::jsonb)
    into approved from unnest(eligible_numbers) as chosen(n);
  select no into action_number from public.actions
    where user_id=p_user and txid=pg_catalog.txid_current();
  if action_number is null then raise exception 'Approval did not create a reversible action'; end if;
  return jsonb_build_object('approved',approved,'skipped',skipped,'action',action_number);
end $batch$;

revoke all on function public.approve_card_proposals(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.approve_card_proposals(uuid,uuid[]) to service_role;

create function public.notify_act(
  p_user uuid, p_notification bigint, p_action text, p_extra jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $act$
declare
  notice public.notifications%rowtype;
  result jsonb := '{}'::jsonb;
  ids uuid[];
  hold_scope text;
  hold_until timestamptz;
  owner_zone text;
  owner_rollover integer;
  study_time text;
  local_time timestamp;
  action_number bigint;
  confirm_id bigint;
begin
  if p_user is null or p_notification is null or p_action is null
    or p_action not in ('open','dismiss','later','not_today','approve_cards','undo')
    or p_extra is null or jsonb_typeof(p_extra)<>'object' then
    raise exception 'bad_action';
  end if;

  -- This update is the atomic idempotency claim and serializes concurrent taps.
  update public.notifications set action=p_action,action_at=now(),
    opened_at=case when p_action='open' then now() else opened_at end
    where id=p_notification and user_id=p_user and action is null
    returning * into notice;
  if not found then return jsonb_build_object('status','already_done'); end if;

  if (p_action='approve_cards' and notice.kind<>'tutor')
    or (p_action='undo' and notice.kind<>'confirm') then
    raise exception 'bad_action';
  end if;

  if p_action in ('later','not_today') then
    hold_scope:=coalesce(nullif(p_extra->>'scope',''),notice.kind);
    if length(hold_scope)>120 or length(hold_scope)=0 then raise exception 'bad_action'; end if;
    if p_action='later' then
      hold_until:=now()+case when notice.kind='tutor' then interval '3 hours'
        else interval '2 hours' end;
    elsif notice.kind='rhythm' then
      hold_until:=now()+interval '3 days';
    else
      select time_zone,rollover_hour,coalesce(notify->>'studyTime','19:00')
        into owner_zone,owner_rollover,study_time
        from public.settings where user_id=p_user;
      if not found then raise exception 'bad_action'; end if;
      if study_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]
    insert into public.notify_holds(user_id,scope,"until")
      values(p_user,hold_scope,hold_until)
      on conflict(user_id,scope) do update set "until"=excluded."until";
    result:=jsonb_build_object('hold',hold_scope,'until',hold_until);
  elsif p_action='approve_cards' then
    if jsonb_typeof(p_extra->'ids') is distinct from 'array'
      or jsonb_array_length(p_extra->'ids')>50
      or exists(select 1 from jsonb_array_elements(p_extra->'ids') as item(value)
        where jsonb_typeof(item.value)<>'string'
          or (item.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'bad_action';
    end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids
      from jsonb_array_elements_text(p_extra->'ids') as items(value);
    result:=public.approve_card_proposals(p_user,ids);
    action_number:=(result->>'action')::bigint;
    if action_number is not null then
      insert into public.notifications(
        user_id,kind,key,project_id,title,body,url,facts,due_at,status
      ) values (
        p_user,'confirm','confirm:'||p_notification::text,notice.project_id,
        case when jsonb_array_length(result->'skipped')=0
          then 'Approved '||jsonb_array_length(result->'approved')||' cards'
          else 'Approved '||jsonb_array_length(result->'approved')||' of '||
            jsonb_array_length(result->'approved')+jsonb_array_length(result->'skipped')||' cards' end,
        'Undo is in the app, or here for 48 hours.','#/review',
        jsonb_build_object('action',action_number,'approved',result->'approved','skipped',result->'skipped'),
        now(),'queued'
      ) returning id into confirm_id;
      result:=result || jsonb_build_object('confirmId',confirm_id);
    end if;
  elsif p_action='undo' then
    if (p_extra->>'action') is null
      or (p_extra->>'action') !~ '^[0-9]+$'
      or (p_extra->>'action')::bigint is distinct from (notice.facts->>'action')::bigint then
      raise exception 'bad_action';
    end if;
    result:=public.undo_action(p_user,(p_extra->>'action')::bigint,false);
  end if;
  return jsonb_build_object('status','done','kind',notice.kind) || result;
end $act$;

revoke all on function public.notify_act(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.notify_act(uuid,bigint,text,jsonb) to service_role;

-- Down (run before NOTIF-1a's down):
-- drop function if exists public.notify_act(uuid,bigint,text,jsonb);
-- drop function if exists public.approve_card_proposals(uuid,uuid[]);
 then study_time:='19:00'; end if;
      local_time:=now() at time zone coalesce(owner_zone,'UTC');
      hold_until:=(
        (local_time::date+1)::timestamp + study_time::time
      ) at time zone coalesce(owner_zone,'UTC');
    end if;
    insert into public.notify_holds(user_id,scope,"until")
      values(p_user,hold_scope,hold_until)
      on conflict(user_id,scope) do update set "until"=excluded."until";
    result:=jsonb_build_object('hold',hold_scope,'until',hold_until);
  elsif p_action='approve_cards' then
    if jsonb_typeof(p_extra->'ids') is distinct from 'array'
      or jsonb_array_length(p_extra->'ids')>50
      or exists(select 1 from jsonb_array_elements(p_extra->'ids') as item(value)
        where jsonb_typeof(item.value)<>'string'
          or (item.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'bad_action';
    end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids
      from jsonb_array_elements_text(p_extra->'ids') as items(value);
    result:=public.approve_card_proposals(p_user,ids);
    action_number:=(result->>'action')::bigint;
    if action_number is not null then
      insert into public.notifications(
        user_id,kind,key,project_id,title,body,url,facts,due_at,status
      ) values (
        p_user,'confirm','confirm:'||p_notification::text,notice.project_id,
        'Cards added','Cards are ready to review.','#/review',
        jsonb_build_object('action',action_number,'approved',result->'approved','skipped',result->'skipped'),
        now(),'queued'
      ) returning id into confirm_id;
      result:=result || jsonb_build_object('confirmId',confirm_id);
    end if;
  elsif p_action='undo' then
    if (p_extra->>'action') is null
      or (p_extra->>'action') !~ '^[0-9]+$'
      or (p_extra->>'action')::bigint is distinct from (notice.facts->>'action')::bigint then
      raise exception 'bad_action';
    end if;
    result:=public.undo_action(p_user,(p_extra->>'action')::bigint,false);
  end if;
  return jsonb_build_object('status','done','kind',notice.kind) || result;
end $act$;

revoke all on function public.notify_act(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.notify_act(uuid,bigint,text,jsonb) to service_role;

-- Down (run before NOTIF-1a's down):
-- drop function if exists public.notify_act(uuid,bigint,text,jsonb);
-- drop function if exists public.approve_card_proposals(uuid,uuid[]);
