-- incident #1003: additive correction for N38's versioned settings audit on RPC replay.
-- The remote-applied 20261106210000 migration remains byte-for-byte unchanged.
-- Preserve the dispatcher signature, owner/source validation, grants, and
-- command receipts; only suppress audit writes for idempotent/no-op replays.
create or replace function public.mcp_command(p_user uuid, p_source text, p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $mcp_dispatch$
declare
  v_resource text;
  v_command_fn text;
  v_mcp_ok boolean;
  v_receipt jsonb;
  v_summary text;
begin
  if coalesce(current_setting('role',true),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user is null then raise exception 'Owner required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  v_resource := nullif(p ->> 'resource','');
  select r.command_fn,r.mcp_ok into v_command_fn,v_mcp_ok
    from public.lemma_command_resources r where r.resource=v_resource;
  if not found then raise exception 'Unknown command resource'; end if;
  if not v_mcp_ok then raise exception 'Resource disabled for MCP'; end if;
  -- The connector validates this owner before dispatch; never trust a claimed
  -- owner or function name in the user-provided command envelope.
  if not exists (select 1 from public.settings where user_id=p_user) then
    raise exception 'Owner not found';
  end if;
  v_summary := case v_command_fn
    when 'study_command' then pg_catalog.concat('Study ',v_resource,' ',p ->> 'operation')
    when 'task_command' then pg_catalog.concat('Task ',p ->> 'operation')
    else pg_catalog.concat(v_resource,' ',p ->> 'operation')
  end;
  -- Preserve D6/D7 MCP bridge owner/source, audit and transaction semantics.
  perform pg_catalog.set_config('lemma.source',p_source,true);
  perform pg_catalog.set_config('lemma.tool','study',true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left(v_summary,200),true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  -- The command function, never its name from p, owns the ordinary optimistic
  -- version, idempotent receipt, journal action and conflict semantics.
  execute pg_catalog.format('select public.%I($1::jsonb)',v_command_fn)
    into v_receipt using p;
  -- A receipt replay or optimistic conflict must not mutate connector settings
  -- or create a later journal action which blocks undo of the original write.
  -- The underlying command writes public.actions in this same transaction only
  -- when a genuinely new owner mutation succeeds. This also handles a concurrent
  -- same-operationId retry after the original command's advisory lock releases.
  if exists (
    select 1 from public.actions a
    where a.txid=pg_catalog.txid_current() and a.user_id=p_user
  ) then
    update public.settings set connector_last_seen_at=now(),
      connector_last_client=case when p_source in ('claude','chatgpt','other')
        then p_source else connector_last_client end
      where user_id=p_user;
  end if;
  return v_receipt;
end
$mcp_dispatch$;
