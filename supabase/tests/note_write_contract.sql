-- Synthetic identities and all test rows are rolled back; no mail or live user changes.
begin;
select set_config('lemma.test_a', gen_random_uuid()::text, true);
select set_config('lemma.test_b', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('lemma.test_a')::uuid),(current_setting('lemma.test_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('lemma.test_a'), true);
do $test$
declare r bigint; request_id uuid := gen_random_uuid();
begin
 if current_user <> 'authenticated' then raise exception 'test_role_mismatch'; end if;
 r := public.commit_note('lemma-test-note',0,request_id,'{"id":"lemma-test-note","front":"A"}',false);
 if r<>1 then raise exception 'create_failed'; end if;
 r := public.commit_note('lemma-test-note',0,request_id,'{"id":"lemma-test-note","front":"A"}',false);
 if r<>1 then raise exception 'retry_not_idempotent'; end if;
 begin
  perform public.commit_note('lemma-test-note',1,request_id,'{"id":"lemma-test-note","front":"different"}',false);
  raise exception 'reused_request_was_accepted';
 exception when raise_exception then if sqlerrm<>'idempotency_key_reused' then raise; end if; end;
 begin
  update public.notes set data='{}' where id='lemma-test-note';
  raise exception 'direct_update_was_allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.notes where id='lemma-test-note';
  raise exception 'hard_delete_was_allowed';
 exception when insufficient_privilege then null; end;
 insert into public.review_events(event_id,note_id,ordinal,occurred_at_ms,grade,state_before)
 values(gen_random_uuid(),'lemma-test-note',1,1000,3,0);
 begin
  update public.review_events set grade=4 where note_id='lemma-test-note';
  raise exception 'review_update_was_allowed';
 exception when insufficient_privilege then null; end;
 r := public.commit_note('lemma-test-note',1,gen_random_uuid(),null,true);
 if r<>2 or not exists(select 1 from public.notes where id='lemma-test-note' and deleted_at is not null)
 then raise exception 'tombstone_failed'; end if;
 begin
  perform public.commit_note('lemma-test-note',1,gen_random_uuid(),'{}',false);
  raise exception 'stale_write_was_accepted';
 exception when raise_exception then if sqlerrm<>'stale_note_revision' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',current_setting('lemma.test_b'),true);
 if exists(select 1 from public.notes where id='lemma-test-note') or
    exists(select 1 from public.review_events where note_id='lemma-test-note')
 then raise exception 'cross_account_read'; end if;
 r := public.commit_note('lemma-test-note',0,gen_random_uuid(),'{"id":"lemma-test-note","front":"B"}',false);
 if r<>1 then raise exception 'cross_account_revision'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('lemma.test_a'),true);
 if not exists(select 1 from public.notes where id='lemma-test-note' and revision=2 and data->>'front'='A')
 then raise exception 'cross_account_write'; end if;
end $test$;
reset role;
rollback;
select 'passed: revisions, idempotency, RLS, tombstones, immutable reviews and write grants; all fixtures rolled back' as verification;

