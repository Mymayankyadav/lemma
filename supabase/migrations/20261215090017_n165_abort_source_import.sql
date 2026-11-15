-- N165: reviewed additive bug-hunt corrections; ordered part 18.
create function public.abort_source_import(p_id uuid,p_sha text,p_version integer) returns boolean
language plpgsql security invoker set search_path='' as $abort$
declare u uuid:=auth.uid(); removed uuid;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','abort_source_import',true);perform set_config('lemma.summary','Abort incomplete source import',true);
 delete from public.sources where id=p_id and user_id=u and sha256=p_sha and version=p_version
  and status in ('uploading','extracting') returning id into removed;
 return removed is not null;
end $abort$;
revoke all on function public.abort_source_import(uuid,text,integer) from public,anon,service_role;
grant execute on function public.abort_source_import(uuid,text,integer) to authenticated;

-- A durable phone action ID is the receipt ID. Only this receipt lineage can rebase an offline chain.
