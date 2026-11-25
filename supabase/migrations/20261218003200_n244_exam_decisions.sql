-- Immutable forecasts. Owner deletion and sitting cascades may purge the log.
create table public.exam_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  sitting_id uuid not null,
  decided_at timestamptz not null default statement_timestamp(),
  as_of timestamptz not null,
  inputs_hash text not null check (inputs_hash ~ '^[a-f0-9]{64}$'),
  inputs jsonb not null,
  candidates jsonb not null check (jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 10),
  chosen jsonb not null,
  runner_up jsonb,
  qualitative jsonb not null,
  predictions jsonb not null,
  rationale text not null,
  policy text not null check (policy='selector-v1'),
  shadow boolean not null check (shadow),
  foreign key (user_id,project_id,sitting_id) references public.exam_sittings(user_id,project_id,id) on delete cascade
);
create index exam_decisions_owner_sitting on public.exam_decisions(user_id,sitting_id,decided_at,id);
alter table public.exam_decisions enable row level security;
create policy exam_decisions_owner_read on public.exam_decisions for select to authenticated using (user_id=(select auth.uid()));
revoke insert,update,delete,truncate,references,trigger on public.exam_decisions from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.exam_decisions from service_role;
grant select on public.exam_decisions to authenticated,service_role;
create trigger lemma_account_delete_write_guard before insert or update or delete on public.exam_decisions
  for each row execute function public.lemma_block_account_deletion_writes();
insert into lemma_export_private.additional_tables(table_name) values ('exam_decisions');

create function public.log_exam_decision(p_owner uuid,p_sitting uuid,p_as_of timestamptz,p_decision jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege; end if;
  insert into public.exam_decisions(user_id,project_id,sitting_id,as_of,inputs_hash,inputs,candidates,chosen,runner_up,qualitative,predictions,rationale,policy,shadow)
  select s.user_id,s.project_id,s.id,p_as_of,p_decision->>'inputs_hash',p_decision->'inputs',p_decision->'candidates',p_decision->'chosen',
    nullif(p_decision->'runner_up','null'),p_decision->'qualitative',p_decision->'predictions',p_decision->'chosen'->>'rationale',p_decision->>'policy',(p_decision->>'shadow')::boolean
  from public.exam_sittings s where s.user_id=p_owner and s.id=p_sitting;
  if not found then raise insufficient_privilege; end if;
end $$;
revoke all on function public.log_exam_decision(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.log_exam_decision(uuid,uuid,timestamptz,jsonb) to service_role;

create function public.exam_decision_immutable() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' or (tg_op='DELETE' and pg_trigger_depth()<=1 and exists
      (select from public.exam_sittings s where s.id=old.sitting_id)) then
    raise exception 'Exam decisions are append-only';
  end if;
  return old;
end $$;
revoke all on function public.exam_decision_immutable() from public,anon,authenticated,service_role;
create trigger immutable_exam_decision before update or delete on public.exam_decisions for each row execute function public.exam_decision_immutable();
