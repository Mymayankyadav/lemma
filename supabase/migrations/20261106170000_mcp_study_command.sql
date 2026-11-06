-- N12 / Owner decision D6 (#912): a private, owner-bound bridge for the
-- service-role MCP connector. study_command remains invoker and unchanged.
-- The verified owner is supplied by the server's authenticated connector Context.
create function public.mcp_study_command(p_user uuid, p_source text, p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $mcp_study$
declare
  v_receipt jsonb;
begin
  if p_user is null or not exists (
    select 1 from public.settings where user_id = p_user
  ) then
    raise exception 'Owner not found';
  end if;

  perform pg_catalog.set_config('lemma.source', p_source, true);
  perform pg_catalog.set_config('lemma.tool', 'study', true);
  perform pg_catalog.set_config(
    'lemma.summary',
    pg_catalog.left(pg_catalog.concat('Study ', p ->> 'resource', ' ', p ->> 'operation'), 200),
    true
  );
  -- Transaction-scoped identity only: the trusted service-role caller supplies
  -- p_user, and study_command reads auth.uid() through this JWT claim.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
  v_receipt := public.study_command(p);

  update public.settings
  set connector_last_seen_at = now(),
      connector_last_client = case
        when p_source in ('claude', 'chatgpt', 'other') then p_source
        else connector_last_client
      end
  where user_id = p_user;

  return v_receipt;
end
$mcp_study$;

-- Only the connector's service-role key may invoke the privileged bridge.
-- Per D6 this revocation affects this NEW function only.
revoke all on function public.mcp_study_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_study_command(uuid,text,jsonb) to service_role;
