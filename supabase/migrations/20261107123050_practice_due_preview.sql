-- N43.2.2.2.1: owner-authenticated due preview over owner-RLS topics.
-- Preview is advisory only. N43.2.2.2.2 must choose its own civil base
-- date, recheck the topic/version under a write lock, preserve prior fields
-- for undo, and authorise all record/void writes transactionally.
create function public.lemma_practice_due_preview(
  p_topic_id uuid, p_rating integer, p_base_date date
) returns table(
  topic_id uuid, topic_version integer, previous_due_date date,
  projected_due_date date, previous_practiced_at timestamptz,
  days_added integer
)
language plpgsql stable security invoker set search_path='' as $preview$
declare
  v_version integer;
  v_cadence jsonb;
  v_due date;
  v_last timestamptz;
  v_archived timestamptz;
  v_delay integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_base_date is null then
    raise exception 'Civil base date required';
  end if;
  select t.version,t.cadence,t.next_due_date,t.last_practiced_at,t.archived_at
    into v_version,v_cadence,v_due,v_last,v_archived
    from public.practice_topics t
    where t.id=p_topic_id and t.user_id=(select auth.uid());
  if not found then
    raise exception 'Practice topic not found for owner';
  end if;
  if v_archived is not null then
    raise exception 'Archived practice topic cannot be previewed';
  end if;
  v_delay:=public.lemma_practice_cadence_days(v_cadence,p_rating);
  return query
   select p_topic_id,v_version,v_due,p_base_date+v_delay,v_last,v_delay;
end
$preview$;
revoke all on function public.lemma_practice_due_preview(uuid,integer,date)
  from public,anon;
grant execute on function public.lemma_practice_due_preview(uuid,integer,date)
  to authenticated,service_role;
