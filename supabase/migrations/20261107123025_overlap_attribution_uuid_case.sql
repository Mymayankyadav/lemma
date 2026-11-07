-- bug #1072: compare attributed participant UUIDs as typed IDs, not JSON string casing.
-- Compatible replacement of N47.1's immutable choice guard. The existing
-- participant count/shape/version and owner constraints remain in place.
create or replace function public.overlap_ack_choice_valid(
  p jsonb,p_disposition text,p_choice jsonb
) returns boolean
language plpgsql immutable security invoker set search_path='' as $choice$
declare
  choice_id uuid;
  part jsonb;
  k text;
begin
  if p_disposition='keep_both' then return p_choice is null; end if;
  if p_disposition is distinct from 'attribute_to'
    or pg_catalog.jsonb_typeof(p_choice) is distinct from 'object'
    or p_choice->>'kind' not in ('block','entry')
    or pg_catalog.jsonb_typeof(p_choice->'id') is distinct from 'string'
    or p_choice->>'id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  for k in select key from pg_catalog.jsonb_object_keys(p_choice) as keys(key) loop
    if k not in ('kind','id') then return false; end if;
  end loop;
  if pg_catalog.jsonb_typeof(p) is distinct from 'array' then return false; end if;
  choice_id := (p_choice->>'id')::uuid;
  for part in select value from pg_catalog.jsonb_array_elements(p) as elements(value) loop
    if pg_catalog.jsonb_typeof(part) is distinct from 'object' then continue; end if;
    if part->>'kind' is distinct from p_choice->>'kind' then continue; end if;
    if pg_catalog.jsonb_typeof(part->'id') is distinct from 'string'
      or part->>'id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then
      continue;
    end if;
    if (part->>'id')::uuid=choice_id then return true; end if;
  end loop;
  return false;
exception when invalid_text_representation then return false;
end
$choice$;
-- The signature, immutable/invoker semantics and grants are unchanged.
-- No ALTER POLICY, DML, registry or privilege replacement is performed.
