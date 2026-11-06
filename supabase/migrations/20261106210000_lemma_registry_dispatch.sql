-- N36.2 last registry-backed undo_action replacement. Retains D7 transaction semantics.
create or replace function public.undo_action(p_user uuid, p_no bigint, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  original public.actions%rowtype; c record; later text; inverse_no bigint;
  cols text; assignments text; extra text; changed integer; t text;
begin
  if p_user is null or (coalesce(current_setting('role',true),'') <> 'service_role'
      and auth.uid() is distinct from p_user) then
    raise exception 'Not authorized';
  end if;
  if exists(select 1 from public.actions where txid=txid_current()) then raise exception 'Undo must run in its own transaction'; end if;
  -- Block writers while checking conflicts and applying inverses. A concurrent write
  -- either completes before the check or starts after undo; failures roll back fully.
  for t in select u.table_name from public.lemma_undo_tables u order by u.table_name loop
    execute format('lock table public.%I in share row exclusive mode',t);
  end loop;
  select * into original from public.actions where no=p_no and user_id=p_user for update;
  if not found then raise exception 'A% is not yours',p_no; end if;
  if original.undone_by is not null then raise exception 'A% is already undone (by A%)',p_no,original.undone_by; end if;
  select string_agg('A'||a.no, ', ' order by a.no desc) into later
  from public.actions a where a.user_id=p_user and a.no>p_no and a.undone_by is null
    and exists (select 1 from public.action_changes x join public.action_changes y
      on x.table_name=y.table_name and x.row_pk=y.row_pk
      where x.action_no=p_no and y.action_no=a.no);
  if later is not null then raise exception 'Undo % first',later; end if;
  perform set_config('lemma.source',coalesce(nullif(current_setting('lemma.source',true),''),'app'),true);
  perform set_config('lemma.tool','undo',true);
  perform set_config('lemma.summary',left('undo A'||p_no||': '||coalesce(original.summary,''),200),true);
  set constraints all deferred;
  for c in select * from public.action_changes where action_no=p_no order by seq desc loop
    -- Reject journal entries outside the fixed trigger set.
    if not exists (select 1 from public.lemma_undo_tables u where u.table_name=c.table_name) then
      raise exception 'Unrecognized journal table';
    end if;
    if c.op='insert' then
      execute format('delete from public.%I t where to_jsonb(t) @> $1 and t.user_id=$2',c.table_name) using c.row_pk,p_user;
    elsif c.op='delete' then
      select string_agg(format('%I',a.attname),',' order by a.attnum) into cols
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='';
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I,$1)', c.table_name,cols,cols,c.table_name) using c.old;
    else
      select string_agg(format('%1$I = r.%1$I',a.attname),',' order by a.attnum) into assignments
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity=''
        and c.old -> a.attname is distinct from c.new -> a.attname;
      if assignments is not null then
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t) @> $2 and t.user_id=$3',c.table_name,assignments,c.table_name) using c.old,c.row_pk,p_user;
      end if;
    end if;
  end loop;
  select no into inverse_no from public.actions where txid=txid_current() and user_id=p_user;
  if inverse_no is null or inverse_no=p_no then raise exception 'Undo must run in its own transaction'; end if;
  select string_agg(table_name||' '||n, ', ') into extra from (
    select x.table_name,count(*) n from public.action_changes x
    where x.action_no=inverse_no and x.op='delete' and not exists (
      select 1 from public.action_changes y where y.action_no=p_no and y.table_name=x.table_name and y.row_pk=x.row_pk
    ) group by x.table_name) counts;
  if extra is not null and not p_force then raise exception 'Undo would also remove: %; undo those actions first or confirm',extra; end if;
  update public.actions set undoes=p_no where no=inverse_no;
  update public.actions set undone_by=inverse_no where no=p_no;
  if original.undoes is not null then update public.actions set undone_by=null where no=original.undoes and undone_by=p_no; end if;
  select count(*) into changed from public.action_changes where action_no=inverse_no;
  return jsonb_build_object('undone',p_no,'as',inverse_no,'changes',changed);
end $$;

-- D8(a): service-role-only owner-bound dispatcher for registered commands.
-- Do not introduce per-resource MCP wrappers: new resources register only a
-- command function and schema, and this same dispatcher can call them.
create function public.mcp_command(p_user uuid, p_source text, p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $mcp_dispatch$
declare
  v_resource text;
  v_command_fn text;
  v_mcp_ok boolean;
  v_receipt jsonb;
  v_summary text;
begin
  if coalesce(current_setting('role',true),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user is null then raise exception 'Owner required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  v_resource := nullif(p ->> 'resource','');
  select r.command_fn,r.mcp_ok into v_command_fn,v_mcp_ok
    from public.lemma_command_resources r where r.resource=v_resource;
  if not found then raise exception 'Unknown command resource'; end if;
  if not v_mcp_ok then raise exception 'Resource disabled for MCP'; end if;
  -- The connector validates this owner before dispatch; never trust a claimed
  -- owner or function name in the user-provided command envelope.
  if not exists (select 1 from public.settings where user_id=p_user) then
    raise exception 'Owner not found';
  end if;
  v_summary := case v_command_fn
    when 'study_command' then pg_catalog.concat('Study ',v_resource,' ',p ->> 'operation')
    when 'task_command' then pg_catalog.concat('Task ',p ->> 'operation')
    else pg_catalog.concat(v_resource,' ',p ->> 'operation')
  end;
  -- Preserve D6/D7 MCP bridge owner/source, audit and transaction semantics.
  perform pg_catalog.set_config('lemma.source',p_source,true);
  perform pg_catalog.set_config('lemma.tool','study',true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left(v_summary,200),true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  -- The command function, never its name from p, owns the ordinary optimistic
  -- version, idempotent receipt, journal action and conflict semantics.
  execute pg_catalog.format('select public.%I($1::jsonb)',v_command_fn)
    into v_receipt using p;
  update public.settings set connector_last_seen_at=now(),
    connector_last_client=case when p_source in ('claude','chatgpt','other')
      then p_source else connector_last_client end
    where user_id=p_user;
  return v_receipt;
end
$mcp_dispatch$;

revoke all on function public.mcp_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_command(uuid,text,jsonb) to service_role;
