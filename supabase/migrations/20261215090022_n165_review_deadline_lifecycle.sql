-- N165 review: keep deadline deletion and creation-undo reversible after planning.
-- Run before the deadline delete is journalled: undo restores the deadline first,
-- then its block links, status and version. Completed blocks retain their history.
create function public.unlink_deadline_blocks() returns trigger
language plpgsql security definer set search_path='' as $unlink$
begin
 update public.calendar_blocks b set deadline_id=null,
  status=case when b.status='planned' then 'cancelled' else b.status end,
  version=b.version+1
 where b.user_id=old.user_id and b.deadline_id=old.id;
 return old;
end $unlink$;
revoke all on function public.unlink_deadline_blocks() from public,anon,authenticated,service_role;
create trigger deadlines_unlink_blocks before delete on public.deadlines
 for each row execute function public.unlink_deadline_blocks();

create or replace function public.period_plan_write_blocks(p_user uuid,p_tz text,p_placements jsonb)
returns jsonb language plpgsql security definer set search_path='' as $write$
declare v_out jsonb:='[]'::jsonb; v_p jsonb; v_block uuid;
 v_task public.tasks%rowtype; v_deadline public.deadlines%rowtype;
begin
 for v_p in select value from pg_catalog.jsonb_array_elements(p_placements) loop
  v_task:=null; v_deadline:=null;
  if v_p->>'task_id' is not null then
   select * into v_task from public.tasks where user_id=p_user and id=(v_p->>'task_id')::uuid for update;
   if not found or v_task.status not in ('backlog','in_progress') or
    (v_p->>'source_version' is not null and v_task.version<>(v_p->>'source_version')::integer) then raise exception 'Task changed after plan preview'; end if;
  end if;
  if v_p->>'deadline_id' is not null then
   select * into v_deadline from public.deadlines where user_id=p_user and id=(v_p->>'deadline_id')::uuid for update;
   if not found or v_deadline.status<>'open' or v_deadline.remaining_minutes<=0 or
    (v_p->>'source_version' is not null and v_deadline.version<>(v_p->>'source_version')::integer) then raise exception 'Deadline changed after plan preview'; end if;
   if v_deadline.due_at is not null and (v_p->>'ends_at')::timestamptz>v_deadline.due_at then raise exception 'Placement exceeds deadline'; end if;
  end if;
  insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,status,subject_id,project_id,checkpoint_id,task_id,deadline_id)
  values(p_user,'study',pg_catalog.left(v_p->>'title',200),(v_p->>'starts_at')::timestamptz,(v_p->>'ends_at')::timestamptz,
   p_tz,'planned',coalesce(v_task.subject_id,v_deadline.subject_id),coalesce(v_task.project_id,v_deadline.project_id),
   coalesce(v_task.checkpoint_id,v_deadline.checkpoint_id),v_task.id,v_deadline.id) returning id into v_block;
  v_out:=v_out||pg_catalog.jsonb_build_array(v_p||pg_catalog.jsonb_build_object('block_id',v_block));
 end loop;
 return v_out;
end $write$;

-- An expired final lease has no worker left to report its terminal failure.
-- Keep live final leases intact; recover lower-attempt claims as before.
create or replace function public.notify_claim(p_user uuid,p_limit integer default 10)
returns table(id bigint,kind text,key text,title text,body text,url text,facts jsonb,status text,sent_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 update public.notifications n set status='failed',reason='push_error',delivery_claimed_at=null
 where n.id in(select q.id from public.notifications q
  where q.user_id=p_user and q.status='queued' and q.delivery_attempts>=8
   and (q.delivery_claimed_at is null or q.delivery_claimed_at<now()-interval '2 minutes')
  order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked);
 return query update public.notifications n set delivery_claimed_at=now(),delivery_attempts=delivery_attempts+1
 where n.id in(select q.id from public.notifications q where q.user_id=p_user and q.status='queued' and q.due_at<=now()
  and (q.delivery_claimed_at is null or q.delivery_claimed_at<now()-interval '2 minutes') and q.delivery_attempts<8
  and not exists(select 1 from public.notify_holds h where h.user_id=q.user_id and h."until">now() and
   (h.scope in ('all',q.kind) or h.scope=q.facts->>'scope' or h.scope=q.key))
  order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked)
 returning n.id,n.kind,n.key,n.title,n.body,n.url,n.facts,n.status,n.sent_at;
end $claim$;

-- Extract only the requested array slots, rather than expanding every row on
-- every page. Bigint arithmetic also accepts valid offsets near the int4 limit.
create or replace function public.owner_export_page(p_snapshot uuid,p_table text default null,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare snapshot jsonb; rows jsonb; total integer; page_end integer;
begin
 if auth.uid() is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
 select data into snapshot from public.owner_export_snapshots
  where id=p_snapshot and user_id=auth.uid() and created_at>now()-interval '15 minutes';
 if not found then raise exception 'Export expired; start again'; end if;
 if p_table is null then
  select coalesce(jsonb_agg(jsonb_build_object('table_name',key) order by key),'[]'::jsonb) into rows from jsonb_object_keys(snapshot) key;
 else
  if not(snapshot?p_table) then raise exception 'Resource not in snapshot'; end if;
  rows:=snapshot->p_table;
 end if;
 total:=jsonb_array_length(rows);
 page_end:=least(total::bigint,p_offset::bigint+p_limit)::integer;
 select coalesce(jsonb_agg(rows->slot order by slot),'[]'::jsonb) into rows
  from pg_catalog.generate_series(p_offset,page_end-1) slot;
 return jsonb_build_object('rows',rows,'nextCursor',case when page_end<total then page_end::text else null end);
end $page$;
