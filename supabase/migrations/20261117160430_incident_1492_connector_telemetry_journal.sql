-- S0 #1492: preserve the journal and undo contracts while ignoring settings
-- telemetry, including the version/provenance metadata N38 adds to every update.
-- Compatible log_change() replacement; no existing rows or grants are changed.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb; after_row jsonb; current_row jsonb; pk jsonb;
  owner_id uuid; action_id bigint; action_owner uuid; action_source text;
begin
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  -- N38 versions and provenance also change on connector reads. They do not
  -- make connection telemetry an owner settings edit or an undo dependency.
  -- Compare every standing setting, including prompts, flags and capacity.
  if tg_op = 'UPDATE' and tg_table_name = 'settings'
    and (before_row - array['updated_at','last_activity_at','connector_last_seen_at','connector_last_client','version','updated_source'])
      = (after_row - array['updated_at','last_activity_at','connector_last_seen_at','connector_last_client','version','updated_source']) then
    return new;
  end if;
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
