-- Initial plan approval covers sources that existed when the proposal was made.
-- The source changes belong to the same action as the proposal decision.
create function public.lemma_initial_plan_sources() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if current_setting('lemma.tool',true) = 'undo' or new.kind <> 'plan'
    or new.status <> 'approved' or old.status = 'approved' then return new; end if;
 update public.sources set plan_checked_at = now()
 where user_id = new.user_id and project_id = new.project_id
   and created_at <= new.created_at and plan_checked_at is null;
 return new;
end $$;
revoke all on function public.lemma_initial_plan_sources() from public, anon;
create trigger z_initial_plan_sources after update of status on public.proposals
for each row execute function public.lemma_initial_plan_sources();
