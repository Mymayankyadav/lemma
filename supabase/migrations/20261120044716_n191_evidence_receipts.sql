-- Shared by server-owned P1/P3/P6 command functions. The caller authenticates
-- the actor and target BEFORE looking up a receipt, including on a retry.
-- These internal functions have no client EXECUTE grant.
-- PostgreSQL JSONB equality ignores numeric scale. Normalize it recursively
-- before hashing so 1, 1.0 and 1.00 retain existing command equivalence.
create function public.lemma_receipt_canonical(value jsonb) returns jsonb
language plpgsql immutable strict security invoker set search_path='' as $canonical$
begin
  case pg_catalog.jsonb_typeof(value)
    when 'number' then return pg_catalog.to_jsonb(pg_catalog.trim_scale(value::text::numeric));
    when 'array' then return coalesce((select pg_catalog.jsonb_agg(public.lemma_receipt_canonical(e) order by n)
      from pg_catalog.jsonb_array_elements(value) with ordinality a(e,n)),'[]'::jsonb);
    when 'object' then return coalesce((select pg_catalog.jsonb_object_agg(k,public.lemma_receipt_canonical(e))
      from pg_catalog.jsonb_each(value) a(k,e)),'{}'::jsonb);
    else return value;
  end case;
end
$canonical$;
revoke all on function public.lemma_receipt_canonical(jsonb) from public,anon,authenticated,service_role;

create function public.lemma_trusted_receipt_begin(
  p_owner uuid, p_operation_id uuid, p_resource text, p_request jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $begin_receipt$
declare
  prior public.command_receipts%rowtype;
  digest text;
begin
  if p_owner is null or p_operation_id is null or nullif(p_resource,'') is null
     or pg_catalog.jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'Invalid command receipt' using errcode='22023';
  end if;

  -- The separately reviewed privilege cutover creates this column after all
  -- direct browser writers have been removed. Earlier rows have NULL provenance.
  if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid='public.command_receipts'::pg_catalog.regclass
        and attname='trusted_writer_version' and not attisdropped
    ) or exists (
      select 1 from (values ('anon'), ('authenticated')) as r(role_name)
      where pg_catalog.has_table_privilege(r.role_name,'public.command_receipts','INSERT, UPDATE, DELETE, TRUNCATE')
        or pg_catalog.has_any_column_privilege(r.role_name,'public.command_receipts','INSERT, UPDATE')
    ) then
    raise exception 'Trusted command receipts are unavailable' using errcode='55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner::text || ':' || p_operation_id::text,0));
  select * into prior from public.command_receipts
    where user_id=p_owner and operation_id=p_operation_id;
  if not found then return null; end if;

  -- JSONB provides a deterministic object-key order; array order is significant.
  digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(public.lemma_receipt_canonical(p_request)::text,'UTF8')),'hex');
  if (pg_catalog.to_jsonb(prior)->>'trusted_writer_version')='1' and prior.resource=p_resource
     and prior.result->>'_request_sha256'=digest then
    return prior.result-'_request_sha256'-'_request';
  end if;
  return pg_catalog.jsonb_build_object('operationId',p_operation_id,'status','conflict');
end
$begin_receipt$;
revoke all on function public.lemma_trusted_receipt_begin(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.lemma_trusted_receipt_finish(
  p_owner uuid, p_operation_id uuid, p_resource text, p_request jsonb, p_result jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $finish_receipt$
declare
  digest text;
begin
  if pg_catalog.jsonb_typeof(p_result) is distinct from 'object'
     or p_result ? '_request_sha256' or p_result ? '_request' then
    raise exception 'Invalid command result' using errcode='22023';
  end if;
  -- Re-check the invariant at the write boundary. The lock is reentrant in
  -- the same transaction. A competing/incorrect writer rolls back the domain write.
  if public.lemma_trusted_receipt_begin(p_owner,p_operation_id,p_resource,p_request) is not null then
    raise exception 'Command receipt already exists' using errcode='40001';
  end if;
  digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(public.lemma_receipt_canonical(p_request)::text,'UTF8')),'hex');
  -- trusted_writer_version is intentionally supplied by the owner cutover.
  -- Keep the INSERT statically parameterized and reject a missing column.
  insert into public.command_receipts(user_id,operation_id,resource,result,trusted_writer_version)
    values (p_owner,p_operation_id,p_resource,
            p_result||pg_catalog.jsonb_build_object('_request_sha256',digest,'_request',null),1);
  return p_result;
end
$finish_receipt$;
revoke all on function public.lemma_trusted_receipt_finish(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
