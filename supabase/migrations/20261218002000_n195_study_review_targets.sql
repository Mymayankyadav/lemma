-- One membership predicate and one eligibility query serve preview, run admission and grade.
create function public.lemma_study_target_member(p_kind text,p_id uuid,p_card uuid,p_path uuid,p_checkpoint uuid,p_concept uuid)
returns boolean language sql immutable security invoker set search_path='' as $$
 select case when p_kind is null and p_id is null then true else coalesce(case p_kind
  when 'card' then p_card=p_id when 'path' then p_path=p_id
  when 'checkpoint' then p_checkpoint=p_id when 'concept' then p_concept=p_id else false end,false) end
$$;

create function public.lemma_ranked_review_items(
  p_decks text[],
  p_session_id uuid,
  p_concept_slug text,
  p_include_new boolean,
  p_new_only boolean, p_target_kind text, p_target_id uuid
)
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  with prefs as (
    select s.user_id, s.reviews_per_day, s.new_per_day,
      ((date_trunc('day', now() at time zone s.time_zone
          - make_interval(hours => s.rollover_hour))
        + make_interval(hours => s.rollover_hour))
        at time zone s.time_zone) as day_start,
      ((date_trunc('day', now() at time zone s.time_zone
          - make_interval(hours => s.rollover_hour))
        + interval '1 day' + make_interval(hours => s.rollover_hour))
        at time zone s.time_zone) as day_end
    from public.settings s where s.user_id = (select auth.uid())
      and (p_target_kind is null or (select public.lemma_plan_released()))
  ),
  answered as (
    select count(*)::integer as total,
      count(*) filter (where r.state_before = 0)::integer as fresh
    from public.reviews r cross join prefs s
    where r.user_id = s.user_id and r.undone_at is null
      and r.reviewed_at >= s.day_start and r.reviewed_at <= now()
  ),
  candidates as (
    select distinct on (n.id) n.id as note_id, n.no, c.id as card_id,
      c.state, c.due
    from public.cards c
    join public.notes n on n.id = c.note_id and n.user_id = c.user_id
    join public.projects p on p.id = n.project_id and p.user_id = n.user_id
    cross join prefs s
    where c.user_id = s.user_id and n.status = 'active'
      and public.lemma_study_target_member(p_target_kind,p_target_id,c.id,p.id,n.checkpoint_id,n.concept_id)
      and p.status <> 'archived' and p.system = false
      and (c.state = 0 or c.due < s.day_end)
      -- Filter the eligible set before DISTINCT ON, ranking, and both quotas.
      and (p_new_only is not true or c.state = 0)
      and (p_include_new is not false or c.state <> 0)
      and (p_session_id is null or n.session_id = p_session_id)
      and (p_concept_slug is null or exists (
        select 1 from public.concepts concept_filter
        where concept_filter.id = n.concept_id
          and concept_filter.user_id = n.user_id
          and concept_filter.slug = p_concept_slug
      ))
      and (coalesce(cardinality(p_decks), 0) = 0
        or 'project:' || p.slug = any(p_decks)
        or exists (
          select 1 from public.checkpoints cp_filter
          where cp_filter.id = n.checkpoint_id
            and cp_filter.user_id = n.user_id
            and 'cp:' || p.slug || ':' || cp_filter.code = any(p_decks)
        ))
    order by n.id, case when c.state = 0 then 1 else 0 end,
      case when c.state in (1,3) and c.due <= now() then 0 else 1 end,
      c.due, c.id
  ),
  prioritized as (
    select c.*,
      row_number() over (order by
        case when c.state = 0 then 2
             when c.state in (1,3) and c.due <= now() then 0
             else 1 end,
        c.due, c.no, c.card_id) as seq,
      sum(case when c.state = 0 then 1 else 0 end) over (order by
        case when c.state = 0 then 2
             when c.state in (1,3) and c.due <= now() then 0
             else 1 end,
        c.due, c.no, c.card_id) as fresh_seq
    from candidates c
  ),
  quota as (
    select p.*,
      row_number() over (order by p.seq) as review_seq
    from prioritized p cross join prefs s cross join answered a
    where p.state <> 0 or p.fresh_seq <= greatest(s.new_per_day - a.fresh, 0)
  ),
  selected as (
    select q.* from quota q cross join prefs s cross join answered a
    where q.review_seq <= greatest(s.reviews_per_day - a.total, 0)
  )
  select jsonb_build_object(
    'version',c.version,'cardId', c.id, 'noteId', n.id, 'noteNo', n.no, 'ord', c.ord,
    'type', n.type, 'kind', n.kind, 'front', n.front, 'back', n.back,
    'projectSlug', p.slug, 'glyph', coalesce(sub.glyph, '∫'),
    'checkpointCode', cp.code, 'checkpointTitle', cp.title,
    'sessionNumber', sess.number, 'sourceShort', src.short,
    'pageLabel', n.page_label,
    'state', jsonb_build_object(
      'state', c.state, 'due', c.due, 'stability', c.stability,
      'difficulty', c.difficulty, 'lastReview', c.last_review,
      'step', c.step, 'reps', c.reps, 'lapses', c.lapses
    )
  )
  from selected sel
  join public.cards c on c.id = sel.card_id and c.user_id = (select auth.uid())
  join public.notes n on n.id = sel.note_id and n.user_id = c.user_id
  join public.projects p on p.id = n.project_id and p.user_id = n.user_id
  left join public.subjects sub on sub.id = p.subject_id and sub.user_id = p.user_id
  left join public.checkpoints cp on cp.id = n.checkpoint_id and cp.user_id = n.user_id
  left join public.sessions sess on sess.id = n.session_id and sess.user_id = n.user_id
  left join public.sources src on src.id = n.source_id and src.user_id = n.user_id
  order by sel.review_seq;
$$;

-- Existing queue callers retain their complete filtering, ranking and quota behavior.
create or replace function public.review_items(
 p_decks text[] default '{}'::text[],p_session_id uuid default null,p_concept_slug text default null,
 p_include_new boolean default true,p_new_only boolean default false
) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select * from public.lemma_ranked_review_items(p_decks,p_session_id,p_concept_slug,p_include_new,p_new_only,null,null)
$$;

create function public.study_run_item_available(p_run uuid,p_item uuid,p_card uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.review_runs r
 join public.review_run_items i on i.user_id=r.user_id and i.run_id=r.id
 join public.cards c on c.user_id=i.user_id and c.id=i.card_id
 join public.notes n on n.user_id=c.user_id and n.id=c.note_id
 join public.projects p on p.user_id=n.user_id and p.id=n.project_id
 where (select public.lemma_plan_released()) and r.user_id=(select auth.uid()) and r.id=p_run and i.id=p_item and c.id=p_card
  and n.status='active' and not p.system and p.status<>'archived'
  and public.lemma_study_target_member(r.filters->'target'->>'kind',(r.filters->'target'->>'id')::uuid,c.id,p.id,n.checkpoint_id,n.concept_id))
$$;
revoke all on function public.study_run_item_available(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.study_run_item_available(uuid,uuid,uuid) to authenticated;

create function public.start_study_target(p_operation_id uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $target$
declare
 owner_id uuid:=(select auth.uid());
 target jsonb:=pg_catalog.jsonb_build_object('kind',p_kind,'id',p_id);
 allowed boolean;
 receipt jsonb;
 run_row public.review_runs%rowtype;
 settings_version integer;
 journal_no bigint;
 admitted integer;
begin
 if owner_id is null or pg_catalog.current_setting('role',true) is distinct from 'authenticated' then
  raise exception 'Sign in to review' using errcode='42501';
 end if;
 if not public.lemma_plan_released() then raise exception 'Scoped review unavailable' using errcode='55000'; end if;
 case p_kind
  when 'card' then select exists(select 1 from public.cards where user_id=owner_id and id=p_id) into allowed;
  when 'path' then select exists(select 1 from public.projects where user_id=owner_id and id=p_id) into allowed;
  when 'checkpoint' then select exists(select 1 from public.checkpoints where user_id=owner_id and id=p_id) into allowed;
  when 'concept' then select exists(select 1 from public.concepts where user_id=owner_id and id=p_id) into allowed;
  else raise exception 'Unknown review target' using errcode='22023';
 end case;
 if not allowed then raise exception 'Review target unavailable' using errcode='P0002'; end if;
 receipt:=public.lemma_trusted_receipt_begin(owner_id,p_operation_id,'study_review_target',target);
 if receipt is not null then return receipt; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('study-target:'||owner_id::text||':'||p_kind||':'||p_id::text,0));
 perform pg_catalog.set_config('lemma.source','app',true);
 perform pg_catalog.set_config('lemma.tool','start_study_target',true);
 perform pg_catalog.set_config('lemma.summary','Open scoped review',true);
 select * into run_row from public.review_runs
  where user_id=owner_id and status in ('running','paused') and filters->'target'=target
  order by updated_at desc,id limit 1 for update;
 if found then
  if run_row.status='paused' then
   update public.review_runs set status='running',paused_at=null,updated_at=pg_catalog.now(),version=version+1
    where user_id=owner_id and id=run_row.id returning * into run_row;
  end if;
 else
  select version into strict settings_version from public.settings where user_id=owner_id for share;
  -- Keep this command's inserts and admission in a subtransaction, so an empty
  -- requested scope never creates a run or action.
  begin
   insert into public.review_runs(user_id,filters,card_budget,minute_budget,scheduler_version,settings_version)
    values(owner_id,pg_catalog.jsonb_build_object('target',target)||
      case when p_kind='card' then pg_catalog.jsonb_build_object('cardId',p_id) else '{}'::jsonb end,
      1440,1440,'fsrs-v6',settings_version) returning * into run_row;
   insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version)
    select owner_id,run_row.id,(item.ord-1)::integer,c.id,c.version
    from public.lemma_ranked_review_items('{}',null,null,true,false,p_kind,p_id)
      with ordinality item(body,ord)
    join public.cards c on c.user_id=owner_id and c.id=(item.body->>'cardId')::uuid
    where item.ord<=1440 order by item.ord;
   get diagnostics admitted=row_count;
   if admitted=0 then raise exception 'No eligible cards' using errcode='L1950'; end if;
  exception when sqlstate 'L1950' then
   receipt:=pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','empty');
  end;
 end if;
 if receipt is null then
  select no into journal_no from public.actions where user_id=owner_id and txid=pg_catalog.txid_current();
  receipt:=pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','applied','runId',run_row.id,
   'runVersion',run_row.version,'actionNo',journal_no);
 end if;
 return public.lemma_trusted_receipt_finish(owner_id,p_operation_id,'study_review_target',target,receipt);
end
$target$;
revoke all on function public.start_study_target(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.start_study_target(uuid,text,uuid) to authenticated;
