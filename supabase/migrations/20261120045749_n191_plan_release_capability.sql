-- One public launch for the November 20 study, tutor, Pad and agenda changes.
-- The launch migration replaces this body after the integrated release checks.
create function public.lemma_plan_released() returns boolean
language sql stable security invoker set search_path = ''
as $$ select false $$;

revoke all on function public.lemma_plan_released() from public, anon;
grant execute on function public.lemma_plan_released() to authenticated, service_role;
