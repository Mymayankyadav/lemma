-- Disposable local database only. All fixture writes roll back.
begin;
do $test$
declare
 owner_id uuid; secret text; digest text; turn_id uuid:=gen_random_uuid(); project_id uuid:=gen_random_uuid();
 checkpoint_id uuid:=gen_random_uuid(); thread_id uuid:=gen_random_uuid(); subject_id uuid:=gen_random_uuid();
 grant_id uuid:=gen_random_uuid(); grant_op uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid();
 first_op uuid:=gen_random_uuid(); second_op uuid:=gen_random_uuid(); undo_op uuid:=gen_random_uuid();
 slug text:='aid-test-'||substr(gen_random_uuid()::text,1,8); ranking jsonb; first_set jsonb; second_set jsonb;
 undo_request jsonb; first_receipt jsonb; undone jsonb; state jsonb;
begin
 ranking:='{"version":1,"hints":[{"id":"e","entry":"Évariste","kind":"word","aliases":["Évariste‐Galois"],"priority":"prefer","role":"given"},
  {"id":"subset","entry":"\\subseteq","kind":"symbol","aliases":["⊆"],"priority":"neutral","role":"given","scope":{"prefixes":["\\sub"]}}],
  "declaredSymbols":[{"symbol":"U","role":"set","ambient":"Y"},{"symbol":"x","role":"bound","binder":{"id":"outer"}},
    {"symbol":"x","role":"bound","binder":{"id":"inner","parent":"outer"}}]}'::jsonb;
 if not public.tutor_aid_ranking_valid(ranking) or public.tutor_aid_ranking_valid(ranking||'{"version":2}'::jsonb)
  or public.tutor_aid_ranking_valid('{"version":1,"hints":{"id":"invalid"}}') or public.tutor_aid_ranking_valid('null')
  or public.tutor_aid_ranking_valid('{"version":1,"hints":[{"id":"one","entry":"lemma","kind":"word","priority":"prefer","role":"given","aliases":["claim"]},
     {"id":"two","entry":"claim","kind":"word","priority":"neutral","role":"given"}]}')
  or public.tutor_aid_ranking_valid('{"version":1,"declaredSymbols":[{"symbol":"x","role":"bound","binder":{"id":"a","parent":"b"}},
    {"symbol":"x","role":"bound","binder":{"id":"b","parent":"a"}}]}') then
  raise exception 'Ranking contract parity failed';
 end if;
 if not public.tutor_accepted_spans_valid('𝒰 is open','[{"start":3,"end":5,"text":"is","source":"word"}]')
  or public.tutor_accepted_spans_valid('𝒰 is open','[{"start":2,"end":4,"text":"is","source":"word"}]')
  or public.tutor_accepted_spans_valid('[[lemma-image:00000000-0000-0000-0000-000000000001]]',
    '[{"start":2,"end":13,"text":"lemma-image","source":"word"}]') then
  raise exception 'Provenance span validation failed';
 end if;
 select s.user_id,s.connector_secret into owner_id,secret from public.settings s where connector_secret is not null limit 1;
 if owner_id is null or not public.tutor_plan_released() then
  raise exception 'Use a disposable local database with an initialized connector owner and the plan enabled';
 end if;
 digest:=encode(sha256(convert_to(secret,'UTF8')),'hex');
 insert into public.subjects(id,user_id,name,glyph,hue) values(subject_id,owner_id,slug,'A','slate');
 insert into public.projects(id,user_id,slug,title,subject_id,goal) values(project_id,owner_id,slug,'Tutor aid test',subject_id,null);
 insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,due_on)
  values(checkpoint_id,owner_id,project_id,'CP1',1,'Tutor aid test','Restate','Demonstrate','["Restate the given terms"]',current_date);
 insert into public.tutor_threads(id,user_id,project_id,checkpoint_id,last_sequence) values(thread_id,owner_id,project_id,checkpoint_id,1);
 insert into public.tutor_turns(id,client_turn_id,user_id,thread_id,sequence,status,snapshot)
  values(turn_id,gen_random_uuid(),owner_id,thread_id,1,'completed','{"question":"What is given?"}');
 insert into public.tutor_release_controls values('mcp',true) on conflict(capability) do update set enabled=true;
 insert into public.tutor_grants(id,user_id,turn_id,expires_at) values(grant_id,owner_id,turn_id,clock_timestamp()+interval '1 hour');
 insert into public.tutor_grant_credentials values(grant_id,public.tutor_connector_verifier(secret,turn_id,grant_op));
 insert into public.command_receipts(user_id,operation_id,resource,result,trusted_writer_version)
  values(owner_id,grant_op,'tutor',jsonb_build_object('status','granted','grantId',grant_id),1);
 insert into public.tutor_attempts(user_id,turn_id,grant_id,generation,lease_until,finished_at,reason)
  values(owner_id,turn_id,grant_id,1,clock_timestamp(),clock_timestamp(),'reply');

 insert into public.tutor_answer_aids(id,user_id,turn_id,withhold) values(legacy_id,owner_id,turn_id,'["not all"]');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id)::text,true);
 perform set_config('role','authenticated',true);
 state:=public.tutor_answer_aid_state(owner_id,slug,checkpoint_id);
 if state #> '{0,ranking}' is not null or state #>> '{0,withhold,0}' is distinct from 'not all' then
  raise exception 'Legacy wire shape or guard metadata changed';
 end if;
 begin
  perform public.tutor_answer_aid_state(gen_random_uuid(),slug,checkpoint_id);
  raise exception 'Read was granted for a different owner';
 exception when insufficient_privilege then null; end;
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,jsonb_build_object('operation','list','turnId',turn_id));
  raise exception 'Authenticated role called connector';
 exception when insufficient_privilege then null; end;
 perform set_config('role','service_role',true);
 first_set:=jsonb_build_object('operation','set','turnId',turn_id,'aidId',first_op,'expectedVersion',1,
   'ranking',ranking,'withhold','["not all"]'::jsonb);
 first_receipt:=public.tutor_answer_aid_connector(owner_id,digest,grant_op,first_set);
 if first_receipt #>> '{answerAid,version}' is distinct from '2' or first_receipt #> '{answerAid,ranking}' is distinct from ranking
  or first_receipt #>> '{answerAid,grantId}' is distinct from grant_id::text then
  raise exception 'Structured replacement failed';
 end if;
 second_set:=jsonb_build_object('operation','set','turnId',turn_id,'aidId',second_op,'expectedVersion',2,'level','light');
 perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,second_set);
 if public.tutor_answer_aid_connector(owner_id,digest,grant_op,first_set) is distinct from first_receipt then
  raise exception 'Lost acknowledgement replaced newer content';
 end if;
 state:=public.tutor_answer_aid_connector(owner_id,digest,grant_op,jsonb_build_object('operation','list','turnId',turn_id));
 if state #>> '{answerAids,0,version}' is distinct from '3' or state #> '{answerAids,0,ranking}' is not null
  or state #>> '{scope,subject}' is distinct from slug or state #>> '{scope,step}' is distinct from 'CP1:0' then
  raise exception 'Replacement retained missing ranking or replay changed the version';
 end if;
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,first_set||'{"level":"none"}');
  raise exception 'Operation ID accepted a different payload';
 exception when unique_violation then null; end;
 undo_request:=jsonb_build_object('operation','undo','turnId',turn_id,'aidId',undo_op,'expectedVersion',3,'undoOperationId',second_op);
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,undo_request||jsonb_build_object('undoOperationId',first_op));
  raise exception 'Undo restored an obsolete version';
 exception when serialization_failure then null; end;
 undone:=public.tutor_answer_aid_connector(owner_id,digest,grant_op,undo_request);
 if undone #>> '{answerAid,version}' is distinct from '4' or undone #> '{answerAid,ranking}' is distinct from ranking
   or undone #>> '{answerAid,withhold,0}' is distinct from 'not all'
   or public.tutor_answer_aid_connector(owner_id,digest,grant_op,undo_request) is distinct from undone then
  raise exception 'Undo did not restore the exact aid at a new version';
 end if;
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,gen_random_uuid(),first_set);
  raise exception 'An unrelated handoff could replay the operation';
 exception when insufficient_privilege then null; end;
 perform set_config('role','none',true);
 update public.tutor_grants g set expires_at=clock_timestamp()-interval '1 second' where g.id=grant_id;
 perform set_config('role','service_role',true);
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,first_set);
  raise exception 'Expired grant could replay a receipt';
 exception when insufficient_privilege then null; end;
 perform set_config('role','none',true);
 update public.tutor_grants g set expires_at=clock_timestamp()+interval '1 hour',revoked_at=clock_timestamp() where g.id=grant_id;
 perform set_config('role','service_role',true);
 begin
  perform public.tutor_answer_aid_connector(owner_id,digest,grant_op,first_set);
  raise exception 'Revoked grant could replay a receipt';
 exception when insufficient_privilege then null; end;
 perform set_config('role','none',true);
end $test$;
rollback;
