-- N165: reviewed additive bug-hunt corrections; ordered part 21.
create or replace function public.notify_record(p_user uuid,p_id bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $record$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 if p_reason not in ('sent','no_device','push_error') then raise exception 'Invalid delivery result'; end if;
 update public.notifications set
 status=case when p_reason='sent' then 'sent' when delivery_attempts>=8 then 'failed' else 'queued' end,
 sent_at=case when p_reason='sent' then now() else null end,
 reason=case when p_reason='sent' then null else p_reason end,
 due_at=case when p_reason='sent' then due_at else now()+make_interval(secs=>least(3600,30*(2^least(delivery_attempts,7))::int)) end,
 delivery_claimed_at=null where user_id=p_user and id=p_id and status='queued' and delivery_claimed_at is not null;
end $record$;

