-- N165: reviewed additive bug-hunt corrections; ordered part 4.
create or replace function public.period_plan_write_blocks(p_user uuid,p_tz text,p_placements jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $write$
declare v_out jsonb := '[]'::jsonb; v_p jsonb; v_block uuid; v_task public.tasks%rowtype; v_deadline public.deadlines%rowtype;
begin
 for v_p in select value from pg_catalog.jsonb_array_elements(p_placements) loop
  v_task := null;v_deadline:=null;
  if v_p->>'task_id' is not null then
   select * into v_task from public.tasks where user_id = p_user and id = (v_p->>'task_id')::uuid for update;
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
   p_tz,'planned',coalesce(v_task.subject_id,v_deadline.subject_id),coalesce(v_task.project_id,v_deadline.project_id),v_task.checkpoint_id,v_task.id,v_deadline.id) returning id into v_block;
  v_out := v_out || pg_catalog.jsonb_build_array(v_p || pg_catalog.jsonb_build_object('block_id',v_block));
 end loop;
 return v_out;
end
$write$;

