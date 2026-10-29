-- Connector-only transaction boundary. Commands never accept an owner from a chat.
create function public.mcp_commit(p_user uuid,p_tool text,p_source text,p_summary text,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; tbl text; vals jsonb; cols text; sets text; result jsonb; affected int; a bigint; fn text; d jsonb;
begin
 if p_user is null or not exists(select 1 from public.settings where user_id=p_user) then raise exception 'Owner not found'; end if;
 if jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands)>150 then raise exception 'Invalid command batch'; end if;
 perform set_config('lemma.source',p_source,true); perform set_config('lemma.tool',p_tool,true); perform set_config('lemma.summary',left(p_summary,200),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','service_role')::text,true);
 for c in select jsonb_array_elements(p_commands) loop
  if c->>'op'='rpc' then
   fn:=c->>'fn'; vals:=c->'args';
   case fn
    when 'approve_proposal','reject_proposal' then
     if not exists(select 1 from public.proposals where id=(vals->>'p_id')::uuid and user_id=p_user) then raise exception 'Proposal not found'; end if;
     if fn='approve_proposal' then result:=public.approve_proposal((vals->>'p_id')::uuid); else perform public.reject_proposal((vals->>'p_id')::uuid); end if;
    when 'save_progress' then
     if (vals->>'p_user_id')::uuid is distinct from p_user then raise exception 'Owner mismatch'; end if;
     result:=public.save_progress(p_user,(vals->>'p_project_id')::uuid,(vals->>'p_session_id')::uuid,(vals->'p_payload')-'diagnostics');
     for d in select jsonb_array_elements(coalesce(vals->'p_payload'->'diagnostics','[]')) loop
      insert into public.diagnostics(user_id,project_id,session_id,kind,topic,evidence,severity,status)
      values(p_user,(vals->>'p_project_id')::uuid,(vals->>'p_session_id')::uuid,d->>'kind',d->>'topic',d->>'evidence',coalesce((d->>'severity')::smallint,1),case when (d->>'confirmed')::boolean then 'confirmed' else 'open' end)
      on conflict(project_id,kind,lower(topic)) do update set evidence=excluded.evidence,severity=excluded.severity,times=public.diagnostics.times+1,last_seen_at=now(),session_id=excluded.session_id,status=case when (d->>'confirmed')::boolean then 'confirmed' else public.diagnostics.status end;
     end loop;
    when 'reconcile_cards' then
     if not exists(select 1 from public.notes where id=(vals->>'p_note')::uuid and user_id=p_user) then raise exception 'Note not found'; end if;
     perform public.lemma_reconcile_cards(p_user,(vals->>'p_note')::uuid);
    when 'record_review' then
     if not exists(select 1 from public.cards where id=(vals->>'p_card')::uuid and user_id=p_user and reps=(vals->'expected'->>'reps')::int and due=(vals->'expected'->>'due')::timestamptz) then raise exception 'Card changed; review again'; end if;
     result:=to_jsonb(public.record_review((vals->>'p_card')::uuid,(vals->>'p_rating')::int,vals->>'p_confidence',coalesce((vals->>'p_duration_ms')::int,0),vals->'p_next'));
    when 'undo_action' then result:=public.undo_action(p_user,(vals->>'p_no')::bigint,coalesce((vals->>'p_force')::boolean,false));
    else raise exception 'RPC not allowed';
   end case;
  else
   tbl:=c->>'table';
   if tbl<>all(array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics']) then raise exception 'Table not allowed'; end if;
   vals:=coalesce(c->'values','{}');
   if c->>'op'='insert' then
    vals:=vals||jsonb_build_object('user_id',p_user);
    select string_agg(format('%I',key),',') into cols from jsonb_object_keys(vals) key;
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1)',tbl,cols) using vals;
   elsif c->>'op' in ('update','delete') then
    if c->'where' is null or c->'where'='{}'::jsonb then raise exception 'A row key is required'; end if;
    if vals ?| array['user_id','id','no','created_at','connector_secret'] then raise exception 'Immutable field'; end if;
    if c->>'op'='delete' then
     execute format('delete from public.%I t where t.user_id=$1 and to_jsonb(t) @> $2',tbl) using p_user,c->'where';
    else
     select string_agg(format('%1$I=r.%1$I',key),',') into sets from jsonb_object_keys(vals) key;
     execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I,$1) r where t.user_id=$2 and to_jsonb(t) @> $3 and to_jsonb(t) @> $4',tbl,sets) using vals,p_user,c->'where',coalesce(c->'expected','{}');
    end if;
    get diagnostics affected=row_count;
    if affected=0 and coalesce((c->>'required')::boolean,true) then raise exception 'Row changed or not found; retry'; end if;
   else raise exception 'Operation not allowed'; end if;
  end if;
 end loop;
 if exists(with recursive walk as (
   select checkpoint_id,prereq_id,array[checkpoint_id,prereq_id] path,false cycle from public.checkpoint_prereqs where user_id=p_user
   union all select w.checkpoint_id,e.prereq_id,w.path||e.prereq_id,e.prereq_id=any(w.path)
   from walk w join public.checkpoint_prereqs e on e.checkpoint_id=w.prereq_id and e.user_id=p_user where not w.cycle
 ) select 1 from walk where cycle) then raise exception 'Checkpoint prerequisites must not contain a cycle'; end if;
 update public.settings set connector_last_seen_at=now(),connector_last_client=case when p_source in ('claude','chatgpt','other') then p_source else connector_last_client end where user_id=p_user;
 select no into a from public.actions where txid=txid_current() and user_id=p_user;
 return jsonb_build_object('action',a,'result',result,'created',(select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'no',new->'no','code',new->'code','slug',new->'slug')),'[]') from public.action_changes where action_no=a and op='insert'));
end $$;
revoke all on function public.mcp_commit(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_commit(uuid,text,text,text,jsonb) to service_role;

create function public.mcp_seen(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('lemma.source','system',true);perform set_config('lemma.tool','heartbeat',true);perform set_config('lemma.summary','Connector activity',true);
 update public.settings set connector_last_seen_at=now() where user_id=p_user;
end $$;
revoke all on function public.mcp_seen(uuid) from public,anon,authenticated;
grant execute on function public.mcp_seen(uuid) to service_role;

-- Connection timestamps are transient; they must not block undo of standing prompts.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb; after_row jsonb; current_row jsonb; pk jsonb;
  owner_id uuid; action_id bigint; action_owner uuid; action_source text;
begin
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (before_row - 'updated_at' - 'last_activity_at' - 'connector_last_seen_at') = (after_row - 'updated_at' - 'last_activity_at' - 'connector_last_seen_at') then
    return new;
  end if;
  current_row := coalesce(after_row, before_row);
  owner_id := (current_row ->> 'user_id')::uuid;
  select jsonb_object_agg(a.attname, current_row -> a.attname) into pk
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = tg_relid and i.indisprimary;
  if pk is null then raise exception 'No primary key on %.%', tg_table_schema, tg_table_name; end if;
  action_source := coalesce(nullif(current_setting('lemma.source', true), ''), 'app');
  insert into public.actions(user_id,txid,source,tool,summary)
    values(owner_id,txid_current(),action_source,nullif(current_setting('lemma.tool', true),''),left(nullif(current_setting('lemma.summary', true),''),200))
    on conflict (txid) do nothing;
  select no,user_id into action_id,action_owner from public.actions where txid=txid_current() for update;
  if action_owner is distinct from owner_id then raise exception 'An action cannot modify multiple owners'; end if;
  insert into public.action_changes(action_no,seq,table_name,row_pk,op,old,new)
    select action_id,coalesce(max(seq),0)+1,tg_table_name,pk,lower(tg_op),before_row,after_row
    from public.action_changes where action_no=action_id;
  if nullif(current_setting('lemma.summary',true),'') is null then
    update public.actions set summary = (select left(string_agg(op||' '||table_name||' '||n, ', ' order by table_name,op),200)
      from (select op,table_name,count(*) n from public.action_changes where action_no=action_id group by op,table_name) totals)
      where no=action_id;
  end if;
  return coalesce(new,old);
end $$;
