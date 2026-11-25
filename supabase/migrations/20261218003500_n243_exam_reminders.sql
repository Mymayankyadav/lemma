-- The two exam reminders reuse the deadline delivery channel, quiet hours and quotas.
-- Only owners who explicitly enabled each kind can produce a candidate or claim one.
create function public.exam_notice_facts(p_user uuid,p_now timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.notify_candidates(p_user,p_now)||jsonb_build_object('exams',coalesce((
   select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'slug',p.slug,'startsAt',s.starts_at,'zone',s.time_zone,
     'minutes',s.duration_minutes) order by s.starts_at,s.id)
   from public.exam_sittings s join public.projects p on p.id=s.project_id and p.user_id=s.user_id
   join public.settings st on st.user_id=s.user_id
   where s.user_id=p_user and s.status='active' and p.status<>'archived' and not p.system
     and (st.notify->'kinds'->'examMorning'='true' or st.notify->'kinds'->'examFollowup'='true')
     and s.starts_at between p_now-interval '2 days' and p_now+interval '1 day'),'[]'::jsonb))
 where current_setting('role',true)='service_role';
$$;
revoke all on function public.exam_notice_facts(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.exam_notice_facts(uuid,timestamptz) to service_role;

create or replace function public.notify_claim(p_user uuid,p_limit integer default 10)
returns table(id bigint,kind text,key text,title text,body text,url text,facts jsonb,status text,sent_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 return query update public.notifications n set delivery_claimed_at=now(),delivery_attempts=delivery_attempts+1
 where n.id in(select q.id from public.notifications q where q.user_id=p_user and q.status='queued' and q.due_at<=now()
  and (q.delivery_claimed_at is null or q.delivery_claimed_at<now()-interval '2 minutes') and q.delivery_attempts<8
  and not exists(select 1 from public.notify_holds h where h.user_id=q.user_id and h."until">now() and
   (h.scope in ('all',q.kind) or h.scope=q.facts->>'scope' or h.scope=q.key))
  and (q.key not like 'exam/%' or exists (
    select from public.exam_sittings s join public.settings st on st.user_id=s.user_id
    join public.projects p on p.id=s.project_id and p.user_id=s.user_id
    where s.user_id=q.user_id and s.status='active' and not p.system and p.status<>'archived'
      and s.id::text=split_part(q.key,'/',3) and extract(epoch from s.starts_at)*1000=split_part(q.key,'/',4)::numeric
      and st.notify->'enabled'='true' and st.notify->'kinds'->(split_part(q.key,'/',2))='true'
      and ((split_part(q.key,'/',2)='examMorning' and now()<s.starts_at)
        or (split_part(q.key,'/',2)='examFollowup' and now() between s.starts_at+make_interval(mins=>coalesce(s.duration_minutes,0)) and s.starts_at+interval '2 days'))
  ))
  order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked)
 returning n.id,n.kind,n.key,n.title,n.body,n.url,n.facts,n.status,n.sent_at;
end $claim$;
