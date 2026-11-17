-- N169: adaptive_migrate(p) moves existing data into the new model. Service role only (the owner is named in p).
--   dry_run is the default: the same code runs, then rolls back, and returns exactly what a real run would change.
--   A real run is one transaction = one journalled action: `undo A<n>` reverts it. It is idempotent (re-running changes nothing).
--   p = {owner, dry_run?, steps?[], time?{last_study_on}, capacity?{weekday_minutes,review_share}, approve_tiers?, auto_prune_projects?[], dismiss_pace?}
--   Free text (prompts, goals, labels) is never edited here: that goes through a proposal with a diff.
create function public.adaptive_migrate(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $migrate$
declare
 v_owner uuid; v_role text:=coalesce(current_setting('role',true),''); v_dry boolean:=coalesce((p->>'dry_run')::boolean,true);
 v_all text[]:=array['snapshot','time','typing','estimates','baselines','recheck_fields','evidence','diagnostics'];
 v_steps text[]; v_report jsonb:='{}'::jsonb; v_n integer; v_m integer; v_flags jsonb; r record;
begin
 -- Execute is granted to service_role only; this also refuses any app role should a grant ever be widened.
 if v_role in ('authenticated','anon') then raise exception 'adaptive_migrate is service-role only'; end if;
 v_owner:=nullif(p->>'owner','')::uuid;
 if v_owner is null or not exists(select 1 from public.settings where user_id=v_owner) then raise exception 'owner with settings required'; end if;
 v_steps:=case when p ? 'steps' then array(select jsonb_array_elements_text(p->'steps')) else v_all end;
 if exists(select 1 from unnest(v_steps) s where s<>all(v_all)) then raise exception 'Unknown step'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('adaptive_migrate:'||v_owner::text,0));
 perform 1 from public.settings where user_id=v_owner for update;           -- writers of settings wait
 perform pg_catalog.set_config('lemma.source','system',true);
 perform pg_catalog.set_config('lemma.tool','adaptive_migrate',true);
 perform pg_catalog.set_config('lemma.summary','Adaptive migration '||case when v_dry then '(dry run)' else '' end,true);
 begin
  -- 0. snapshot: row counts and a content checksum per table (the full export is the owner export, taken before a real run)
  if 'snapshot'=any(v_steps) then
   v_report:=v_report||pg_catalog.jsonb_build_object('snapshot',(select pg_catalog.jsonb_object_agg(t,pg_catalog.jsonb_build_object('rows',n,'md5',h)) from (
     select 'projects' t,count(*) n,md5(coalesce(pg_catalog.string_agg(to_jsonb(x)::text,'' order by x.id),'')) h from public.projects x where user_id=v_owner
     union all select 'checkpoints',count(*),md5(coalesce(pg_catalog.string_agg(to_jsonb(x)::text,'' order by x.id),'')) from public.checkpoints x where user_id=v_owner
     union all select 'session_events',count(*),md5(coalesce(pg_catalog.string_agg(to_jsonb(x)::text,'' order by x.id),'')) from public.session_events x where user_id=v_owner
     union all select 'misconceptions',count(*),md5(coalesce(pg_catalog.string_agg(to_jsonb(x)::text,'' order by x.id),'')) from public.misconceptions x where user_id=v_owner
     union all select 'diagnostics',count(*),md5(coalesce(pg_catalog.string_agg(to_jsonb(x)::text,'' order by x.id),'')) from public.diagnostics x where user_id=v_owner) s));
  end if;
  -- 1. time facts: last study day (unconfirmed until the learner says so) and weekday capacity
  if 'time'=any(v_steps) then
   v_n:=0;
   if p->'time' ? 'last_study_on' then
    update public.projects set last_study_on=(p->'time'->>'last_study_on')::date
     where user_id=v_owner and status in ('active','planning') and last_study_on is distinct from (p->'time'->>'last_study_on')::date;
    get diagnostics v_n=row_count;
   end if;
   v_m:=0;
   if p ? 'capacity' then
    update public.settings set capacity=pg_catalog.jsonb_build_object('weekday_minutes',p->'capacity'->'weekday_minutes','review_share',coalesce(p->'capacity'->'review_share',to_jsonb(0.25)))
     where user_id=v_owner and capacity is distinct from pg_catalog.jsonb_build_object('weekday_minutes',p->'capacity'->'weekday_minutes','review_share',coalesce(p->'capacity'->'review_share',to_jsonb(0.25)));
    get diagnostics v_m=row_count;
   end if;
   v_report:=v_report||pg_catalog.jsonb_build_object('time',pg_catalog.jsonb_build_object('projects_last_study_on_set',v_n,'capacity_set',v_m,
     'unconfirmed_projects',(select pg_catalog.jsonb_agg(slug order by slug) from public.projects where user_id=v_owner and status='active' and not time_confirmed)));
  end if;
  -- 2. checkpoint typing: "Cards K…" are cards; "Venture:" steps become venture steps; tiers are a draft until approved
  if 'typing'=any(v_steps) then
   update public.checkpoints set kind='cards' where user_id=v_owner and kind='learn' and title ~* '^cards k';
   get diagnostics v_n=row_count;
   update public.checkpoints c set step_meta=(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'tier',case when s.t ~* '^\s*venture\s*:' then 'venture' else null end,'estimate_minutes',null,'state','todo') order by s.i)
      from pg_catalog.jsonb_array_elements_text(c.steps) with ordinality s(t,i))
    where c.user_id=v_owner and c.step_meta is null and pg_catalog.jsonb_array_length(c.steps)>0;
   get diagnostics v_m=row_count;
   -- draft tiers: course-notes checkpoints are core; everything else stays standard; written only on approval
   v_report:=v_report||pg_catalog.jsonb_build_object('typing',pg_catalog.jsonb_build_object('cards_typed',v_n,'step_meta_built',v_m,
     'venture_steps',(select count(*) from public.checkpoints c,pg_catalog.jsonb_array_elements_text(c.steps) s where c.user_id=v_owner and s ~* '^\s*venture\s*:'),
     'tier_draft',(select coalesce(pg_catalog.jsonb_object_agg(pr.slug,d.cnt),'{}'::jsonb) from public.projects pr join lateral (
        select pg_catalog.jsonb_build_object('core',count(*) filter (where s.kind='notes' and c.kind='learn'),'standard',count(*) filter (where not(s.kind='notes' and c.kind='learn'))) cnt
        from public.checkpoints c left join public.sources s on s.id=c.source_id where c.project_id=pr.id) d on true where pr.user_id=v_owner)));
   if coalesce((p->>'approve_tiers')::boolean,false) then
    update public.checkpoints c set tier='core' from public.sources s
     where c.user_id=v_owner and s.id=c.source_id and s.kind='notes' and c.kind='learn' and c.tier='standard';
    get diagnostics v_n=row_count;
    v_report:=v_report||pg_catalog.jsonb_build_object('tiers_written',v_n);
   end if;
   if p ? 'auto_prune_projects' then
    update public.projects set auto_prune_standard=true where user_id=v_owner and slug=any(array(select jsonb_array_elements_text(p->'auto_prune_projects'))) and not auto_prune_standard;
   end if;
  end if;
  -- 3. estimates where missing (flagged uncalibrated by the scheduler: learn 60, cards 20, milestone 30)
  if 'estimates'=any(v_steps) then
   update public.checkpoints set estimate_minutes=case kind when 'cards' then 20 when 'milestone' then 30 else 60 end
    where user_id=v_owner and estimate_minutes is null;
   get diagnostics v_n=row_count;
   v_report:=v_report||pg_catalog.jsonb_build_object('estimates_defaulted',v_n);
  end if;
  -- 4. baselines: version 0 = the plan as it stands (the original plan is not reconstructible from plan revisions here)
  if 'baselines'=any(v_steps) then
   insert into public.plan_baselines(user_id,project_id,baseline_version,reason,entries)
    select v_owner,pr.id,0,'migration: current due dates (original plan not reconstructed)',
     coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('checkpoint_id',c.id,'due_on',c.due_on) order by c.position) from public.checkpoints c where c.project_id=pr.id),'[]'::jsonb)
    from public.projects pr where pr.user_id=v_owner and pr.status in ('active','planning')
     and not exists(select 1 from public.plan_baselines b where b.project_id=pr.id);
   get diagnostics v_n=row_count;
   v_report:=v_report||pg_catalog.jsonb_build_object('baselines_created',v_n);
  end if;
  -- 7. evidence backfill: graded, non-voided session events. One candidate concept → direct; otherwise listed as unresolved, never dropped.
  if 'evidence'=any(v_steps) then
   insert into public.evidence(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,concept_id,level,role,outcome,hint_level,novelty,kind,origin,confidence,ctx)
    select v_owner,coalesce(e.occurred_at,e.created_at),e.session_id,e.id,s.project_id,e.checkpoint_id,cand.concept_id,
     case e.kind when 'pretest' then 'recall' when 'explanation' then 'understand' else 'use' end,'primary',
     case e.outcome when 'demonstrated' then 'pass' when 'failed' then 'fail' else 'partial' end,coalesce(e.hint_level,0),'novel',e.kind,'migration',
     case when cand.concept_id is null then 0.5 else 1 end,pg_catalog.jsonb_build_object('migrated',true)
    from public.session_events e join public.sessions s on s.id=e.session_id and s.user_id=e.user_id
    left join lateral (select case when count(*)=1 then (array_agg(cc.concept_id))[1] end concept_id from public.checkpoint_concepts cc where cc.user_id=e.user_id and cc.checkpoint_id=e.checkpoint_id) cand on true
    where e.user_id=v_owner and e.voided_at is null and e.superseded_by is null and e.outcome is not null
     and e.kind in ('pretest','attempt','evidence','recheck','explanation')
     and not exists(select 1 from public.evidence x where x.session_event_id=e.id);
   get diagnostics v_n=row_count;
   v_report:=v_report||pg_catalog.jsonb_build_object('evidence',pg_catalog.jsonb_build_object('created',v_n,
     'unresolved_total',(select count(*) from public.evidence where user_id=v_owner and concept_id is null and voided_at is null),
     'ungraded_events',(select count(*) from public.session_events e where e.user_id=v_owner and e.voided_at is null and e.superseded_by is null and e.outcome is null and e.kind in ('pretest','attempt','evidence','recheck','explanation')),
     'misconceptions_without_concept',(select count(*) from public.misconceptions where user_id=v_owner and resolved_at is null and concept_id is null)));
  end if;
  -- 6. old recheck fields on demonstrated checkpoints (spec §14.7); runs after the evidence backfill so gaps are visible
  if 'recheck_fields'=any(v_steps) then
   v_n:=0;v_m:=0;
   -- Gaps that were fixed in a session (fail or partial, then a pass) are T1 triggers in the backfilled evidence, and the replay
   -- schedules them under the new rules; seeding them again would double-count. Only an explicit old revisit state (a failed
   -- old recheck, needs_revisit) has no such evidence, so only it is seeded. Everything else just loses the old fields.
   for r in select c.id,c.code,c.recheck_prompt,c.needs_revisit,c.recheck_due
     from public.checkpoints c where c.user_id=v_owner and c.status='demonstrated'
      and (c.recheck_due is not null or c.needs_revisit or c.recheck_prompt ~* '^\s*Recheck\s+CP[0-9]+') loop   -- idempotent: a kept concrete prompt is not work
    if r.needs_revisit then
     -- seed one T2-style trigger per concept (≤4) so the replay creates a recheck
     insert into public.evidence(user_id,occurred_at,project_id,checkpoint_id,concept_id,level,role,outcome,hint_level,novelty,kind,origin,confidence,ctx)
      select v_owner,now(),c.project_id,c.id,cc.concept_id,'understand','primary','pass',2,'novel','attempt','migration',0.5,
       pg_catalog.jsonb_build_object('migrated',true,'seed','needs_revisit','from',r.code)
      from public.checkpoints c join public.checkpoint_concepts cc on cc.checkpoint_id=c.id and cc.user_id=c.user_id
      where c.id=r.id and not exists(select 1 from public.evidence x where x.checkpoint_id=c.id and x.origin='migration' and x.ctx->>'seed'='needs_revisit' and x.concept_id=cc.concept_id)
      order by cc.concept_id limit 4;
     v_m:=v_m+1;
    end if;
    begin
     update public.checkpoints set recheck_due=null,needs_revisit=false,
       recheck_prompt=case when recheck_prompt ~* '^\s*Recheck\s+CP[0-9]+' then null else recheck_prompt end where id=r.id;
     if not r.needs_revisit then v_n:=v_n+1; end if;
    end;
   end loop;
   v_report:=v_report||pg_catalog.jsonb_build_object('recheck_fields',pg_catalog.jsonb_build_object('retired_without_seed',v_n,'seeded_from_needs_revisit',v_m,
     'plan_probes_kept_for_items',(select count(*) from public.checkpoints where user_id=v_owner and status='not_started' and recheck_prompt is not null)));
  end if;
  -- 3b. diagnostics: derived pace claims are dismissed (reversible); strengths create no rechecks; gaps become evidence-driven
  if 'diagnostics'=any(v_steps) then
   v_n:=0;
   if coalesce((p->>'dismiss_pace')::boolean,false) then
    update public.diagnostics set status='dismissed' where user_id=v_owner and kind='pace' and status<>'dismissed';
    get diagnostics v_n=row_count;
   end if;
   v_report:=v_report||pg_catalog.jsonb_build_object('diagnostics_pace_dismissed',v_n);
  end if;
  if v_dry then raise exception 'adaptive_dry_run'; end if;
 exception when others then
  if sqlerrm is distinct from 'adaptive_dry_run' then raise; end if;
 end;
 return v_report||pg_catalog.jsonb_build_object('dry_run',v_dry,'steps',to_jsonb(v_steps));
end
$migrate$;
revoke all on function public.adaptive_migrate(jsonb) from public,anon,authenticated;
grant execute on function public.adaptive_migrate(jsonb) to service_role;
