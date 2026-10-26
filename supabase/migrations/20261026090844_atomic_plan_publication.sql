
alter table public.study_plan_versions add column request_id uuid;
create unique index study_plan_versions_request_unique on public.study_plan_versions(user_id,request_id) where request_id is not null;
-- Client cannot bypass approval/audit by directly modifying the plan or its version ledger.
revoke insert,update,delete on public.study_plans from authenticated;
grant select on public.study_plans to authenticated;
revoke insert,update,delete on public.study_plan_versions from authenticated;
grant select on public.study_plan_versions to authenticated;

create function public.publish_study_plan(
 p_plan_id uuid, p_expected_revision bigint, p_request_id uuid, p_title text,
 p_objective text, p_snapshot jsonb, p_change_summary text,
 p_context_id uuid default null, p_expected_context_revision bigint default null,
 p_author_model text default null
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid := auth.uid();
 v_existing bigint;
 v_ctx_rev bigint;
 v_request_plan uuid;
 v_request_revision bigint;
 v_request_snapshot jsonb;
 v_new_revision bigint;
 v_kind text;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 if p_plan_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision < 0 then
  raise exception 'invalid_plan_revision_request';
 end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
    or p_title is null or length(trim(p_title)) = 0
    or length(p_title) > 200 or length(coalesce(p_change_summary,'')) > 4000
    or octet_length(p_snapshot::text) > 1048576 then
  raise exception 'invalid_plan_payload';
 end if;
 -- Serialize simultaneous publish attempts for a given user's plan, including first creation.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_plan_id::text, 0));
 select plan_id, revision, snapshot
 into v_request_plan, v_request_revision, v_request_snapshot
 from public.study_plan_versions
 where user_id=v_user and request_id=p_request_id;
 if found then
  if v_request_plan <> p_plan_id or v_request_snapshot <> p_snapshot then
   raise exception 'idempotency_key_reused';
  end if;
  return v_request_revision;
 end if;

 if p_context_id is not null then
  select revision into v_ctx_rev from public.study_context_files
  where user_id=v_user and id=p_context_id;
  if not found or (p_expected_context_revision is not null and v_ctx_rev <> p_expected_context_revision) then
   raise exception 'stale_or_missing_context';
  end if;
 elsif p_expected_context_revision is not null then
  raise exception 'context_id_required';
 end if;

 select revision into v_existing
 from public.study_plans
 where user_id=v_user and id=p_plan_id for update;
 if not found then
  if p_expected_revision <> 0 then raise exception 'stale_plan_revision'; end if;
  v_new_revision := 1;
  v_kind := 'initial';
  insert into public.study_plans(user_id,id,title,objective,plan,revision,updated_at)
  values(v_user,p_plan_id,p_title,coalesce(p_objective,''),p_snapshot,v_new_revision,clock_timestamp());
 else
  if v_existing <> p_expected_revision then raise exception 'stale_plan_revision'; end if;
  v_new_revision := v_existing+1;
  v_kind := 'amendment';
  update public.study_plans set title=p_title,objective=coalesce(p_objective,''),
    plan=p_snapshot,revision=v_new_revision,updated_at=clock_timestamp()
  where user_id=v_user and id=p_plan_id;
 end if;
 insert into public.study_plan_versions(user_id,plan_id,revision,context_id,context_revision,snapshot,
    creation_kind,change_summary,author_model,request_id)
 values(v_user,p_plan_id,v_new_revision,p_context_id,v_ctx_rev,p_snapshot,
    v_kind,coalesce(p_change_summary,''),left(p_author_model,100),p_request_id);
 return v_new_revision;
end
$$;
revoke all on function public.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) from PUBLIC, anon;
grant execute on function public.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) to authenticated;

