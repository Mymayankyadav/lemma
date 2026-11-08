-- Incident #1149: prevent double application of a revised proposal lineage.
-- A revision is authoritative even after its approval/withdrawal/rejection.
-- Replaces function: reopen_proposal(uuid), retaining the exact signature,
-- owner authorization, provenance and original return shape.
create or replace function public.reopen_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $reopen$
declare v_owner uuid:=(select auth.uid());v_row public.proposals%rowtype;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.proposals
  where id=p_id and user_id=v_owner for update;
 if not found then raise exception 'Proposal not found for owner'; end if;
 if v_row.status='approved' or
  (v_row.status='pending' and v_row.withdrawn_at is null) then
   raise exception 'Proposal is not withdrawn or rejected'; end if;
 -- Previous N92 code only rejected an *active pending* direct successor.
 -- Once the successor had been approved, this became false and the
 -- predecessor could be reopened and approved again, duplicating cards/plan
 -- effects. Any successor permanently supersedes its direct parent.
 -- revise_proposal serializes this relation on the same parent FOR UPDATE.
 if exists(select 1 from public.proposals
    where user_id=v_owner and revised_from=p_id) then
   raise exception 'A newer revision supersedes this proposal'; end if;
 if pg_catalog.current_setting('role',true)<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','reopen_proposal',true);
   perform pg_catalog.set_config('lemma.summary','Reopen proposal',true);
 end if;
 update public.proposals set status='pending',withdrawn_at=null,
   decided_at=null,result=null where id=p_id and user_id=v_owner
   returning * into v_row;
 return pg_catalog.jsonb_build_object('id',v_row.id,
   'status',v_row.status,'version',v_row.version,'withdrawnAt',v_row.withdrawn_at);
end
$reopen$;
