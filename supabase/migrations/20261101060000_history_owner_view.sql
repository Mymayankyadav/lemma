-- FIX #606: project history must enforce the connector owner at the query boundary.
-- The journal intentionally has no denormalized user_id; derive it from the
-- immutable action owner. Only project identifiers are projected, never\n-- the potentially sensitive old/new journal payloads. SECURITY INVOKER preserves both underlying RLS
-- policies for authenticated callers. The service role must still filter
-- v_action_changes_owner.user_id explicitly (it bypasses RLS).
create view public.v_action_changes_owner with (security_invoker = true) as
select c.id, c.action_no, a.user_id,
       c.old ->> 'project_id' as old_project_id,
       c.old ->> 'id' as old_id,
       c.new ->> 'project_id' as new_project_id,
       c.new ->> 'id' as new_id
from public.action_changes as c
join public.actions as a on a.no = c.action_no;

revoke all on public.v_action_changes_owner from public, anon;
grant select on public.v_action_changes_owner to authenticated, service_role;

comment on view public.v_action_changes_owner is
  'Owner-projected journal read boundary for MCP project history; callers must filter user_id before pagination. Rollback: drop view public.v_action_changes_owner.';
