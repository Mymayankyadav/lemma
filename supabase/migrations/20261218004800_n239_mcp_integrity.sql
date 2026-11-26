-- N239: owner-bound proposal snapshots, immutable deletion scope and replay-safe MCP progress.
-- Only mcp_commit(uuid,text,text,text,jsonb) replaces an existing signature.

-- Keep old clients safe too: capture the target at proposal insertion and never
-- approve a pre-upgrade card-edit proposal whose original target is unknown.
create function public.n239_mcp_proposal_version_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n public.notes;
begin
 if new.kind<>'card_edit' then return new; end if;
 if tg_op='INSERT' then
  if new.status<>'pending' then return new; end if;
  select * into n from public.notes where user_id=new.user_id
   and project_id=new.project_id and no=(new.payload->>'note_no')::bigint for share;
  if not found then raise exception 'Proposal note not found'; end if;
  if new.base_target_versions='{}'::jsonb then
   new.base_target_versions:=jsonb_build_object('notes',jsonb_build_object(n.id,n.version));
  elsif new.base_target_versions->'notes'->>n.id::text is distinct from n.version::text then
   raise exception 'Proposal target changed; prepare the edit again' using errcode='40001';
  end if;
 elsif old.status='pending' and new.status='approved' and
   not exists(select 1 from jsonb_each(coalesce(old.base_target_versions->'notes','{}'))) then
  raise exception 'This old card edit has no target version; prepare the edit again' using errcode='40001';
 end if;
 return new;
end $$;
-- Run after the existing metadata guard has validated caller-supplied fields.
create trigger zz_n239_mcp_proposal_version_guard before insert or update on public.proposals
 for each row execute function public.n239_mcp_proposal_version_guard();
revoke all on function public.n239_mcp_proposal_version_guard() from public,anon;

-- The scope contains compact primary/referenced keys and server-side row hashes,
-- never page bodies or transcripts. Follow catalog FKs so newly added dependent
-- tables cannot silently escape consent. SET NULL/RESTRICT rows are conservatively
-- included as affected rows. Lock the reachable tables before confirmation to
-- prevent an insert/update between scope comparison and the cascading delete.
create function public.n239_mcp_delete_scope(p_user uuid,p_table text,p_key jsonb,p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tables text[]; t text; projection text; predicate text; rowset jsonb; merged jsonb;
 scope jsonb:='{}'; counts jsonb:='{}'; e record; changed boolean; rounds int:=0;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 if p_user is null or not exists(select 1 from public.settings where user_id=p_user) then raise exception 'Owner not found'; end if;
 if p_table<>all(array['subjects','projects','sources','concepts','checkpoints','styles','sessions','notes','card_comments','proposals'])
   or jsonb_typeof(p_key) is distinct from 'object' or p_key='{}'::jsonb then raise exception 'Invalid deletion target'; end if;
 with recursive reach(oid) as (
  select ('public.'||quote_ident(p_table))::regclass::oid
  union
  select f.conrelid from reach r join pg_catalog.pg_constraint f on f.confrelid=r.oid and f.contype='f'
   join pg_catalog.pg_class c on c.oid=f.conrelid join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
   where ns.nspname='public' and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped)
 ) select array_agg(c.relname order by c.relname) into tables from reach r join pg_catalog.pg_class c on c.oid=r.oid;
 -- projects.style is a legacy logical reference without a foreign key. It
 -- must be locked and checked explicitly on both preview and confirmation.
 if p_table='styles' then
  select array_agg(distinct value order by value) into tables from unnest(tables||array['projects']) x(value);
 end if;
 if p_lock then
  foreach t in array tables loop execute format('lock table public.%I in share row exclusive mode',t); end loop;
 end if;
 if p_table='styles' and exists(select 1 from public.projects where user_id=p_user and style=p_key->>'key') then
  raise exception 'Style is used by a project; choose another style before deleting it';
 end if;
 foreach t in array tables loop scope:=scope||jsonb_build_object(t,'[]'::jsonb); end loop;
 -- All keys referenced by a foreign key are retained along with the primary key.
 for t in select unnest(tables) loop
  select string_agg(format('%L,to_jsonb(t)->%L',a.attname,a.attname),',' order by a.attname) into projection
   from pg_catalog.pg_attribute a where a.attrelid=('public.'||quote_ident(t))::regclass and a.attnum>0 and not a.attisdropped
    and (a.attname='user_id' or exists(select 1 from pg_catalog.pg_index i where i.indrelid=a.attrelid and i.indisprimary and a.attnum=any(i.indkey))
      or exists(select 1 from pg_catalog.pg_constraint f where f.confrelid=a.attrelid and f.contype='f' and a.attnum=any(f.confkey)));
  if t=p_table then
   execute format('select coalesce(jsonb_agg(jsonb_build_object(''key'',jsonb_build_object(%s),''hash'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''))),''[]''::jsonb) from public.%I t where t.user_id=$1 and to_jsonb(t) @> $2',projection,t)
    into rowset using p_user,p_key;
   if jsonb_array_length(rowset)<>1 then raise exception 'Deletion target changed or not found'; end if;
   scope:=jsonb_set(scope,array[t],rowset);
  end if;
 end loop;
 loop
  changed:=false; rounds:=rounds+1;
  if rounds>100 then raise exception 'Deletion graph is too deep to verify safely'; end if;
  for e in select f.*,pc.relname parent,cc.relname child from pg_catalog.pg_constraint f
   join pg_catalog.pg_class pc on pc.oid=f.confrelid join pg_catalog.pg_class cc on cc.oid=f.conrelid
   join pg_catalog.pg_namespace ns on ns.oid=cc.relnamespace
   where f.contype='f' and ns.nspname='public' and pc.relname=any(tables) and cc.relname=any(tables)
   order by cc.relname,f.oid loop
   if jsonb_array_length(scope->e.parent)=0 then continue; end if;
   select string_agg(format('t.%I is not null and to_jsonb(t)->%L=p.value->''key''->%L',ca.attname,ca.attname,pa.attname),' and ' order by x.ord) into predicate
    from unnest(e.conkey,e.confkey) with ordinality x(childkey,parentkey,ord)
    join pg_catalog.pg_attribute ca on ca.attrelid=e.conrelid and ca.attnum=x.childkey
    join pg_catalog.pg_attribute pa on pa.attrelid=e.confrelid and pa.attnum=x.parentkey;
   select string_agg(format('%L,to_jsonb(t)->%L',a.attname,a.attname),',' order by a.attname) into projection
    from pg_catalog.pg_attribute a where a.attrelid=e.conrelid and a.attnum>0 and not a.attisdropped
     and (a.attname='user_id' or exists(select 1 from pg_catalog.pg_index i where i.indrelid=a.attrelid and i.indisprimary and a.attnum=any(i.indkey))
       or exists(select 1 from pg_catalog.pg_constraint f where f.confrelid=a.attrelid and f.contype='f' and a.attnum=any(f.confkey)));
   execute format('select coalesce(jsonb_agg(jsonb_build_object(''key'',jsonb_build_object(%s),''hash'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''))),''[]''::jsonb) from public.%I t where t.user_id=$1 and exists(select 1 from jsonb_array_elements($2) p(value) where %s)',projection,e.child,predicate)
    into rowset using p_user,scope->e.parent;
   select coalesce(jsonb_agg(distinct value order by value),'[]'::jsonb) into merged from jsonb_array_elements((scope->e.child)||rowset);
   if merged is distinct from scope->e.child then scope:=jsonb_set(scope,array[e.child],merged); changed:=true; end if;
  end loop;
  exit when not changed;
 end loop;
 foreach t in array tables loop counts:=counts||jsonb_build_object(t,jsonb_array_length(scope->t)); end loop;
 return jsonb_build_object('token',encode(sha256(convert_to(jsonb_build_object('owner',p_user,'table',p_table,'key',p_key,'scope',scope)::text,'UTF8')),'hex'),'counts',counts);
end $$;
revoke all on function public.n239_mcp_delete_scope(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.n239_mcp_delete_scope(uuid,text,jsonb,boolean) to service_role;

create or replace function public.mcp_commit(p_user uuid,p_tool text,p_source text,p_summary text,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; tbl text; vals jsonb; cols text; sets text; result jsonb; affected int; a bigint; fn text; d jsonb; replay_id uuid; replay_request jsonb; previous public.command_receipts; receipt jsonb; scope jsonb;
begin
 if p_user is null or not exists(select 1 from public.settings where user_id=p_user) then raise exception 'Owner not found'; end if;
 if jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands)>150 then raise exception 'Invalid command batch'; end if;
 -- Stable operation IDs are explicit for intentional repeated observations. Old
 -- clients get a deterministic payload identity, making a lost-ack retry safe.
 if p_tool='save_progress' then
  if jsonb_array_length(p_commands)<>1 or p_commands->0->>'op'<>'rpc' or p_commands->0->>'fn'<>'save_progress' then raise exception 'Invalid progress batch'; end if;
  replay_request:=(p_commands->0->'args')-'operation_id';
  replay_id:=coalesce((p_commands->0->'args'->>'operation_id')::uuid,md5('mcp_save_progress:'||replay_request::text)::uuid);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||replay_id::text,0));
  select * into previous from public.command_receipts where user_id=p_user and operation_id=replay_id;
  if found then
   if previous.resource<>'mcp_save_progress' or previous.result->'request' is distinct from replay_request then raise exception 'Operation ID reused with changed progress'; end if;
   return previous.result->'receipt';
  end if;
 end if;
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
     if p_tool='delete' then
      if jsonb_array_length(p_commands)<>1 or c->>'expectedScope' is null then raise exception 'Deletion requires its preview token'; end if;
      scope:=public.n239_mcp_delete_scope(p_user,tbl,c->'where',true);
      if scope->>'token' is distinct from c->>'expectedScope' then raise exception 'Deletion scope changed; preview and confirm again' using errcode='40001'; end if;
     end if;
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
 receipt:=jsonb_build_object('action',a,'result',result,'created',(select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'no',new->'no','code',new->'code','slug',new->'slug')),'[]') from public.action_changes where action_no=a and op='insert'));
 if replay_id is not null then
  insert into public.command_receipts(user_id,operation_id,resource,result)
   values(p_user,replay_id,'mcp_save_progress',jsonb_build_object('request',replay_request,'receipt',receipt));
 end if;
 return receipt;
end $$;
-- CREATE OR REPLACE retains the existing service-role-only EXECUTE privileges.
