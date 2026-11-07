-- N47.2.1: owner-scoped read path with live per-acknowledgement staleness.
-- No acknowledgement is rewritten and no direct table DML is enabled.
create function public.overlap_acknowledgements_read(
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  id uuid, participants jsonb, starts_at timestamptz, ends_at timestamptz,
  reason text, disposition text, attributed_to jsonb, version integer,
  stale boolean
)
language sql stable security invoker set search_path = '' as $read$
  select a.id,a.participants,a.starts_at,a.ends_at,
         a.reason,a.disposition,a.attributed_to,a.version,
         public.overlap_ack_is_stale(a.user_id,a.participants) as stale
    from public.overlap_acknowledgements a
   where a.user_id = (select auth.uid())
   order by a.starts_at desc,a.id
   limit least(greatest(coalesce(p_limit,50),1),100)
   offset greatest(coalesce(p_offset,0),0)
$read$;

revoke all on function public.overlap_acknowledgements_read(integer,integer)
  from public,anon;
grant execute on function public.overlap_acknowledgements_read(integer,integer)
  to authenticated,service_role;
