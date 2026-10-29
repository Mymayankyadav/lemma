create function public.lemma_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare tbl text; begin
 foreach tbl in array array['settings','projects','checkpoints','notes'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.lemma_touch_updated_at()',tbl);
 end loop;
end $$;
create function public.lemma_touch_project_activity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
 if tg_table_name='session_events' then
  select s.project_id into target from public.sessions s where s.id=new.session_id and s.user_id=new.user_id;
 else
  select n.project_id into target from public.cards c join public.notes n on n.id=c.note_id and n.user_id=c.user_id where c.id=new.card_id and c.user_id=new.user_id;
 end if;
 update public.projects set last_activity_at=now() where id=target and user_id=new.user_id;
 return new;
end $$;
create trigger project_activity after insert on public.session_events for each row execute function public.lemma_touch_project_activity();
create trigger project_activity after insert on public.reviews for each row execute function public.lemma_touch_project_activity();
