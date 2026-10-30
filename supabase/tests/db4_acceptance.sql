-- DB-4 acceptance: run only after the migration is present. All synthetic
-- rows and journal entries are rolled back; never leave test projects in live data.
begin;
do $test$
declare
  owner_id uuid;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  system_subject uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  src uuid := gen_random_uuid();
  cp1 uuid := gen_random_uuid();
  cp2 uuid := gen_random_uuid();
  idea1 uuid := gen_random_uuid();
  idea2 uuid := gen_random_uuid();
  token text := substr(md5(gen_random_uuid()::text),1,8);
  got text;
  n integer;
begin
  select user_id into owner_id from public.settings limit 1;
  if owner_id is null then raise exception 'DB-4 acceptance requires a bootstrapped owner'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('lemma.source','system',true);
  perform set_config('lemma.tool','db4_acceptance',true);
  perform set_config('lemma.summary','Rolled-back DB-4 acceptance',true);

  insert into public.subjects(id,user_id,name,glyph,hue)
    values(a,owner_id,'DB4 A '||token,'A','slate'),
          (b,owner_id,'DB4 B '||token,'B','slate');
  insert into public.projects(id,user_id,slug,title,subject_id,goal)
    values(p1,owner_id,'db4-a-'||token,'DB4 draft A',a,null),
          (p2,owner_id,'db4-b-'||token,'DB4 draft B',b,null);
  if (select goal is not null from public.projects where id=p1) then
    raise exception 'Name-only project draft did not preserve nullable goal';
  end if;

  insert into public.sources(id,user_id,project_id,title,filename,sha256)
    values(src,owner_id,p1,'Week 7 notes','week7-notes.pdf',repeat('a',64));
  select short into got from public.sources where id=src;
  if got is null or got='' or length(got)>20 then
    raise exception 'Source short was not generated';
  end if;
  if (select kind from public.sources where id=src)<>'notes' then
    raise exception 'Source kind was not inferred from filename';
  end if;
  begin
    insert into public.sources(user_id,project_id,title,filename,sha256)
      values(owner_id,p1,'Duplicate','duplicate.pdf',repeat('a',64));
    raise exception 'Duplicate SHA-256 was accepted';
  exception when unique_violation then null;
  end;

  insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,due_on)
    values(cp1,owner_id,p1,'CP1',1,'Read notes','Understand','Demonstrate','["Prove it"]'::jsonb,current_date+7),
          (cp2,owner_id,p2,'CP1',1,'Other notes','Understand','Demonstrate','["Prove it"]'::jsonb,current_date+7);
  insert into public.checkpoint_sources(user_id,checkpoint_id,source_id,pages)
    values(owner_id,cp1,src,'2-4');
  if not exists(select 1 from public.action_changes c
    where c.table_name='checkpoint_sources' and c.new->>'checkpoint_id'=cp1::text) then
    raise exception 'Checkpoint source was not journalled';
  end if;
  begin
    insert into public.checkpoint_sources(user_id,checkpoint_id,source_id)
      values(owner_id,cp2,src);
    raise exception 'Cross-project source citation was accepted';
  exception when raise_exception then
    if sqlerrm='Cross-project source citation was accepted' then raise; end if;
  end;

  insert into public.concepts(id,user_id,subject_id,slug,name,level)
    values(idea1,owner_id,a,'compactness','Compactness','planet'),
          (idea2,owner_id,b,'compactness','Compactness','planet');
  begin
    update public.concepts set parent_id=idea1 where id=idea2;
    set constraints all immediate;
    raise exception 'Cross-subject Atlas parent was accepted';
  exception when raise_exception then
    if sqlerrm='Cross-subject Atlas parent was accepted' then raise; end if;
  end;
  if (public.merge_subjects(a,b)->>'projects')::integer<>1 then
    raise exception 'Subject merge did not move the project';
  end if;
  if (select count(*) from public.concepts where subject_id=b and id in (idea1,idea2))<>2 then
    raise exception 'Subject merge dropped a concept';
  end if;
  if (select count(distinct slug) from public.concepts where id in (idea1,idea2))<>2 then
    raise exception 'Subject merge did not resolve a slug collision';
  end if;
  if exists(select 1 from public.subjects where id=a) then
    raise exception 'Merged source subject remains';
  end if;

  -- Deferred Atlas parent validation must reject cross-subject edges.
  begin
    update public.concepts set parent_id=idea1 where id=idea2;
    -- Both ideas are in B after the merge, so this is valid.
    set constraints all immediate;
    if (select parent_id from public.concepts where id=idea2)<>idea1 then
      raise exception 'Valid Atlas parent did not persist';
    end if;
  exception when others then
    raise exception 'Valid same-subject Atlas parent failed: %',sqlerrm;
  end;
  insert into public.subjects(id,user_id,name,glyph,hue)
    values(system_subject,owner_id,'zz-selftest-'||token,'S','slate');
  begin
    perform public.merge_subjects(system_subject,b);
    raise exception 'Self-test subject merge was accepted';
  exception when raise_exception then
    if sqlerrm='Self-test subject merge was accepted' then raise; end if;
  end;
  if not exists(select 1 from pg_trigger where tgname='a_project_pin_limit') then
    raise exception 'Four-project pin cap trigger missing';
  end if;

  insert into public.proposals(user_id,project_id,kind,payload,origin,status,decided_at)
    values(owner_id,p1,'plan','{}'::jsonb,'other','approved',now());
  if not exists(select 1 from public.v_plan_revisions where project_id=p1 and revision>=1) then
    raise exception 'Approved plan history view is empty';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.undo_action(uuid,bigint,boolean)'::regprocedure),
    '''checkpoint_sources''')=0 then
    raise exception 'DB-2 undo whitelist lacks checkpoint_sources';
  end if;
  if not exists(select 1 from pg_policies
      where schemaname='public' and tablename='projects' and policyname='hide_system_projects') then
    raise exception 'System projects lack owner-facing visibility policy';
  end if;
  raise notice 'DB-4 acceptance passed; rolling back synthetic data';
end
$test$;
rollback;
