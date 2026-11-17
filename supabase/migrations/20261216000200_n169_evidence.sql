-- N169: append-only evidence, one graded observation of one concept at one level (spec §9.1).
create table public.evidence (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  session_id uuid,
  session_event_id bigint references public.session_events(id) on delete set null (session_event_id),
  project_id uuid,
  checkpoint_id uuid,
  concept_id uuid,
  level text not null constraint evidence_level_valid check (level in ('recall','use','understand','transfer')),
  role text not null default 'primary' constraint evidence_role_valid check (role in ('primary','secondary','used')),
  outcome text not null constraint evidence_outcome_valid check (outcome in ('pass','partial','fail')),
  hint_level smallint not null default 0 constraint evidence_hint_valid check (hint_level between 0 and 4),
  novelty text not null default 'novel' constraint evidence_novelty_valid check (novelty in ('novel','familiar','seen_solution','self_reported')),
  kind text not null default 'attempt' constraint evidence_kind_valid check (kind in ('pretest','attempt','evidence','recheck','explanation','recall')),
  item_id uuid,
  origin text not null constraint evidence_origin_valid check (origin in ('tutor','scribe','migration','user')),
  confidence real not null default 1 constraint evidence_confidence_valid check (confidence between 0 and 1),
  ctx jsonb not null default '{}'::jsonb constraint evidence_ctx_object check (pg_catalog.jsonb_typeof(ctx)='object'),
  weight real,
  voided_at timestamptz,
  superseded_by bigint references public.evidence(id) on delete set null (superseded_by),
  version integer not null default 1 constraint evidence_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint evidence_updated_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  foreign key (user_id,session_id) references public.sessions(user_id,id) on delete set null (session_id),
  foreign key (user_id,project_id) references public.projects(user_id,id) on delete cascade,
  foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete set null (checkpoint_id),
  foreign key (user_id,concept_id) references public.concepts(user_id,id) on delete set null (concept_id)
);
create index evidence_owner_concept on public.evidence(user_id,concept_id,level,occurred_at,id) where voided_at is null;
create index evidence_owner_time on public.evidence(user_id,occurred_at,id);
create index evidence_owner_event on public.evidence(user_id,session_event_id);

-- Append-only: after insert only the void/supersede markers (and bookkeeping) may change.
create function public.evidence_append_only() returns trigger
language plpgsql security invoker set search_path='' as $only$
begin
  if (to_jsonb(new)-'voided_at'-'superseded_by'-'version'-'updated_at'-'updated_source')
     is distinct from (to_jsonb(old)-'voided_at'-'superseded_by'-'version'-'updated_at'-'updated_source') then
    raise exception 'Evidence is append-only; void or supersede it instead';
  end if;
  return new;
end
$only$;
create trigger a_evidence_append_only before update on public.evidence
  for each row execute function public.evidence_append_only();
create trigger z_record_version before update on public.evidence
  for each row execute function public.lemma_record_version();

alter table public.evidence enable row level security;
create policy evidence_owner_select on public.evidence for select to authenticated
  using (user_id=(select auth.uid()));
-- Browsers never write evidence directly: the tutor path (save_progress), the scribe and the
-- migration write through service-role functions. Supabase grants new tables by default (bug #1094).
revoke insert,update,delete,truncate on public.evidence from anon,authenticated;
grant select on public.evidence to authenticated,service_role;

-- Reversible like every fact: journalled, and registered for undo.
create trigger lemma_log_change after insert or update or delete on public.evidence
  for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values('evidence');

-- Evidence follows its session event: voiding the event voids the evidence; correcting the event
-- (insert new + supersede old) re-states the evidence with the corrected outcome and hint level.
create function public.lemma_evidence_follow_event() returns trigger
language plpgsql security invoker set search_path='' as $follow$
declare v_new public.session_events%rowtype; r public.evidence%rowtype; v_out text; v_id bigint;
begin
  if new.voided_at is not null and old.voided_at is null then
    update public.evidence set voided_at=new.voided_at
      where user_id=new.user_id and session_event_id=new.id and voided_at is null;
  elsif new.superseded_by is not null and old.superseded_by is null then
    select * into v_new from public.session_events where id=new.superseded_by and user_id=new.user_id;
    v_out:=case v_new.outcome when 'demonstrated' then 'pass' when 'partial' then 'partial' when 'failed' then 'fail' end;
    for r in select * from public.evidence where user_id=new.user_id and session_event_id=new.id and voided_at is null order by id loop
      update public.evidence set voided_at=pg_catalog.clock_timestamp() where id=r.id;
      if v_out is not null and v_new.kind in ('pretest','attempt','evidence','recheck','explanation') then
        insert into public.evidence(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,concept_id,level,role,
            outcome,hint_level,novelty,kind,item_id,origin,confidence,ctx)
          values(r.user_id,coalesce(v_new.occurred_at,v_new.created_at),r.session_id,v_new.id,r.project_id,v_new.checkpoint_id,r.concept_id,r.level,r.role,
            v_out,coalesce(v_new.hint_level,0),r.novelty,case when r.kind='recall' then 'recall' else v_new.kind end,r.item_id,r.origin,r.confidence,r.ctx)
          returning id into v_id;
        update public.evidence set superseded_by=v_id where id=r.id;
      end if;
    end loop;
  end if;
  return null;
end
$follow$;
create trigger lemma_evidence_follow after update of voided_at,superseded_by on public.session_events
  for each row execute function public.lemma_evidence_follow_event();
