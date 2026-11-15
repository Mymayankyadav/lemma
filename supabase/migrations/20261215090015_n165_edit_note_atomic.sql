-- N165: reviewed additive bug-hunt corrections; ordered part 16.
create function public.edit_note_atomic(p_id uuid,p_expected integer,p_patch jsonb,p_operation uuid) returns jsonb
language plpgsql security invoker set search_path='' as $note$
declare u uuid:=auth.uid(); n public.notes%rowtype; stored jsonb; result jsonb; request jsonb; a bigint;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if p_operation is null or p_expected is null or p_expected<1 or jsonb_typeof(p_patch) is distinct from 'object' or
  exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('front','back','type','kind','tags')) then raise exception 'Invalid note edit'; end if;
 request:=jsonb_build_object('id',p_id,'expected',p_expected,'patch',p_patch);
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||p_operation::text,0));
 select r.result into stored from public.command_receipts r where r.user_id=u and r.operation_id=p_operation;
 if found then
  if stored->'_request'=request then return stored-'_request'; end if;
  raise exception 'operationId reused with different note edit';
 end if;
 select * into n from public.notes where id=p_id and user_id=u for update;
 if not found then raise exception 'Note not found'; end if;
 if n.version<>p_expected then return jsonb_build_object('status','conflict'); end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','edit_note_atomic',true);perform set_config('lemma.summary','Edit note and card variants',true);
 update public.notes set
  front=case when p_patch?'front' then p_patch->>'front' else front end,
  back=case when p_patch?'back' then p_patch->>'back' else back end,
  type=case when p_patch?'type' then p_patch->>'type' else type end,
  kind=case when p_patch?'kind' then p_patch->>'kind' else kind end,
  tags=case when p_patch?'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end
  where id=p_id and user_id=u returning * into n;
 perform public.lemma_reconcile_cards(u,p_id);
 select no into a from public.actions where user_id=u and txid=txid_current();
 result:=jsonb_build_object('status','ok','version',n.version,'actionNo',a);
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,p_operation,'notes',result||jsonb_build_object('_request',request));
 return result;
end $note$;
revoke all on function public.edit_note_atomic(uuid,integer,jsonb,uuid) from public,anon,service_role;
grant execute on function public.edit_note_atomic(uuid,integer,jsonb,uuid) to authenticated;

-- Merge only changed reminder keys under the UPDATE row lock, preserving other devices' independent choices.
