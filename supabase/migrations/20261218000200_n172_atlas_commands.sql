-- Registered Atlas writes. All owner checks, optimistic versions and receipts are checked in the same transaction.
create function public.atlas_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid();res text:=p->>'resource';op text:=p->>'operation';patch jsonb:=coalesce(p->'patch','{}');
 target text:=p->'target'->>'id';opid uuid:=(p->>'operationId')::uuid;old jsonb;receipt jsonb;changed jsonb;action_no bigint;k text;
begin
 if u is null then raise exception 'Authentication required';end if;
 if p->>'schemaVersion' is distinct from '1' or opid is null then raise exception 'Invalid command envelope';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||opid::text,0));
 select result into receipt from public.command_receipts where user_id=u and operation_id=opid;
 if found then if receipt->'_request'=p then return receipt-'_request';else raise exception 'operationId payload conflict';end if;end if;
 if coalesce(current_setting('role',true),'')<>'service_role' then
  perform set_config('lemma.source','app',true);perform set_config('lemma.tool','atlas_command',true);
 end if;
 perform set_config('lemma.summary','Atlas '||coalesce(res,'')||' '||coalesce(op,''),true);
 if res='atlas_links' and op in ('approve','reject') then
  if patch<>'{}'::jsonb then raise exception 'Decision has no patch fields';end if;
  select to_jsonb(l) into old from public.atlas_links l where l.id=target::uuid and l.user_id=u for update;
  if old is null then raise exception 'Link not found';end if;
  if (old->>'version')::int is distinct from (p->>'expectedVersion')::int then raise exception 'Version conflict';end if;
  update public.atlas_links set status=case op when 'approve' then 'approved' else 'rejected' end where id=target::uuid and user_id=u returning to_jsonb(atlas_links) into changed;
 elsif res='atlas_concepts' and op='update' then
  for k in select jsonb_object_keys(patch) loop if k not in ('kind','family_id') then raise exception 'Unknown concept field %',k;end if;end loop;
  select to_jsonb(c) into old from public.concepts c where c.id=target::uuid and c.user_id=u for update;
  if old is null then raise exception 'Concept not found';end if;
  if (old->>'version')::int is distinct from (p->>'expectedVersion')::int then raise exception 'Version conflict';end if;
  if patch->>'family_id'=target then raise exception 'Concept cannot be its own family';end if;
  update public.concepts set kind=coalesce(patch->>'kind',kind),family_id=case when patch?'family_id' then (patch->>'family_id')::uuid else family_id end where id=target::uuid and user_id=u returning to_jsonb(concepts) into changed;
 elsif res='atlas_settings' and op='update' then
  for k in select jsonb_object_keys(patch) loop
   if k not in ('threshold_p','stretch_share','plan_first_min','ask_confidence','card_quota_share','card_cap','card_weight') then raise exception 'Unknown Atlas setting %',k;end if;
   if k='ask_confidence' then if jsonb_typeof(patch->k)<>'boolean' then raise exception 'ask_confidence must be boolean';end if;
   elsif jsonb_typeof(patch->k)<>'number' then raise exception 'Atlas setting must be numeric';end if;
  end loop;
  if patch?'threshold_p' and not (patch->>'threshold_p')::real between .8 and .95 then raise exception 'threshold_p out of range';end if;
  if patch?'stretch_share' and not (patch->>'stretch_share')::real between 0 and .25 then raise exception 'stretch_share out of range';end if;
  if patch?'plan_first_min' and not (patch->>'plan_first_min')::real between 0 and 120 then raise exception 'plan_first_min out of range';end if;
  if patch?'card_quota_share' and not (patch->>'card_quota_share')::real between .25 and 1 then raise exception 'card_quota_share out of range';end if;
  if patch?'card_cap' and not (patch->>'card_cap')::real between .05 and .4 then raise exception 'card_cap out of range';end if;
  if patch?'card_weight' and not (patch->>'card_weight')::real between 0 and 1 then raise exception 'card_weight out of range';end if;
  update public.settings set atlas=atlas||patch where user_id=u returning to_jsonb(settings) into changed;
 elsif res='instruction_events' and op='void' then
  select to_jsonb(e) into old from public.instruction_events e where e.id=target::bigint and e.user_id=u for update;
  if old is null or (old->>'version')::int is distinct from (p->>'expectedVersion')::int then raise exception 'Instruction missing or version conflict';end if;
  update public.instruction_events set voided_at=now() where id=target::bigint and user_id=u returning to_jsonb(instruction_events) into changed;
 else raise exception 'Unsupported Atlas resource/operation';end if;
 select no into action_no from public.actions where user_id=u and txid=txid_current();
 if action_no is null then raise exception 'Atlas mutation lacks an undo journal';end if;
 receipt:=jsonb_build_object('operationId',opid,'status','ok','actionNo',action_no,'changed',jsonb_build_array(jsonb_build_object('resource',res,'id',coalesce(target,u::text),'version',changed->'version')));
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,opid,res,receipt||jsonb_build_object('_request',p));
 return receipt;
end $fn$;
revoke all on function public.atlas_command(jsonb) from public,anon;
grant execute on function public.atlas_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('atlas_links','atlas_command',true,'{"operations":["approve","reject"],"fields":[]}'),
 ('atlas_concepts','atlas_command',true,'{"operations":["update"],"fields":["kind","family_id"]}'),
 ('atlas_settings','atlas_command',true,'{"operations":["update"],"fields":["threshold_p","stretch_share","plan_first_min","ask_confidence","card_quota_share","card_cap","card_weight"]}'),
 ('instruction_events','atlas_command',true,'{"operations":["void"],"fields":[]}');
