-- Preparing facts does not activate v3. Activation requires a separately approved dry-run diff.
create function public.atlas_v2_migrate(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare u uuid:=(p->>'owner')::uuid;dry boolean:=coalesce((p->>'dry_run')::boolean,true);report jsonb;src bigint;n bigint;merged bigint;untagged bigint;ins bigint;snapshot jsonb;r record;
begin
 if coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'Service role required';end if;
 if u is null or not exists(select 1 from public.settings where user_id=u) then raise exception 'Owner with settings required';end if;
 perform pg_advisory_xact_lock(hashtextextended('atlas_v2_migrate:'||u::text,0));
 select count(*) into src from public.evidence where user_id=u and voided_at is null and superseded_by is null;
 select count(*),count(*) filter(where concept_id is null) into n,untagged from(
  select concept_id,level,outcome,date_trunc('second',occurred_at) from public.evidence where user_id=u and voided_at is null and superseded_by is null group by 1,2,3,4
 ) g;merged:=src-n;
 select count(*) into ins from(select e.session_id,e.concept_id from public.evidence e where e.user_id=u and e.voided_at is null and e.superseded_by is null and e.kind<>'pretest' and e.session_id is not null and e.concept_id is not null and exists(select 1 from public.evidence pre where pre.user_id=u and pre.session_id=e.session_id and pre.concept_id=e.concept_id and pre.kind='pretest' and pre.voided_at is null and pre.occurred_at<=e.occurred_at) group by 1,2) g;
 snapshot:=jsonb_build_object('evidence',jsonb_build_object('count',src,'sha256',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' order by id),''),'UTF8')),'hex') from public.evidence e where user_id=u)),
  'concepts',jsonb_build_object('count',(select count(*) from public.concepts where user_id=u),'sha256',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text,'' order by id),''),'UTF8')),'hex') from public.concepts c where user_id=u)));
 report:=jsonb_build_object('dry_run',dry,'source',src,'attempts',n,'merged',merged,'untagged',untagged,'instructions',ins,'snapshot',snapshot,
  'diff_hash',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
  'unresolved',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.evidence where user_id=u and concept_id is null and voided_at is null),'activated',false);
 if dry then return report;end if;
 perform set_config('lemma.source','system',true);perform set_config('lemma.tool','atlas_v2_migrate',true);perform set_config('lemma.summary','Atlas v3 fact migration',true);
 insert into public.owner_export_snapshots(user_id,data) values(u,snapshot);
 for r in select min(id) keep_id,array_agg(id order by id) ids from public.evidence where user_id=u and voided_at is null and superseded_by is null group by date_trunc('second',occurred_at),concept_id,level,outcome loop
  insert into public.attempts(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,item_id,item_kind,context,legacy_outcome,grader,origin,weight,source_evidence_id)
   select u,e.occurred_at,e.session_id,e.session_event_id,e.project_id,e.checkpoint_id,e.item_id,
    case e.kind when 'pretest' then 'prepare' when 'recall' then 'recall' when 'recheck' then 'recheck' else 'legacy' end,
    coalesce(e.ctx,'{}'::jsonb)||jsonb_build_object('merged',to_jsonb(r.ids[2:cardinality(r.ids)]),'novelty',e.novelty),e.outcome,'migration','migration',
    e.confidence*case e.novelty when 'familiar' then .5 when 'seen_solution' then .2 when 'self_reported' then .2 else 1 end,e.id
   from public.evidence e where e.id=r.keep_id and e.user_id=u on conflict(user_id,source_evidence_id) do nothing;
  insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,hint_level)
   select u,a.id,e.concept_id,e.level,case e.role when 'primary' then 'target' when 'secondary' then 'required' else 'incidental' end,e.hint_level
    from public.attempts a join public.evidence e on e.id=a.source_evidence_id and e.user_id=a.user_id where a.user_id=u and a.source_evidence_id=r.keep_id and e.concept_id is not null
    on conflict(attempt_id,concept_id,facet,stage) do nothing;
 end loop;
 insert into public.instruction_events(user_id,occurred_at,session_id,concept_id,origin,source_key)
 select u,min(e.occurred_at),e.session_id,e.concept_id,'migration','legacy:'||e.session_id||':'||e.concept_id from public.evidence e
 where e.user_id=u and e.voided_at is null and e.superseded_by is null and e.kind<>'pretest' and e.session_id is not null and e.concept_id is not null
 and exists(select 1 from public.evidence pre where pre.user_id=u and pre.session_id=e.session_id and pre.concept_id=e.concept_id and pre.kind='pretest' and pre.voided_at is null and pre.occurred_at<=e.occurred_at)
 group by e.session_id,e.concept_id on conflict(user_id,source_key) do nothing;
 return report;
end $fn$;
revoke all on function public.atlas_v2_migrate(jsonb) from public,anon,authenticated;
grant execute on function public.atlas_v2_migrate(jsonb) to service_role;

create function public.atlas_freeze_evidence() returns trigger language plpgsql set search_path='' as $fn$
begin
 -- Direct writes are frozen; a cascade from a deleted project or account (a foreign-key action runs at trigger depth 2) is not a write.
 if pg_trigger_depth()>1 then if tg_op='DELETE' then return old;end if;return new;end if;
 if exists(select 1 from public.settings where user_id=coalesce(new.user_id,old.user_id) and atlas_migrated_at is not null) then raise exception 'Evidence is frozen after Atlas cutover';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $fn$;
create trigger atlas_evidence_frozen before insert or update or delete on public.evidence for each row execute function public.atlas_freeze_evidence();

-- Activation is judged on numbers the release run reports (07 Acceptance 1-8) and on facts the database can check itself: every active project has an approved conversion.
-- The report is evidence supplied by the release run, so each gate is compared here against its fixed threshold; a missing gate is a failure, never a pass.
create function public.atlas_check_release_report(u uuid,r jsonb) returns void
language plpgsql stable security definer set search_path='' as $fn$
declare g record;v numeric;s jsonb;unconverted int;
begin
 if r is null or jsonb_typeof(r)<>'object' or coalesce(jsonb_typeof(r->'gates'),'')<>'object' then raise exception 'Release gate report required';end if;
 for g in select * from (values
  ('kf_kl_w1','<=',0.040),('kf_kl_w2','<=',0.050),('kf_reduction_vs_v2','>=',0.40),('attempt_calibration_slope_lo','>=',0.85),('attempt_calibration_slope_hi','<=',1.15),
  ('attempt_calibration_abs_intercept','<=',0.2),('fatigue_abs_z','<=',3),('card_kl_vs_default','<=',0),('duration_log_density','>=',-0.70),('duration_coverage_lo','>=',0.75),
  ('duration_coverage_hi','<=',0.85),('attendance_log_loss','<=',0.57),('e2e_p2c_minus_p0','>',0),('e2e_se_ratio','>',2),('resume_tokens_max','<=',1500),('card_tokens_max','<=',100)
 ) as t(name,op,threshold) loop
  -- A gate is a JSON number: a string such as "-Infinity" or "NaN" casts to numeric but is not a measurement.
  if coalesce(jsonb_typeof(r->'gates'->g.name),'')<>'number' then raise exception 'Release gate missing: %',g.name;end if;
  v:=(r->'gates'->>g.name)::numeric;
  if not (case g.op when '<=' then v<=g.threshold when '>=' then v>=g.threshold when '>' then v>g.threshold end) then raise exception 'Release gate failed: % % % (reported %)',g.name,g.op,g.threshold,v;end if;
 end loop;
 if coalesce((r->>'parity_ok')::boolean,false) is not true then raise exception 'Release gate failed: app and MCP parity';end if;
 if coalesce((r->>'no_beta_imports')::boolean,false) is not true then raise exception 'Release gate failed: Beta proficiency code still imported';end if;
 -- D1-D5 are reported for exactly the four streams; a stream with 50 or more events must be ok, one with fewer must say so (never a pass on thin data).
 if coalesce(jsonb_typeof(r->'diagnostics'),'')<>'array' or jsonb_array_length(r->'diagnostics')<>4 then raise exception 'Release gate missing: diagnostics for the four streams';end if;
 if (select count(distinct x->>'stream') from jsonb_array_elements(r->'diagnostics') x where x->>'stream' in ('attempt','card','duration','attendance'))<>4 then raise exception 'Release gate missing: diagnostics for the four streams';end if;
 for s in select jsonb_array_elements(r->'diagnostics') loop
  if coalesce(jsonb_typeof(s->'n'),'')<>'number' or (s->>'n')::numeric<>floor((s->>'n')::numeric) or (s->>'n')::numeric<0 then raise exception 'Release gate failed: stream % needs an integer event count n',s->>'stream';end if;
  if coalesce(jsonb_typeof(s->'status'),'')<>'string' then raise exception 'Release gate failed: stream % needs a status',s->>'stream';end if;
  if (s->>'n')::int>=50 and s->>'status'<>'ok' then raise exception 'Release gate failed: diagnostics for stream % are %',s->>'stream',s->>'status';end if;
  if (s->>'n')::int<50 and s->>'status'<>'insufficient data' then raise exception 'Release gate failed: stream % with fewer than 50 events must show insufficient data',s->>'stream';end if;
 end loop;
 select count(*) into unconverted from public.projects p where p.user_id=u and p.status in ('planning','active','paused')
  and not exists(select 1 from public.proposals x where x.user_id=u and x.project_id=p.id and x.status='approved' and x.decided_at is not null and x.result is not null
    and x.payload#>>'{atlas_conversion,schema}'='plan_template_v1'
    -- applied, not just marked approved: every template checkpoint that is not already done exists in the project with its template
    and (select count(*) from public.checkpoints c where c.user_id=u and c.project_id=p.id and c.template is not null)
     >=(select count(*) from jsonb_array_elements(x.payload->'atlas_conversion'->'checkpoints') cx where cx->>'id' not in(select c2.id::text from public.checkpoints c2 where c2.user_id=u and c2.project_id=p.id and c2.status='demonstrated')));
 if unconverted>0 then raise exception 'Release gate failed: % project(s) without an approved conversion',unconverted;end if;
end $fn$;
revoke all on function public.atlas_check_release_report(uuid,jsonb) from public,anon,authenticated;

create function public.atlas_v2_activate(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare u uuid:=(p->>'owner')::uuid;report jsonb;
begin
 if coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'Service role required';end if;
 report:=public.atlas_v2_migrate(jsonb_build_object('owner',u,'dry_run',true));
 if p->>'approved_diff_hash' is distinct from report->>'diff_hash' then raise exception 'Owner-approved dry-run hash required';end if;
 if (select count(*) from public.attempts where user_id=u and source_evidence_id is not null)<>(report->>'attempts')::bigint then raise exception 'Migration incomplete';end if;
 if not exists(select 1 from public.model_fits where user_id=u and params->>'version'='3') then raise exception 'Model fit and calibration report required';end if;
 -- Conversion approvals and quantitative replay gates are supplied by the release report, never a read or worker.
 perform public.atlas_check_release_report(u,p->'release_report');
 perform set_config('lemma.source','system',true);perform set_config('lemma.tool','atlas_v2_activate',true);perform set_config('lemma.summary','Activate approved Atlas v3 cutover',true);
 update public.settings set atlas_migrated_at=coalesce(atlas_migrated_at,now()) where user_id=u;
 return report||jsonb_build_object('activated',true);
end $fn$;
revoke all on function public.atlas_v2_activate(jsonb) from public,anon,authenticated;
grant execute on function public.atlas_v2_activate(jsonb) to service_role;
