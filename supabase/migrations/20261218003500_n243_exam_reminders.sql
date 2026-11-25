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

-- The shared worker owns retries, quiet holds, exhausted leases and row locks.
-- Recheck timing and consent for an exam only after it has claimed the delivery.
create function public.exam_claim_notices(p_user uuid,p_limit integer default 10)
returns table(id bigint,kind text,key text,title text,body text,url text,facts jsonb,status text,sent_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
declare notice record;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege; end if;
 for notice in select * from public.notify_claim(p_user,p_limit) loop
   if notice.key not like 'exam/%' or exists (
     select from public.exam_sittings s join public.settings st on st.user_id=s.user_id
     join public.projects p on p.id=s.project_id and p.user_id=s.user_id
     where s.user_id=p_user and s.status='active' and not p.system and p.status<>'archived'
       and s.id::text=split_part(notice.key,'/',3) and floor(extract(epoch from s.starts_at)*1000)::bigint::text=split_part(notice.key,'/',4)
       and st.notify->'enabled'='true' and st.notify->'kinds'->(split_part(notice.key,'/',2))='true'
       and ((split_part(notice.key,'/',2)='examMorning' and now()<s.starts_at)
         or (split_part(notice.key,'/',2)='examFollowup' and s.duration_minutes is not null and
           now() between s.starts_at+make_interval(mins=>s.duration_minutes) and s.starts_at+interval '2 days'))
   ) then
     return query select notice.id,notice.kind,notice.key,notice.title,notice.body,notice.url,notice.facts,notice.status,notice.sent_at;
   else
     update public.notifications n set status='skipped',reason='resolved',delivery_claimed_at=null where n.user_id=p_user and n.id=notice.id;
   end if;
 end loop;
end $claim$;
revoke all on function public.exam_claim_notices(uuid,integer) from public,anon,authenticated;
grant execute on function public.exam_claim_notices(uuid,integer) to service_role;
