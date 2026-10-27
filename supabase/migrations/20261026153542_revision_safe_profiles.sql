-- Lemma: CAS + idempotent profile mutations, without direct client overwrites.
-- The main user-specific settings/FSRS config stays in Model; this protects only its persistence.
create or replace function lemma_private.commit_profile(
  p_expected_revision bigint, p_request_id uuid, p_data jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old bigint;
  v_next bigint;
  v_receipt public.client_mutation_receipts%rowtype;
  v_hash text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
      or p_data is null or jsonb_typeof(p_data) <> 'object'
      or octet_length(p_data::text) > 262144 then
    raise exception 'invalid_profile_payload';
  end if;
  v_hash := md5('profile:' || p_data::text);
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':profile',0));
  select * into v_receipt from public.client_mutation_receipts
    where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_receipt.entity_type <> 'profile' or v_receipt.entity_id <> 'profile'
        or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return v_receipt.revision;
  end if;
  select revision into v_old from public.profiles
    where user_id=v_uid for update;
  if not found then
    if p_expected_revision <> 0 then raise exception 'stale_profile_revision'; end if;
    v_next := 1;
    insert into public.profiles(user_id,data,revision,updated_at)
      values (v_uid,p_data,v_next,clock_timestamp());
  else
    if p_expected_revision <> v_old then raise exception 'stale_profile_revision'; end if;
    v_next := v_old+1;
    update public.profiles set data=p_data,revision=v_next,updated_at=clock_timestamp()
      where user_id=v_uid;
  end if;
  insert into public.client_mutation_receipts(
    user_id,request_id,entity_type,entity_id,payload_hash,revision
  ) values (v_uid,p_request_id,'profile','profile',v_hash,v_next);
  return v_next;
end
$$;
revoke all on function lemma_private.commit_profile(bigint,uuid,jsonb) from public,anon;
grant execute on function lemma_private.commit_profile(bigint,uuid,jsonb) to authenticated;

create or replace function public.commit_profile(
  p_expected_revision bigint,p_request_id uuid,p_data jsonb
) returns bigint language sql security invoker set search_path='' as $$
  select lemma_private.commit_profile(p_expected_revision,p_request_id,p_data)
$$;
revoke all on function public.commit_profile(bigint,uuid,jsonb) from public,anon;
grant execute on function public.commit_profile(bigint,uuid,jsonb) to authenticated;

revoke insert,update,delete on public.profiles from authenticated;
notify pgrst, 'reload schema';
