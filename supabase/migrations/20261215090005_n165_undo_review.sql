-- N165: reviewed additive bug-hunt corrections; ordered part 6.
create or replace function public.undo_review(p_review bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.reviews; c uuid; newest bigint; v_expected integer; v_current integer;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','undo_review',true);perform set_config('lemma.summary','undo_review',true);end if;
 select card_id into c from public.reviews where id=p_review;
 if not found then raise exception 'Review not found'; end if;
 -- Same lock order as record_review: card first, then review.
 perform 1 from public.cards where id=c for update;
 select * into r from public.reviews where id=p_review for update;
 select id into newest from public.reviews where card_id=c and user_id=r.user_id and undone_at is null order by id desc limit 1;
 if r.undone_at is not null or newest is distinct from r.id then raise exception 'Only the last answer can be undone'; end if;
 select (ch.new->>'version')::integer into v_expected from public.action_changes ch
  where ch.table_name='cards' and ch.row_pk->>'id'=c::text and ch.action_no in
   (select a.action_no from public.action_changes a where a.table_name='reviews' and a.row_pk->>'id'=r.id::text and a.op='insert')
  order by ch.seq desc limit 1;
 select version into v_current from public.cards where id=c and user_id=r.user_id;
 if v_expected is null or v_current<>v_expected then raise exception 'Card changed after this answer; undo the newer change first'; end if;
 update public.cards set state=(r.prev->>'state')::smallint,due=(r.prev->>'due')::timestamptz,
  stability=(r.prev->>'stability')::real,difficulty=(r.prev->>'difficulty')::real,last_review=(r.prev->>'last_review')::timestamptz,
  step=(r.prev->>'step')::int,reps=(r.prev->>'reps')::int,lapses=(r.prev->>'lapses')::int where id=c and user_id=r.user_id;
 update public.reviews set undone_at=now() where id=r.id and user_id=r.user_id;
 return r.prev;
end $$;

