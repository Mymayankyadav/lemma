-- N165: reviewed additive bug-hunt corrections; ordered part 20.
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
  order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked)
 returning n.id,n.kind,n.key,n.title,n.body,n.url,n.facts,n.status,n.sent_at;
end $claim$;
