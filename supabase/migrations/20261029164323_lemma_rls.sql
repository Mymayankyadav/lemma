-- No anonymous table reads, including notes, proposals and connector secrets.
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
do $$ declare tbl text; begin
 for tbl in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('create policy owner_all on public.%I for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',tbl);
 end loop;
end $$;
