-- N185: activation counts the Owner's own projects only. Fixture projects (projects.system, e.g. the post-deploy selftest's
-- zz-selftest-* projects, which live in the Owner's account for minutes at a time) are outside the adaptive state (visibleProjects)
-- and can never carry a conversion, so while one existed the cutover could not activate.
-- Replaces function: public.atlas_check_release_report(uuid,jsonb), same signature, security and grants; only the project filter changes.
do $m$
begin
 if pg_catalog.to_regprocedure('public.atlas_check_release_report(uuid,jsonb)') is null then return;end if;
 execute $ddl$
create or replace function public.atlas_check_release_report(u uuid,r jsonb) returns void
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
 -- D1-D5 are reported for exactly the four streams; one with fewer than 50 events must say so (never a pass on thin data).
 if coalesce(jsonb_typeof(r->'diagnostics'),'')<>'array' or jsonb_array_length(r->'diagnostics')<>4 then raise exception 'Release gate missing: diagnostics for the four streams';end if;
 if (select count(distinct x->>'stream') from jsonb_array_elements(r->'diagnostics') x where x->>'stream' in ('attempt','card','duration','attendance'))<>4 then raise exception 'Release gate missing: diagnostics for the four streams';end if;
 for s in select jsonb_array_elements(r->'diagnostics') loop
  if coalesce(jsonb_typeof(s->'n'),'')<>'number' or (s->>'n')::numeric<>floor((s->>'n')::numeric) or (s->>'n')::numeric<0 then raise exception 'Release gate failed: stream % needs an integer event count n',s->>'stream';end if;
  if coalesce(jsonb_typeof(s->'status'),'')<>'string' then raise exception 'Release gate failed: stream % needs a status',s->>'stream';end if;
  if (s->>'n')::int<50 and s->>'status'<>'insufficient data' then raise exception 'Release gate failed: stream % with fewer than 50 events must show insufficient data',s->>'stream';end if;
  if (s->>'n')::int>=50 then
   -- 07 Acceptance 3: D1-D5 are reported for a stream with 50 or more events; a failing test is allowed because it changes serving (I13, 01 §9),
   -- e.g. D2 switches on the Platt layer. So `action` passes only with the D1-D5 results, at least one failed test and the serving change it names.
   if s->>'status' not in ('ok','action') then raise exception 'Release gate failed: diagnostics for stream % are %',s->>'stream',s->>'status';end if;
   if s->>'status'='action' and (coalesce(jsonb_typeof(s->'tests'),'')<>'object'
     or exists(select 1 from unnest(array['D1','D2','D3','D4','D5']) k where coalesce(jsonb_typeof(s->'tests'->k),'') not in ('boolean','null'))
     or not exists(select 1 from jsonb_each(s->'tests') t where t.value='false'::jsonb)
     or coalesce(jsonb_typeof(s->'actions'),'')<>'array' or jsonb_array_length(s->'actions')=0
     or exists(select 1 from jsonb_array_elements(s->'actions') x where jsonb_typeof(x)<>'string' or length(x#>>'{}')=0)) then
    raise exception 'Release gate failed: diagnostics for stream % are action without D1-D5 results and the serving change',s->>'stream';end if;
   if s->>'status'='ok' and jsonb_typeof(s->'tests')='object' and exists(select 1 from jsonb_each(s->'tests') t where t.value='false'::jsonb) then
    raise exception 'Release gate failed: diagnostics for stream % say ok with a failed test',s->>'stream';end if;
  end if;
 end loop;
 select count(*) into unconverted from public.projects p where p.user_id=u and p.status in ('planning','active','paused') and not coalesce(p.system,false)
  and not exists(select 1 from public.proposals x where x.user_id=u and x.project_id=p.id and x.status='approved' and x.decided_at is not null and x.result is not null
    -- journalled: the approval is an action in the undo journal that has not been undone. Browsers cannot write the journal, so a row inserted or edited from a session does not count.
    and exists(select 1 from public.action_changes ac join public.actions ax on ax.no=ac.action_no
      where ax.user_id=u and ax.undone_by is null and ac.table_name='proposals' and ac.op='update' and ac.row_pk->>'id'=x.id::text and ac.new->>'status'='approved')
    and x.payload#>>'{atlas_conversion,schema}'='plan_template_v1'
    -- applied, not just marked approved: every template checkpoint that is not already done exists in the project with its template
    and (select count(*) from public.checkpoints c where c.user_id=u and c.project_id=p.id and c.template is not null)
     >=(select count(*) from jsonb_array_elements(x.payload->'atlas_conversion'->'checkpoints') cx where cx->>'id' not in(select c2.id::text from public.checkpoints c2 where c2.user_id=u and c2.project_id=p.id and c2.status='demonstrated')));
 if unconverted>0 then raise exception 'Release gate failed: % project(s) without an approved conversion',unconverted;end if;
end $fn$;
 $ddl$;
end
$m$;
