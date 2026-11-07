-- N42.2.1: live owner-scoped deadline feed, without copying projections.
-- Physical deadlines keep their civil/instant due kinds; projected project
-- targets and checkpoint dates remain read-only views of their source rows.
create function public.deadline_feed(p_limit integer default 50, p_offset integer default 0)
returns table (
  origin text, source_id uuid, title text, kind text, due_kind text,
  due_date date, due_at timestamptz, status text, projected boolean,
  subject_id uuid, project_id uuid, checkpoint_id uuid,
  remaining_minutes integer, estimate_source text, version integer
)
language sql stable security invoker set search_path = '' as $deadline_feed$
  select f.origin, f.source_id, f.title, f.kind, f.due_kind,
         f.due_date, f.due_at, f.status, f.projected,
         f.subject_id, f.project_id, f.checkpoint_id,
         f.remaining_minutes, f.estimate_source, f.version
  from (
    select 'deadline'::text as origin, d.id as source_id, d.title,
           d.kind, d.due_kind, d.due_date, d.due_at, d.status,
           false as projected, d.subject_id, d.project_id, d.checkpoint_id,
           d.remaining_minutes, d.estimate_source, d.version
      from public.deadlines d
     where d.user_id = (select auth.uid())
    union all
    select 'project'::text, p.id, p.title, 'milestone'::text, 'date'::text,
           p.target_date, null::timestamptz,
           case when p.status = 'done' then 'done' else 'open' end,
           true, p.subject_id, p.id, null::uuid, null::integer,
           null::text, p.version
      from public.projects p
     where p.user_id = (select auth.uid()) and p.target_date is not null
    union all
    select 'checkpoint'::text, c.id, c.title, 'milestone'::text, 'date'::text,
           c.due_on, null::timestamptz,
           case when c.status = 'demonstrated' then 'done' else 'open' end,
           true, p.subject_id, c.project_id, c.id, null::integer,
           null::text, c.version
      from public.checkpoints c
      join public.projects p on p.id = c.project_id and p.user_id = c.user_id
     where c.user_id = (select auth.uid()) and c.due_on is not null
  ) f
  order by coalesce(f.due_date, (f.due_at at time zone 'UTC')::date),
           f.due_at nulls last, f.origin, f.source_id
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0)
$deadline_feed$;

-- Functions are granted explicitly; no authenticated table write access.
revoke all on function public.deadline_feed(integer,integer) from public,anon;
grant execute on function public.deadline_feed(integer,integer) to authenticated,service_role;
