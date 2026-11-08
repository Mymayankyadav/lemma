-- N97: representative owner account written against the pre-v6 schema.
-- Deterministic, fictitious IDs, timestamps and data; no credentials or production data.
-- Load after the last pre-v6 migration and before 20261105141000_v6_study.sql.
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.settings(user_id,connector_secret)
 values ('11111111-1111-4111-8111-111111111111',repeat('a',48));
insert into public.subjects(id,user_id,name,glyph,hue)
 values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Analysis','A','amber');
insert into public.projects(id,user_id,subject_id,slug,title,goal,status,next_session_number)
 values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222','real-analysis','Real analysis','Prove continuity','active',2);
insert into public.concepts(id,user_id,subject_id,slug,name) values
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222','limits','Limits'),
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222','continuity','Continuity');
insert into public.concept_links(user_id,from_id,to_id,kind)
 values ('11111111-1111-4111-8111-111111111111',
 '44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','prereq');
insert into public.sources(id,user_id,project_id,title,short,status,page_count)
 values ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333','Lecture notes','NOTES','ready',2);
insert into public.source_pages(user_id,source_id,page,label,body) values
 ('11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',1,'p. 1','Definition of continuity'),
 ('11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',2,'p. 2','Epsilon delta proof');
insert into public.checkpoints
 (id,user_id,project_id,code,position,title,objective,criterion,steps,source_id,status,current_step,demonstrated_at,recheck_due)
 values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333','CP1',1,'Define a limit','Recall the definition',
  'State it precisely','["State epsilon-delta"]'::jsonb,'66666666-6666-4666-8666-666666666666',
  'demonstrated',1,'2026-10-11T09:00:00Z','2026-10-25'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333','CP2',2,'Prove continuity','Connect limits',
  'Write a proof','["Prove continuity"]'::jsonb,'66666666-6666-4666-8666-666666666666',
  'in_progress',0,null,null);
insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id)
 values ('11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id)
 values ('11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','55555555-5555-4555-8555-555555555555');
insert into public.sessions
 (id,user_id,project_id,number,goal,style,checkpoint_id,state,minutes,started_at,ended_at)
 values ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',1,'Work through limits','socratic',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ended',42,'2026-10-11T08:00:00Z','2026-10-11T09:00:00Z');
insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome)
 values ('11111111-1111-4111-8111-111111111111',
 '77777777-7777-4777-8777-777777777777','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'evidence','Gave the epsilon-delta argument','demonstrated');
insert into public.notes
 (id,user_id,project_id,checkpoint_id,session_id,concept_id,source_id,front,back,kind,page_label)
 values ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444',
 '66666666-6666-4666-8666-666666666666','What is a limit?','An epsilon-delta condition','definition','p. 1');
insert into public.cards
 (id,user_id,note_id,ord,state,due,stability,difficulty,last_review,reps,lapses)
 values ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
 '88888888-8888-4888-8888-888888888888',1,2,'2026-10-22T08:00:00Z',4.5,5.1,
 '2026-10-12T08:00:00Z',3,1);
insert into public.reviews
 (user_id,card_id,reviewed_at,rating,state_before,confidence,duration_ms,prev)
 values ('11111111-1111-4111-8111-111111111111',
 '99999999-9999-4999-8999-999999999999','2026-10-12T08:00:00Z',3,1,'unsure',42000,
 '{"state":1,"due":"2026-10-12T08:00:00Z","stability":2.1}'::jsonb);
insert into public.proposals(user_id,project_id,session_id,kind,payload,origin,status)
 values ('11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777',
 'card','{"front":"Explain continuity","back":"Use limits"}'::jsonb,'chatgpt','pending');
