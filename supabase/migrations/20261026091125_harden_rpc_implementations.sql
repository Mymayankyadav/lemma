
create schema if not exists lemma_private;
revoke all on schema lemma_private from public,anon,authenticated;
grant usage on schema lemma_private to authenticated;

alter function public.commit_note(text,bigint,uuid,jsonb,boolean) set schema lemma_private;
alter function public.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) set schema lemma_private;
revoke all on function lemma_private.commit_note(text,bigint,uuid,jsonb,boolean) from public,anon;
revoke all on function lemma_private.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) from public,anon;
grant execute on function lemma_private.commit_note(text,bigint,uuid,jsonb,boolean) to authenticated;
grant execute on function lemma_private.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) to authenticated;

create function public.commit_note(
 p_note_id text,p_expected_revision bigint,p_request_id uuid,p_data jsonb,p_delete boolean default false
) returns bigint language sql security invoker set search_path='' as $$
 select lemma_private.commit_note(p_note_id,p_expected_revision,p_request_id,p_data,p_delete)
$$;
create function public.publish_study_plan(
 p_plan_id uuid,p_expected_revision bigint,p_request_id uuid,p_title text,
 p_objective text,p_snapshot jsonb,p_change_summary text,
 p_context_id uuid default null,p_expected_context_revision bigint default null,p_author_model text default null
) returns bigint language sql security invoker set search_path='' as $$
 select lemma_private.publish_study_plan(p_plan_id,p_expected_revision,p_request_id,p_title,
 p_objective,p_snapshot,p_change_summary,p_context_id,p_expected_context_revision,p_author_model)
$$;
revoke all on function public.commit_note(text,bigint,uuid,jsonb,boolean) from public,anon;
grant execute on function public.commit_note(text,bigint,uuid,jsonb,boolean) to authenticated;
revoke all on function public.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) from public,anon;
grant execute on function public.publish_study_plan(uuid,bigint,uuid,text,text,jsonb,text,uuid,bigint,text) to authenticated;
create index if not exists card_links_session_fkey_idx on public.learning_card_links(user_id,session_id);
create index if not exists learning_sessions_plan_fkey_idx on public.learning_sessions(user_id,plan_id);
create index if not exists checkpoints_evidence_fkey_idx on public.study_checkpoints(user_id,last_evidence_event_id);
create index if not exists plan_versions_context_fkey_idx on public.study_plan_versions(user_id,context_id);
notify pgrst, 'reload schema';

