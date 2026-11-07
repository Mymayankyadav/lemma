-- Owner fix (rules PR): bug #1109.
-- Compatibly replaces study_events_touch_version() from 20261107120116: same signature, trigger
-- and behaviour for every ordinary update (version+1, fresh updated_at). Only the generic
-- undo_action path (security definer, so it runs as the table owner, with lemma.tool='undo') keeps
-- the restored prior version and timestamp, so an undone edit/void/restore returns the exact old
-- row. Browser roles never get the bypass, even if they pre-set lemma.tool. Same rule as N47.2's
-- overlap_ack_guard(). Needed before study_events is registered for undo (N50.2.2, #1064).
create or replace function public.study_events_touch_version() returns trigger
language plpgsql security invoker set search_path='' as $touch$
begin
  if pg_catalog.current_setting('lemma.tool',true)='undo'
     and current_user not in ('authenticated','anon') then
    return new;
  end if;
  new.version:=old.version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end
$touch$;
