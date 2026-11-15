-- N165: reviewed additive bug-hunt corrections; ordered part 1.
-- N165: additive corrections for the Owner-authorized consolidated bug-hunt PR.
-- Existing deployed migrations are unchanged. Replacement signatures/ownership are documented in the PR.


create or replace function public.task_series_materialize(p_series_id uuid,p_today date)
returns integer language plpgsql security definer set search_path = '' as $mat$
declare
 s public.task_series%rowtype; v_from date; v_to date; d date; v_made integer := 0;
begin
 select * into s from public.task_series where id = p_series_id for update;
 if not found or s.status <> 'active' then return 0; end if;
 v_to := least(p_today + 14,coalesce(s.until_date,p_today + 14));
 v_from := greatest(coalesce(s.materialized_through,s.start_date - 1),p_today - 1);
 if v_to <= v_from then
  update public.task_series set materialized_through=greatest(coalesce(materialized_through,v_to),v_to) where id=s.id;
  return 0; end if;
 for d in select x from public.task_series_dates(s.freq,s.interval_n,s.by_weekday,
   s.by_monthday,s.start_date,s.until_date,v_from,v_to) x loop
  if d = any(s.skipped_dates) then continue; end if;
  v_made := v_made + public.task_series_insert_occurrence(s,d);
 end loop;
 update public.task_series set materialized_through = v_to where id = s.id;
 return v_made;
end
$mat$;

