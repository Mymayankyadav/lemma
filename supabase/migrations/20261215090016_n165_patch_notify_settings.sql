-- N165: reviewed additive bug-hunt corrections; ordered part 17.
create function public.patch_notify_settings(p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $prefs$
declare u uuid:=auth.uid(); r jsonb;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Reminder patch must be an object'; end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','patch_notify_settings',true);perform set_config('lemma.summary','Edit reminder preferences',true);
 update public.settings s set notify=public.lemma_v6_settings_merge(coalesce(s.notify,'{}'),p_patch)
  where s.user_id=u returning to_jsonb(s) into r;
 if r is null then raise exception 'Owner settings not found'; end if;
 return r;
end $prefs$;
revoke all on function public.patch_notify_settings(jsonb) from public,anon,service_role;
grant execute on function public.patch_notify_settings(jsonb) to authenticated;

-- A transport failure is not evidence that import failed. Delete only a still-incomplete version and fingerprint.
