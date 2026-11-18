-- Atlas v3 cutover: one owner's facts as a single JSON object for scripts/atlas/release.mts (read-only; run with the owner's id in place of :owner).
-- Credential columns are never exported (settings.connector_secret is the only one in these tables; tests/unit/adaptive/atlas-release.test.ts checks every table against docs/v6/capability-registry).
with o as (select :owner::uuid as id)
select jsonb_build_object(
 'settings',(select to_jsonb(s)-'connector_secret' from public.settings s,o where s.user_id=o.id),
 'projects',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.projects x,o where x.user_id=o.id and x.status<>'archived'),'[]'),
 'checkpoints',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.checkpoints x,o where x.user_id=o.id),'[]'),
 'prereqs',coalesce((select jsonb_agg(to_jsonb(x) order by x.checkpoint_id,x.prereq_id) from public.checkpoint_prereqs x,o where x.user_id=o.id),'[]'),
 'cpConcepts',coalesce((select jsonb_agg(to_jsonb(x) order by x.checkpoint_id,x.concept_id) from public.checkpoint_concepts x,o where x.user_id=o.id),'[]'),
 'concepts',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.concepts x,o where x.user_id=o.id),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.sessions x,o where x.user_id=o.id),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at,x.id) from public.attempts x,o where x.user_id=o.id),'[]'),
 'attemptTags',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.attempt_tags x,o where x.user_id=o.id),'[]'),
 'instructionEvents',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.instruction_events x,o where x.user_id=o.id),'[]'),
 'atlasLinks',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.atlas_links x,o where x.user_id=o.id),'[]'),
 'modelFits',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.model_fits x,o where x.user_id=o.id),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.items x,o where x.user_id=o.id),'[]'),
 'assumptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.assumptions x,o where x.user_id=o.id),'[]'),
 'notes',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.notes x,o where x.user_id=o.id),'[]'),
 'cards',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cards x,o where x.user_id=o.id),'[]'),
 'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.reviews x,o where x.user_id=o.id),'[]'),
 'busy',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.calendar_blocks x,o where x.user_id=o.id),'[]'),
 'studyEntries',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.study_entries x,o where x.user_id=o.id),'[]')
) as rows;
