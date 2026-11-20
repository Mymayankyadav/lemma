-- The N191 helpers serialize operation IDs, verify receipt provenance and store
-- the canonical request digest. Only these owner-scoped commands are exposed.
create function public.create_first_study_card(
  p_operation_id uuid, p_expected_owner uuid, p_path jsonb, p_front text, p_back text
) returns jsonb language plpgsql security definer set search_path = '' as $first$
declare
  owner_id uuid := (select auth.uid());
  request jsonb;
  receipt jsonb;
  chosen public.projects%rowtype;
  saved_note public.notes%rowtype;
  saved_card public.cards%rowtype;
  title_text text;
  base_slug text;
  candidate text;
  suffix text;
  journal_no bigint;
begin
  if owner_id is null or owner_id is distinct from p_expected_owner
    or pg_catalog.current_setting('role',true) is distinct from 'authenticated' then
    raise exception 'Sign in to save a card' using errcode='42501';
  end if;
  if not public.lemma_plan_released() then raise exception 'First card is unavailable' using errcode='55000'; end if;
  p_front := pg_catalog.btrim(p_front);
  p_back := pg_catalog.btrim(p_back);
  if pg_catalog.jsonb_typeof(p_path) is distinct from 'object'
    or coalesce(pg_catalog.length(p_front),0) not between 1 and 1500
    or coalesce(pg_catalog.length(p_back),0) not between 1 and 3000 then
    raise exception 'Enter a front and back within the card limits' using errcode='22023';
  end if;
  if p_path->>'kind'='existing' then
    if not (p_path ?& array['kind','id','slug']) or (p_path - array['kind','id','slug']) <> '{}'::jsonb then
      raise exception 'Choose an available path' using errcode='22023';
    end if;
    select * into chosen from public.projects
      where user_id=owner_id and id=(p_path->>'id')::uuid and slug=p_path->>'slug' for share;
    if not found then raise exception 'Path unavailable' using errcode='P0002'; end if;
  elsif p_path->>'kind'='new' then
    title_text := pg_catalog.btrim(p_path->>'title');
    if pg_catalog.jsonb_typeof(p_path->'title') is distinct from 'string'
      or (p_path - array['kind','title']) <> '{}'::jsonb
      or pg_catalog.length(title_text) not between 2 and 80 then
      raise exception 'Path name must contain 2 to 80 characters' using errcode='22023';
    end if;
    p_path := pg_catalog.jsonb_build_object('kind','new','title',title_text);
  else raise exception 'Choose an existing or new path' using errcode='22023';
  end if;

  request := pg_catalog.jsonb_build_object('path',p_path,'front',p_front,'back',p_back);
  receipt := public.lemma_trusted_receipt_begin(owner_id,p_operation_id,'first_study_card',request);
  if receipt is not null then return receipt; end if;

  -- Different UUIDs from two tabs must compete for the same empty library.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-study-card:'||owner_id::text,0));
  if exists(select 1 from public.notes where user_id=owner_id and status<>'deleted') then
    receipt := pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','conflict','reason','library_changed');
  elsif chosen.id is not null and (chosen.system or chosen.status='archived') then
    receipt := pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','conflict','reason','path_changed');
  else
    perform pg_catalog.set_config('lemma.source','app',true);
    perform pg_catalog.set_config('lemma.tool','create_first_study_card',true);
    perform pg_catalog.set_config('lemma.summary','Create first study card',true);
    if chosen.id is null then
      base_slug := public.lemma_slug(title_text);
      if pg_catalog.length(base_slug)<2 then base_slug := base_slug||'-path'; end if;
      for attempt in 1..100 loop
        suffix := case when attempt=1 then '' else '-'||attempt::text end;
        candidate := pg_catalog.rtrim(pg_catalog.left(base_slug,40-pg_catalog.length(suffix)),'-')||suffix;
        insert into public.projects(user_id,slug,title,status,style,system)
          values(owner_id,candidate,title_text,'planning','socratic',false)
          on conflict(user_id,slug) do nothing returning * into chosen;
        exit when found;
      end loop;
      if chosen.id is null then raise exception 'Choose another path name' using errcode='22023'; end if;
    end if;
    insert into public.notes(user_id,project_id,front,back,type,kind,origin)
      values(owner_id,chosen.id,p_front,p_back,'basic','other','user') returning * into saved_note;
    perform public.lemma_reconcile_cards(owner_id,saved_note.id);
    select * into strict saved_card from public.cards where user_id=owner_id and note_id=saved_note.id and ord=1;
    select no into strict journal_no from public.actions where user_id=owner_id and txid=pg_catalog.txid_current();
    receipt := pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','applied','actionNo',journal_no,
      'projectId',chosen.id,'projectSlug',chosen.slug,'noteId',saved_note.id,'noteNo',saved_note.no,'cardId',saved_card.id);
  end if;
  return public.lemma_trusted_receipt_finish(owner_id,p_operation_id,'first_study_card',request,receipt);
end
$first$;
revoke all on function public.create_first_study_card(uuid,uuid,jsonb,text,text) from public,anon,service_role;
grant execute on function public.create_first_study_card(uuid,uuid,jsonb,text,text) to authenticated;

create function public.grade_study_run_item(
  p_operation_id uuid, p_run uuid, p_item uuid, p_card uuid,
  p_run_version integer, p_card_version integer, p_rating integer,
  p_confidence text, p_duration_ms integer, p_next jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $grade$
declare
  owner_id uuid := (select auth.uid());
  run_row public.review_runs%rowtype;
  item_row public.review_run_items%rowtype;
  card_row public.cards%rowtype;
  request jsonb;
  receipt jsonb;
  review_no bigint;
  journal_no bigint;
  is_last boolean;
begin
  if owner_id is null or pg_catalog.current_setting('role',true) is distinct from 'authenticated' then
    raise exception 'Sign in to grade' using errcode='42501';
  end if;
  if not public.lemma_plan_released() then raise exception 'Study grading unavailable' using errcode='55000'; end if;

  -- Authenticate the full target before receipt lookup on every call, including
  -- retries. Lock and re-read before validation so concurrent grades see the winner.
  if not exists(select 1 from public.review_runs r join public.review_run_items i
      on i.user_id=r.user_id and i.run_id=r.id join public.cards c on c.id=i.card_id and c.user_id=r.user_id
      where r.user_id=owner_id and r.id=p_run and i.id=p_item and c.id=p_card) then
    raise exception 'Review item unavailable' using errcode='P0002';
  end if;
  if p_run_version is null or p_run_version<1 or p_card_version is null or p_card_version<1
    or p_rating is null or p_rating not between 1 and 4
    or (p_confidence is not null and p_confidence not in ('sure','unsure','guess'))
    or p_duration_ms is null or p_duration_ms not between 0 and 600000
    or pg_catalog.jsonb_typeof(p_next) is distinct from 'object'
    or not (p_next ?& array['state','due','stability','difficulty','last_review','step','reps','lapses'])
    or (p_next - array['state','due','stability','difficulty','last_review','step','reps','lapses'])<>'{}'::jsonb then
    raise exception 'Invalid review grade' using errcode='22023';
  end if;
  request := pg_catalog.jsonb_build_object('runId',p_run,'itemId',p_item,'cardId',p_card,
    'runVersion',p_run_version,'cardVersion',p_card_version,'rating',p_rating,
    'confidence',p_confidence,'durationMs',p_duration_ms,'next',p_next);
  receipt := public.lemma_trusted_receipt_begin(owner_id,p_operation_id,'study_run_grade',request);
  if receipt is not null then return receipt; end if;
  select * into strict run_row from public.review_runs where user_id=owner_id and id=p_run for update;
  select * into strict item_row from public.review_run_items where user_id=owner_id and run_id=p_run and id=p_item for update;
  select * into strict card_row from public.cards where user_id=owner_id and id=p_card for update;
  if run_row.version<>p_run_version or run_row.status<>'running'
    or item_row.position<>run_row.position or item_row.state<>'pending' or item_row.card_id<>p_card
    or card_row.version<>p_card_version or item_row.expected_card_version<>p_card_version
    or not public.study_run_item_available(p_run,p_item,p_card) then
    receipt := pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','conflict','reason','review_changed');
  else
    -- Use the same FSRS mutation and action journal as ordinary review.
    review_no := public.record_review(p_card,p_rating,p_confidence,p_duration_ms,
      p_next||pg_catalog.jsonb_build_object('expected_version',p_card_version));
    update public.review_run_items set state='graded',review_id=review_no,version=version+1,
      source='app',updated_at=pg_catalog.now() where user_id=owner_id and id=p_item returning * into item_row;
    select not exists(select 1 from public.review_run_items
      where user_id=owner_id and run_id=p_run and position>item_row.position) into is_last;
    update public.review_runs set position=position+1,revealed=false,version=version+1,
      status=case when is_last then 'exhausted' else 'running' end,
      ended_at=case when is_last then pg_catalog.now() else null end,source='app',updated_at=pg_catalog.now()
      where user_id=owner_id and id=p_run returning * into run_row;
    select no into strict journal_no from public.actions where user_id=owner_id and txid=pg_catalog.txid_current();
    receipt := pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','applied','actionNo',journal_no,
      'runId',p_run,'itemId',p_item,'cardId',p_card,'reviewId',review_no,'runVersion',run_row.version);
  end if;
  return public.lemma_trusted_receipt_finish(owner_id,p_operation_id,'study_run_grade',request,receipt);
end
$grade$;
revoke all on function public.grade_study_run_item(uuid,uuid,uuid,uuid,integer,integer,integer,text,integer,jsonb) from public,anon,service_role;
grant execute on function public.grade_study_run_item(uuid,uuid,uuid,uuid,integer,integer,integer,text,integer,jsonb) to authenticated;
