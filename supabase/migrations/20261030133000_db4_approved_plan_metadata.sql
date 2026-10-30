-- DB-4 follow-up for MCP-4: apply owner-approved v3 metadata, not draft proposals.
-- Additive trigger preserves existing approval logic, source history and undo/audit triggers.
create function public.lemma_apply_approved_v3_plan_metadata()
returns trigger language plpgsql security invoker set search_path = '' as $body$
declare
  subject_key uuid;
  item jsonb;
  nested jsonb;
  ref jsonb;
  key text;
  parent_key uuid;
  concept_key uuid;
  checkpoint_key uuid;
  source_key uuid;
  seq integer;
begin
  if old.status = 'approved' or new.status <> 'approved'
     or new.kind not in ('plan','plan_change') then return new; end if;

  select subject_id into subject_key from public.projects
    where id = new.project_id and user_id = new.user_id;
  if not found then raise exception 'Plan project is not owner-scoped'; end if;
  if subject_key is null and jsonb_array_length(coalesce(new.payload->'concepts','[]'::jsonb))>0 then
    raise exception 'Set the project subject before approving a concept hierarchy';
  end if;

  -- First ensure all concept rows exist, so parents may appear later in the
  -- approved list. The same-subject FK and cycle trigger validate the result.
  for item in select value from jsonb_array_elements(coalesce(new.payload->'concepts','[]'::jsonb)) loop
    if nullif(item->>'name','') is null then raise exception 'Concept name is required'; end if;
    concept_key := public.lemma_ensure_concept(new.user_id, subject_key, item->>'name', item->>'blurb');
    update public.concepts
      set level = case when item ? 'level' then item->>'level' else level end,
          is_star = case when item ? 'star' then (item->>'star')::boolean else is_star end,
          blurb = case when item ? 'blurb' then item->>'blurb' else blurb end
      where id=concept_key and user_id=new.user_id and subject_id=subject_key;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'concepts','[]'::jsonb)) loop
    if not item ? 'parent' then continue; end if;
    select id into concept_key from public.concepts
      where user_id=new.user_id and subject_id=subject_key
        and lower(name)=lower(item->>'name') limit 1;
    parent_key := null;
    if item->>'parent' is not null then
      select id into parent_key from public.concepts
        where user_id=new.user_id and subject_id=subject_key
          and lower(name)=lower(item->>'parent') limit 1;
      if parent_key is null then raise exception 'Unknown Atlas parent %', item->>'parent'; end if;
    end if;
    update public.concepts set parent_id=parent_key
      where id=concept_key and user_id=new.user_id and subject_id=subject_key;
  end loop;

  -- A plan's generated CP codes are deterministic. Plan-change additions with
  -- v3 metadata must supply a code, so the metadata never lands on a wrong row.
  seq := 0;
  for item in select value from jsonb_array_elements(
    case when new.kind='plan' then coalesce(new.payload->'checkpoints','[]'::jsonb)
         else coalesce(new.payload->'ops','[]'::jsonb) end
  ) loop
    seq := seq+1;
    if new.kind='plan_change' and item->>'op' not in ('add','update') then continue; end if;
    key := coalesce(item->>'code', case when new.kind='plan' then 'CP'||seq else null end);
    if key is null then
      if item ? 'due_on' or item ? 'sources' then
        raise exception 'Give plan-change additions an explicit code when setting v3 metadata';
      end if;
      continue;
    end if;
    select id into checkpoint_key from public.checkpoints
      where user_id=new.user_id and project_id=new.project_id and code=key;
    if checkpoint_key is null then raise exception 'Approved checkpoint % was not found',key; end if;
    if item ? 'due_on' then
      update public.checkpoints set due_on=(item->>'due_on')::date
        where id=checkpoint_key and user_id=new.user_id and project_id=new.project_id;
    end if;
    if item ? 'sources' then
      if jsonb_typeof(item->'sources') <> 'array' then raise exception 'Checkpoint sources must be an array'; end if;
      for ref in select value from jsonb_array_elements(item->'sources') loop
        select id into source_key from public.sources
          where user_id=new.user_id and project_id=new.project_id and short=ref->>'source';
        if source_key is null then raise exception 'Unknown project source %',ref->>'source'; end if;
        insert into public.checkpoint_sources(user_id,checkpoint_id,source_id,pages)
          values(new.user_id,checkpoint_key,source_key,ref->>'pages')
          on conflict (checkpoint_id,source_id) do update set pages=excluded.pages;
      end loop;
    end if;
  end loop;
  return new;
end $body$;

revoke all on function public.lemma_apply_approved_v3_plan_metadata() from public,anon;
create trigger z_v3_approved_plan_metadata
after update of status on public.proposals
for each row execute function public.lemma_apply_approved_v3_plan_metadata();
