-- N239: generated with the CLI, then assigned an unpublished version after the
-- repository's existing future-dated receipt cutover. No applied migration changes.
-- The privileged receipt helpers cannot be called by browsers directly. This
-- narrow definer authenticates the owner and scopes every target before using them.
create function public.create_note_atomic(p_operation uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $note_create$
declare
 u uuid:=auth.uid(); p public.projects%rowtype; cp uuid; n public.notes%rowtype;
 saved jsonb; result jsonb; a bigint;
begin
 if u is null or current_setting('role',true) is distinct from 'authenticated' then
  raise exception 'Authenticated owner required' using errcode='42501';
 end if;
 if p_operation is null or jsonb_typeof(p_input) is distinct from 'object'
  or not(p_input ?& array['projectSlug','front','back','type','kind'])
  or (p_input-array['projectSlug','front','back','type','kind','checkpointCode'])<>'{}'::jsonb
  or exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string')
  or coalesce(length(btrim(p_input->>'front')),0)<1
  or length(p_input->>'front')>1500 or length(p_input->>'back')>3000
  or p_input->>'type' not in ('basic','cloze','reverse')
  or p_input->>'kind' not in ('definition','theorem','why','example','counterexample','proof','other') then
  raise exception 'Invalid note creation' using errcode='22023';
 end if;
 -- The trusted receipt is owner-bound. Resolve mutable slugs/codes only for
 -- new work, so renaming a path cannot strand an already committed creation.
 saved:=public.lemma_trusted_receipt_begin(u,p_operation,'note_create',p_input);
 if saved is not null then
  if saved->>'status'='ok' and not exists(select 1 from public.notes where user_id=u and id=(saved->>'noteId')::uuid) then
   return jsonb_build_object('status','conflict','operationId',p_operation,'reason','creation_undone');
  end if;
  return saved;
 end if;
 select * into p from public.projects where user_id=u and slug=p_input->>'projectSlug' for share;
 if not found then raise exception 'Project not found for owner' using errcode='P0002'; end if;
 if p_input?'checkpointCode' then
  select id into cp from public.checkpoints where user_id=u and project_id=p.id and code=p_input->>'checkpointCode' for share;
  if not found then raise exception 'Checkpoint not found for owner' using errcode='P0002'; end if;
 end if;
 if p.status='archived' then raise exception 'Cannot create a card in an archived project' using errcode='22023'; end if;
 perform set_config('lemma.source','app',true);
 perform set_config('lemma.tool','create_note_atomic',true);
 perform set_config('lemma.summary','Create note and review cards',true);
 insert into public.notes(user_id,project_id,checkpoint_id,front,back,type,kind,origin)
  values(u,p.id,cp,p_input->>'front',p_input->>'back',p_input->>'type',p_input->>'kind','user') returning * into n;
 perform public.lemma_reconcile_cards(u,n.id);
 select no into strict a from public.actions where user_id=u and txid=txid_current();
 result:=jsonb_build_object('status','ok','operationId',p_operation,'noteNo',n.no,'noteId',n.id,'actionNo',a);
 return public.lemma_trusted_receipt_finish(u,p_operation,'note_create',p_input,result);
end
$note_create$;
revoke all on function public.create_note_atomic(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_note_atomic(uuid,jsonb) to authenticated;
