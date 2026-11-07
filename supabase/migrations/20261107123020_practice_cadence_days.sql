-- N43.2.2.1: pure cadence delay shared by record/void lifecycle.
-- This helper never writes or chooses a base date; the transaction must use
-- the owner's current locked topic and preserve prior due/last-practiced.
create function public.lemma_practice_cadence_days(p_cadence jsonb,p_rating integer)
returns integer
language plpgsql immutable security invoker set search_path = '' as $delay$
declare v_kind text; v_days integer;
begin
 if not public.lemma_valid_practice_cadence(p_cadence) then
  raise exception 'Invalid practice cadence';
 end if;
 if p_rating is null or p_rating not between 1 and 4 then
  raise exception 'Practice rating must be 1 through 4';
 end if;
 v_kind:=p_cadence->>'kind';
 if v_kind='fixed_days' then
  v_days:=(p_cadence->>'days')::integer;
 else
  v_days:=(p_cadence->'daysByRating'->(p_rating-1))::text::integer;
 end if;
 if v_days not between 1 and 3650 then
  raise exception 'Practice cadence delay out of range';
 end if;
 return v_days;
end
$delay$;
revoke all on function public.lemma_practice_cadence_days(jsonb,integer)
  from public,anon;
grant execute on function public.lemma_practice_cadence_days(jsonb,integer)
  to authenticated,service_role;
