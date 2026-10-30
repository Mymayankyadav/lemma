-- DB-3: additive planning metadata and device-independent appearance preferences.
alter table public.checkpoints add column stage text
  constraint checkpoints_stage_length check (char_length(stage) <= 40);
alter table public.projects add column target_date date,
  add column target_label text constraint projects_target_label_length check (char_length(target_label) <= 20);
alter table public.concepts add column topic text
  constraint concepts_topic_length check (char_length(topic) <= 40);
alter table public.settings add column ui jsonb
  constraint settings_ui_object check (jsonb_typeof(ui) = 'object');

-- The owner's real Algebra 1 plan differs from the lab's demo. Recognize its
-- chapter boundaries before applying these labels; never relabel another plan.
-- All changes stay in the existing action journal and can be undone together.
do $$
declare pid uuid; owners integer; prior_source text; prior_tool text; prior_summary text;
begin
 select count(*) into owners from public.projects where slug='algebra-1';
 if owners = 0 then return; end if;
 if owners <> 1 then raise exception 'DB-3 Algebra backfill requires one unambiguous project'; end if;
 select id into pid from public.projects where slug='algebra-1';
 if not exists(select 1 from public.checkpoints where project_id=pid and code='CP1' and title='Baseline diagnostic: sets, Zorn, linear algebra')
 or not exists(select 1 from public.checkpoints where project_id=pid and code='CP18' and title='Rings, ideals and the course''s ring zoo')
 or not exists(select 1 from public.checkpoints where project_id=pid and code='CP24' and title='Modules, bimodules, Hom and free modules')
 or not exists(select 1 from public.checkpoints where project_id=pid and code='CP38' and title='Field extensions, splitting fields, finite fields') then
  raise notice 'DB-3: Algebra plan differs; stage backfill skipped';
  return;
 end if;
 prior_source:=current_setting('lemma.source',true);
 prior_tool:=current_setting('lemma.tool',true);
 prior_summary:=current_setting('lemma.summary',true);
 perform set_config('lemma.source','system',true);
 perform set_config('lemma.tool','db3_stage_backfill',true);
 perform set_config('lemma.summary','Group Algebra 1 checkpoints into stages; preserve content and progress',true);
 update public.checkpoints c set stage=case
   when substring(c.code from '^CP([0-9]+)')::int=1 then 'Foundations'
   when substring(c.code from '^CP([0-9]+)')::int<=17 then 'Groups'
   when substring(c.code from '^CP([0-9]+)')::int<=23 then 'Rings'
   when substring(c.code from '^CP([0-9]+)')::int<=37 then 'Modules'
   when substring(c.code from '^CP([0-9]+)')::int=38 then 'Fields'
   else 'Galois' end
 where c.project_id=pid and c.stage is null
 and c.code ~ '^CP([1-9]|[1-3][0-9]|40)[a-z]?$';
 perform set_config('lemma.source',coalesce(prior_source,''),true);
 perform set_config('lemma.tool',coalesce(prior_tool,''),true);
 perform set_config('lemma.summary',coalesce(prior_summary,''),true);
end $$;
