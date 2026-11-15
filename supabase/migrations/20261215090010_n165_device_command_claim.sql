-- N165: reviewed additive bug-hunt corrections; ordered part 11.
create function public.device_command_claim(p_id uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $claim$
declare u uuid:=auth.uid(); r public.device_commands%rowtype;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','device_command_claim',true);perform set_config('lemma.summary','device_command_claim',true);end if;
 if u is null or current_setting('role',true)<>'authenticated' or p_claim is null then raise exception 'Authenticated claim required'; end if;
 select * into r from public.device_commands where user_id=u and id=p_id for update;
 if not found then raise exception 'Device command not found'; end if;
 if r.status not in ('pending','delivered') or r.expires_at<=now() then return jsonb_build_object('accepted',false,'status',r.status); end if;
 if r.status='delivered' then return jsonb_build_object('accepted',coalesce(r.delivery_claim=p_claim,false),'status',r.status); end if;
 update public.device_commands set status='delivered',delivery_claim=p_claim,delivered_at=now(),version=version+1 where id=p_id and user_id=u;
 return jsonb_build_object('accepted',true,'status','delivered');
end $claim$;
revoke all on function public.device_command_claim(uuid,uuid) from public,anon,service_role;
grant execute on function public.device_command_claim(uuid,uuid) to authenticated;

