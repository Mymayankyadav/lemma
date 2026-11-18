-- Atlas v3 facts. No existing data is changed and no cutover happens on deployment.
alter table public.concepts
 add column kind text not null default 'topic' check(kind in ('topic','definition','result','example','technique','heuristic','control','theme','notation')),
 add column family_id uuid,
 add constraint concepts_family_owner_fk foreign key(user_id,family_id) references public.concepts(user_id,id);
alter table public.items
 add column cued uuid[] not null default '{}',
 add column item_kind text check(item_kind in ('practice','stretch','prepare','select','micro','recall','recheck','retry','holdout','legacy')),
 add column b_sd real not null default .7 check(b_sd>0 and b_sd<=6),
 add column est_minutes integer check(est_minutes>0),
 add column checkpoint_id uuid,
 add constraint items_checkpoint_owner_fk foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id);
alter table public.settings
 add column atlas jsonb not null default '{"threshold_p":0.85,"stretch_share":0.2,"plan_first_min":10,"ask_confidence":true,"card_quota_share":0.5,"card_cap":0.125,"card_weight":0.4}'::jsonb check(jsonb_typeof(atlas)='object'),
 add column atlas_migrated_at timestamptz;
alter table public.checkpoints add column template jsonb check(template is null or jsonb_typeof(template)='object');
alter table public.notes add column facet text check(facet in ('recall','understand','select'));
alter table public.scheduler_runs add column p_all real check(p_all between 0 and 1),add column p_core real check(p_core between 0 and 1);

create table public.attempts(
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 occurred_at timestamptz not null default now(),session_id uuid,session_event_id bigint,project_id uuid,checkpoint_id uuid,item_id uuid,
 item_kind text not null default 'legacy' check(item_kind in ('practice','stretch','prepare','select','micro','recall','recheck','retry','holdout','legacy')),
 cued uuid[] not null default '{}',context jsonb not null default '{}' check(jsonb_typeof(context)='object'),
 confidence_before real check(confidence_before between 0 and 1),minutes real check(minutes>=0 and minutes<'Infinity'::real),
 furthest_stage text check(furthest_stage in ('U','S','E','C','done')),legacy_outcome text check(legacy_outcome in ('pass','partial','fail')),
 plan_score smallint check(plan_score between 0 and 3),grader text not null default 'tutor' check(grader in ('tutor','learner','migration')),
 origin text not null default 'tutor' check(origin in ('tutor','scribe','migration','user')),weight real not null default 1 check(weight between 0 and 1),
 source_evidence_id bigint,voided_at timestamptz,superseded_by bigint,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_source text check(updated_source in ('app','mcp','worker')),
 unique(user_id,id),unique(user_id,source_evidence_id),
 foreign key(user_id,session_id) references public.sessions(user_id,id),
 foreign key(user_id,project_id) references public.projects(user_id,id),
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id),
 foreign key(user_id,item_id) references public.items(user_id,id),
 foreign key(user_id,superseded_by) references public.attempts(user_id,id)
);
create table public.attempt_tags(
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 attempt_id bigint not null,concept_id uuid not null,
 facet text not null check(facet in ('recall','understand','use','select','execute','recognise','construct','transfer','perform')),
 role text not null default 'target' check(role in ('target','required','incidental')),
 stage text check(stage in ('U','S','E','C')),result text check(result in ('ok','fail','not_reached')),
 hint_level smallint not null default 0 check(hint_level between 0 and 4),demand smallint not null default 0 check(demand in (-1,0)),
 error_tag text check(error_tag in ('misread_definition','quantifier_order','unjustified_step','missing_case','wrong_approach','slip')),
 confidence real not null default 1 check(confidence between 0 and 1),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_source text check(updated_source in ('app','mcp','worker')),
 unique(user_id,id),unique nulls not distinct(attempt_id,concept_id,facet,stage),
 foreign key(user_id,attempt_id) references public.attempts(user_id,id) on delete cascade,
 foreign key(user_id,concept_id) references public.concepts(user_id,id)
);
create table public.instruction_events(
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 occurred_at timestamptz not null default now(),session_id uuid,concept_id uuid not null,
 origin text not null default 'tutor' check(origin in ('tutor','migration')),voided_at timestamptz,source_key text,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_source text check(updated_source in ('app','mcp','worker')),
 unique(user_id,id),unique(user_id,source_key),
 foreign key(user_id,session_id) references public.sessions(user_id,id),
 foreign key(user_id,concept_id) references public.concepts(user_id,id)
);
create table public.atlas_links(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 from_id uuid not null,to_id uuid not null,
 kind text not null check(kind in ('equivalent','generalises','instance_of','uses_technique','contrasts','analogous','part_of')),
 status text not null default 'proposed' check(status in ('proposed','approved','rejected')),
 origin text not null default 'tutor' check(origin in ('auto','worker','tutor','user')),
 confidence real not null default 1 check(confidence between 0 and 1),rationale text check(char_length(rationale)<=200),from_hash text,to_hash text,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_source text check(updated_source in ('app','mcp','worker')),
 unique(user_id,id),unique(user_id,from_id,to_id,kind),check(from_id<>to_id),
 foreign key(user_id,from_id) references public.concepts(user_id,id),foreign key(user_id,to_id) references public.concepts(user_id,id)
);
create table public.model_fits(
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
 input_hash text not null,fitted_at timestamptz not null default now(),params jsonb not null,scores jsonb not null,
 unique(user_id,input_hash)
);
create index attempts_owner_time on public.attempts(user_id,occurred_at,id);
create index attempt_tags_owner_concept on public.attempt_tags(user_id,concept_id,facet);
create index instruction_events_owner_time on public.instruction_events(user_id,occurred_at,id);

do $facts$
declare t text;
begin
 foreach t in array array['attempts','attempt_tags','instruction_events','atlas_links'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()))',t||'_owner_select',t);
  execute format('revoke insert,update,delete,truncate on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('grant insert,update,delete on public.%I to service_role',t);
  execute format('create trigger z_record_version before update on public.%I for each row execute function public.lemma_record_version()',t);
  execute format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()',t);
  insert into public.lemma_undo_tables(table_name) values(t);
 end loop;
end $facts$;
alter table public.model_fits enable row level security;
create policy model_fits_owner_select on public.model_fits for select to authenticated using(user_id=(select auth.uid()));
revoke insert,update,delete,truncate on public.model_fits from anon,authenticated;
grant select on public.model_fits to authenticated,service_role;
grant insert,update,delete on public.model_fits to service_role;

create function public.atlas_attempt_append_only() returns trigger language plpgsql set search_path='' as $fn$
begin
 if (to_jsonb(new)-'voided_at'-'superseded_by'-'version'-'updated_at'-'updated_source') is distinct from (to_jsonb(old)-'voided_at'-'superseded_by'-'version'-'updated_at'-'updated_source') then raise exception 'Attempts are append-only; void or supersede';end if;
 return new;
end $fn$;
create trigger atlas_attempt_append_only before update on public.attempts for each row execute function public.atlas_attempt_append_only();
