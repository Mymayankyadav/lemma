
create table public.client_mutation_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 entity_type text not null check(entity_type in ('note', 'profile')),
 entity_id text not null,
 payload_hash text not null,
 revision bigint not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
create index receipt_time_idx on public.client_mutation_receipts(user_id,created_at);
alter table public.client_mutation_receipts enable row level security;
revoke all on public.client_mutation_receipts from anon,authenticated;
grant select on public.client_mutation_receipts to authenticated;
create policy receipt_owner_read on public.client_mutation_receipts
 for select to authenticated using(user_id=(select auth.uid()));
revoke insert,update,delete on public.notes from authenticated;
grant select on public.notes to authenticated;

create function public.commit_note(
 p_note_id text,
 p_expected_revision bigint,
 p_request_id uuid,
 p_data jsonb,
 p_delete boolean default false
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_revision bigint;
 v_receipt public.client_mutation_receipts%rowtype;
 v_hash text;
 v_next bigint;
begin
 if v_uid is null then raise exception 'authentication_required'; end if;
 if p_note_id is null or length(p_note_id) not between 1 and 256
    or p_request_id is null or p_expected_revision is null or p_expected_revision<0
    or (not p_delete and (p_data is null or jsonb_typeof(p_data)<>'object'))
    or (p_data is not null and octet_length(p_data::text)>1048576)
 then raise exception 'invalid_note_payload'; end if;

 v_hash := md5(p_note_id || ':' || coalesce(p_data::text,'null') || ':' || p_delete::text);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':note:' || p_note_id,0));
 select * into v_receipt from public.client_mutation_receipts
 where user_id=v_uid and request_id=p_request_id;
 if found then
   if v_receipt.entity_type<>'note' or v_receipt.entity_id<>p_note_id
      or v_receipt.payload_hash<>v_hash then
      raise exception 'idempotency_key_reused';
   end if;
   return v_receipt.revision;
 end if;
 select revision into v_revision from public.notes
 where user_id=v_uid and id=p_note_id for update;
 if not found then
   if p_expected_revision<>0 then raise exception 'stale_note_revision'; end if;
   if p_delete then raise exception 'missing_note'; end if;
   v_next:=1;
   insert into public.notes(user_id,id,data,revision,deleted_at,updated_at)
   values(v_uid,p_note_id,p_data,v_next,null,clock_timestamp());
 else
   if v_revision<>p_expected_revision then raise exception 'stale_note_revision'; end if;
   v_next:=v_revision+1;
   update public.notes set data=coalesce(p_data,data),revision=v_next,
    deleted_at=(case when p_delete then clock_timestamp() else null end),
    updated_at=clock_timestamp()
   where user_id=v_uid and id=p_note_id;
 end if;
 insert into public.client_mutation_receipts(user_id,request_id,entity_type,entity_id,payload_hash,revision)
 values(v_uid,p_request_id,'note',p_note_id,v_hash,v_next);
 return v_next;
end
$$;
revoke all on function public.commit_note(text,bigint,uuid,jsonb,boolean) from public,anon;
grant execute on function public.commit_note(text,bigint,uuid,jsonb,boolean) to authenticated;

