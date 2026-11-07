-- N43.2.1: authentication-bound, read-only envelope validation only.
-- N43.2.2 adds transactional commands, receipts, owner locks, due inverses,
-- journal/undo and registered MCP routing before permitting writes.
create function public.practice_topics_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $validate$
declare op text; t jsonb; patch jsonb; allowed text[]; bad text; k text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 select key into bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key <> all(array['operationId','schemaVersion','resource',
    'operation','target','expectedVersion','patch']) limit 1;
 if bad is not null then raise exception 'Unknown command field: %',bad; end if;
 if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'operationId must be a UUID'; end if;
 perform (p->>'operationId')::uuid;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
   or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'practice_topics' then
  raise exception 'Unsupported practice resource'; end if;
 op:=p->>'operation';
 if op is null or op not in
   ('create','update','archive','restore','delete','record','void_event') then
  raise exception 'Unsupported practice operation'; end if;
 t:=coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(t) is distinct from 'object' then
  raise exception 'target must be an object'; end if;
 select key into bad from pg_catalog.jsonb_object_keys(t) as keys(key)
  where key<>'id' limit 1;
 if bad is not null then raise exception 'Unknown target field: %',bad; end if;
 if t?'id' then
  if pg_catalog.jsonb_typeof(t->'id') is distinct from 'string' then
   raise exception 'target.id must be a UUID'; end if;
  perform (t->>'id')::uuid;
 elsif op<>'create' then raise exception 'target.id required'; end if;
 if op='create' then
  if p?'expectedVersion' and
   (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' is distinct from '0') then
   raise exception 'Create expectedVersion must be absent or zero'; end if;
 else
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be positive'; end if;
  if (p->>'expectedVersion')::numeric>2147483647 then
   raise exception 'expectedVersion exceeds int4'; end if;
 end if;
 patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(patch) is distinct from 'object' then
  raise exception 'patch must be an object'; end if;
 allowed:=case when op in ('create','update') then
  array['title','subject_id','concept_id','checkpoint_id','next_due_date','cadence']
  when op='record' then array['rating','occurred_at','response','minutes']
  else array[]::text[] end;
 select key into bad from pg_catalog.jsonb_object_keys(patch) as keys(key)
  where key <> all(allowed) limit 1;
 if bad is not null then raise exception 'Unknown practice patch field: %',bad; end if;
 if op='create' and not(patch?'title') then raise exception 'Create requires title'; end if;
 if op='update' and patch='{}'::jsonb then raise exception 'Update patch empty'; end if;
 if op='record' and not(patch?'rating') then raise exception 'Record requires rating'; end if;
 if patch?'title' and
  (pg_catalog.jsonb_typeof(patch->'title') is distinct from 'string' or
   pg_catalog.char_length(pg_catalog.btrim(patch->>'title')) not between 1 and 200) then
  raise exception 'Invalid practice title'; end if;
 foreach k in array array['subject_id','concept_id','checkpoint_id'] loop
  if patch?k and patch->k<>'null'::jsonb then
   if pg_catalog.jsonb_typeof(patch->k) is distinct from 'string' then
    raise exception '% must be UUID',k; end if;
   perform (patch->>k)::uuid;
  end if;
 end loop;
 if patch?'next_due_date' and patch->'next_due_date'<>'null'::jsonb then
  if pg_catalog.jsonb_typeof(patch->'next_due_date') is distinct from 'string'
    or patch->>'next_due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception 'next_due_date must be a civil date'; end if;
  perform (patch->>'next_due_date')::date;
 end if;
 if patch?'cadence' and not public.lemma_valid_practice_cadence(patch->'cadence') then
  raise exception 'Invalid practice cadence'; end if;
 if patch?'rating' and
  (pg_catalog.jsonb_typeof(patch->'rating') is distinct from 'number'
   or patch->>'rating' !~ '^[1-4]$') then
  raise exception 'rating must be whole 1..4'; end if;
 if patch?'response' and patch->'response'<>'null'::jsonb and
  (pg_catalog.jsonb_typeof(patch->'response') is distinct from 'string'
   or pg_catalog.char_length(patch->>'response')>4000) then
  raise exception 'Invalid response'; end if;
 if patch?'minutes' and patch->'minutes'<>'null'::jsonb and
  (pg_catalog.jsonb_typeof(patch->'minutes') is distinct from 'number'
    or patch->>'minutes' !~ '^(0|[1-9][0-9]*)$'
    or (patch->>'minutes')::numeric>1440) then
  raise exception 'Invalid practice minutes'; end if;
 if patch?'occurred_at' then
  if pg_catalog.jsonb_typeof(patch->'occurred_at') is distinct from 'string'
   or patch->>'occurred_at' !~
    '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
   raise exception 'occurred_at requires a finite ISO instant'; end if;
  perform (patch->>'occurred_at')::timestamptz;
 end if;
 return p;
end
$validate$;
revoke all on function public.practice_topics_validate_envelope(jsonb) from public,anon;
grant execute on function public.practice_topics_validate_envelope(jsonb) to authenticated,service_role;
