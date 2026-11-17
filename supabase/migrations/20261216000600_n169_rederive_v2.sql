-- N169: the correction re-derive stops rewriting the deprecated recheck columns under recheck_v2.
-- Replaces function: public.lemma_rederive_checkpoint_evidence(uuid,uuid), same signature and grants.
create or replace function public.lemma_rederive_checkpoint_evidence(p_owner uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $derive$
declare v_cp public.checkpoints%rowtype;v_settings public.settings%rowtype;
 v_event public.session_events%rowtype;v_status text:='not_started';
 v_demonstrated timestamptz;v_due date;v_level int:=0;v_revisit boolean:=false;v_day date;
begin
 select * into v_cp from public.checkpoints
   where id=p_id and user_id=p_owner for update;
 if not found then raise exception 'Checkpoint not found for owner';end if;
 select * into v_settings from public.settings where user_id=p_owner;
 for v_event in select * from public.session_events
  where user_id=p_owner and checkpoint_id=p_id and voided_at is null
   and superseded_by is null and kind in('evidence','recheck')
  order by coalesce(occurred_at,created_at),id loop
  v_day:=((coalesce(v_event.occurred_at,v_event.created_at)
    at time zone coalesce(v_settings.time_zone,'UTC'))
    -make_interval(hours=>coalesce(v_settings.rollover_hour,4)))::date;
  if v_event.kind='evidence' and v_event.outcome='demonstrated' then
   v_status:='demonstrated';v_demonstrated:=coalesce(v_event.occurred_at,v_event.created_at);
   v_level:=0;v_due:=v_day+3;v_revisit:=false;
  elsif v_event.kind='recheck' and v_status='demonstrated' then
   if v_event.outcome='demonstrated' then
    v_level:=least(4,v_level+1);
    v_due:=case v_level when 1 then v_day+10 when 2 then v_day+30
      when 3 then v_day+90 else null end;v_revisit:=false;
   elsif v_event.outcome in('partial','failed') then
    v_level:=0;v_due:=v_day+1;v_revisit:=true;
   end if;
  end if;
 end loop;
 update public.checkpoints set status=v_status,demonstrated_at=v_demonstrated,
  recheck_level=case when public.lemma_flag(p_owner,'recheck_v2') then recheck_level else v_level end,
  recheck_due=case when public.lemma_flag(p_owner,'recheck_v2') then recheck_due else v_due end,
  needs_revisit=case when public.lemma_flag(p_owner,'recheck_v2') then needs_revisit else v_revisit end,
  current_step=case when v_status='demonstrated'
    then pg_catalog.jsonb_array_length(steps) else 0 end
 where id=p_id and user_id=p_owner;
end $derive$;
