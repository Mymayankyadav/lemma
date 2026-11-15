-- N165: reviewed additive bug-hunt corrections; ordered part 5.
create or replace function public.record_review(p_card uuid,p_rating int,p_confidence text,p_duration_ms int,p_next jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare c public.cards; result bigint; previous jsonb;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','record_review',true);perform set_config('lemma.summary','record_review',true);end if;
 select * into c from public.cards where id=p_card for update;
 if not found then raise exception 'Card not found'; end if;
 if c.user_id is distinct from auth.uid() then raise exception 'Card not found'; end if;
 if p_next?'expected_version' and (p_next->>'expected_version')::integer<>c.version then raise exception 'Card version conflict'; end if;
 if (p_next->>'reps')::integer<>c.reps+1 then raise exception 'Card version conflict: stale scheduler state'; end if;
 if jsonb_typeof(p_next) is distinct from 'object' or not (p_next ?& array['state','due','stability','difficulty','last_review','step','reps','lapses']) then
  raise exception 'A complete next card state is required';
 end if;
 previous := jsonb_build_object('state',c.state,'due',c.due,'stability',c.stability,'difficulty',c.difficulty,'last_review',c.last_review,'step',c.step,'reps',c.reps,'lapses',c.lapses);
 insert into public.reviews(user_id,card_id,rating,state_before,confidence,duration_ms,prev)
 values(c.user_id,c.id,p_rating,c.state,p_confidence,p_duration_ms,previous) returning id into result;
 update public.cards set state=(p_next->>'state')::smallint,due=(p_next->>'due')::timestamptz,
  stability=(p_next->>'stability')::real,difficulty=(p_next->>'difficulty')::real,last_review=(p_next->>'last_review')::timestamptz,
  step=(p_next->>'step')::int,reps=(p_next->>'reps')::int,lapses=(p_next->>'lapses')::int
 where id=c.id and user_id=c.user_id;
 return result;
end $$;

