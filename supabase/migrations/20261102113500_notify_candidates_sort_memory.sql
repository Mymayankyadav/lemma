-- FIX #679c: give the owner-scoped 30k-card notification candidate query
-- enough bounded sort memory for sibling deduplication and quota ranking.
-- Function-local only: no session/database work_mem change, no data rewrite,
-- no altered SQL semantics, RLS or EXECUTE grants. The existing
-- enable_nestloop=off function-local planner setting remains in force.
-- Down: alter function public.notify_candidates(uuid,timestamptz) reset work_mem;
alter function public.notify_candidates(uuid,timestamptz)
  set work_mem = '16MB';
