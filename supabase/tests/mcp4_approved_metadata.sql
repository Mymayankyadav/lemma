-- Run against the owner project after DB-4 follow-up. Synthetic rows are rolled back.
begin;
do $test$
declare
  owner_id uuid;
  subject_key uuid := gen_random_uuid();
  project_key uuid := gen_random_uuid();
  source_key uuid := gen_random_uuid();
  checkpoint_key uuid := gen_random_uuid();
  proposal_key uuid := gen_random_uuid();
  plan_change_key uuid := gen_random_uuid();
  short_name text;
  token text := substr(md5(gen_random_uuid()::text),1,8);
  parent_key uuid;
begin
  select user_id into owner_id from public.settings limit 1;
  if owner_id is null then raise exception 'Need bootstrapped owner for DB-4 acceptance'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('lemma.source','system',true);
  perform set_config('lemma.tool','mcp4_metadata_test',true);
  perform set_config('lemma.summary','Rolled-back MCP-4 approval metadata test',true);
  insert into public.subjects(id,user_id,name,glyph,hue)
    values(subject_key,owner_id,'MCP4 Test '||token,'T','slate');
  insert into public.projects(id,user_id,slug,title,subject_id,goal)
    values(project_key,owner_id,'mcp4-test-'||token,'MCP4 test',subject_key,'Test');
  insert into public.sources(id,user_id,project_id,title,filename,status)
    values(source_key,owner_id,project_key,'Week 7 notes','week7.pdf','ready');
  select short into short_name from public.sources where id=source_key;
  insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps)
    values(checkpoint_key,owner_id,project_key,'CP1',10,'Practice','Understand','Prove','["Prove"]'::jsonb);
  insert into public.proposals(id,user_id,project_id,kind,origin,payload)
    values(proposal_key,owner_id,project_key,'plan','other',
      jsonb_build_object('checkpoints',jsonb_build_array(
        jsonb_build_object('code','CP1','due_on','2026-12-09','sources',
          jsonb_build_array(jsonb_build_object('source',short_name,'pages','3-5')))),
        'concepts',jsonb_build_array(
          jsonb_build_object('name','Group theory','level','galaxy'),
          jsonb_build_object('name','Sylow theory','level','system','parent','Group theory'),
          jsonb_build_object('name','Sylow theorem','level','planet','parent','Sylow theory','star',true))));
  update public.proposals set status='approved',decided_at=now() where id=proposal_key;
  if (select due_on from public.checkpoints where id=checkpoint_key)<>date '2026-12-09' then
    raise exception 'Approved due_on not persisted';
  end if;
  if (select pages from public.checkpoint_sources where checkpoint_id=checkpoint_key and source_id=source_key)<>'3-5' then
    raise exception 'Approved citation not persisted';
  end if;
  select id into parent_key from public.concepts where user_id=owner_id and subject_id=subject_key and name='Sylow theory';
  if (select level from public.concepts where id=parent_key)<>'system' then
    raise exception 'System level not persisted';
  end if;
  if not exists(select 1 from public.concepts where user_id=owner_id and subject_id=subject_key
       and name='Sylow theorem' and level='planet' and is_star=true and parent_id=parent_key) then
    raise exception 'Approved concept hierarchy not persisted';
  end if;
  insert into public.proposals(id,user_id,project_id,kind,origin,payload)
    values(plan_change_key,owner_id,project_key,'plan_change','other',
      jsonb_build_object('ops',jsonb_build_array(
        jsonb_build_object('op','update','code','CP1','due_on','2026-12-16','sources',
          jsonb_build_array(jsonb_build_object('source',short_name,'pages','7-9'))))));
  update public.proposals set status='approved',decided_at=now() where id=plan_change_key;
  if (select due_on from public.checkpoints where id=checkpoint_key)<>date '2026-12-16'
     or (select pages from public.checkpoint_sources where checkpoint_id=checkpoint_key and source_id=source_key)<>'7-9' then
    raise exception 'Plan change metadata was not applied';
  end if;
  raise notice 'MCP-4 v3 metadata acceptance passed; rolling back';
end
$test$;
rollback;
