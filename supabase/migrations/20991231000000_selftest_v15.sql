-- v1.5 self-test: additive only
create table public.selftest_v15(id int primary key);
alter table public.selftest_v15 enable row level security;
