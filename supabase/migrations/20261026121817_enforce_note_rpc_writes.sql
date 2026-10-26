-- Direct table writes bypass optimistic revisions and can erase tombstones.
-- Keep owner-scoped reads; all client writes must use commit_note.
-- No rows are changed. The constrained private implementation retains its privileges.
revoke insert, update, delete, truncate, references, trigger on public.notes from public, anon, authenticated;
grant select on public.notes to authenticated;
