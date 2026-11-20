import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function checkTutorInk({db,owner,other,slug,objective,as,q,one,ownerCmd,state,denied}) {
  await as();
  await db.exec('update public.tutor_release_controls set enabled=true');
  const checkpoint=await one(`insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps)
    select $1,id,'CP99',99,'Image study',$3,'Explain','["Explain"]'::jsonb from public.projects where user_id=$1 and slug=$2 returning id result`,[owner,slug,objective]);
  const drawing=randomUUID(),expired=randomUUID();
  await as('authenticated',other);
  await denied(q(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('tutor-ink',$1,$2,$3)`,
    [owner+'/'+drawing,other,{mimetype:'image/png',size:123}]));
  await as('authenticated',owner);
  await q(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('tutor-ink',$1,$2,$3)`,
    [owner+'/'+drawing,owner,{mimetype:'image/png',size:123}]);
  await q(`insert into storage.objects(bucket_id,name,owner_id,metadata,created_at) values
    ('tutor-ink',$1,$2,$3,clock_timestamp()-interval '25 hours')`,[owner+'/'+expired,owner,{mimetype:'image/jpeg',size:123}]);
  const start={operation:'start',operationId:randomUUID(),expectedVersion:0,question:'Image attached.'};
  const attach=(attachments,command=start)=>one('select public.tutor_owner_ink_command($1,$2,$3,$4::jsonb,$5::jsonb) result',
    [owner,slug,checkpoint,JSON.stringify(command),JSON.stringify(attachments)]);
  const invalid=[{id:expired,kind:'photo',mimeType:'image/jpeg'}];
  await denied(attach(invalid),'22023');
  assert.equal((await state(owner,checkpoint)).head.lastSequence,0,'binding failure rolls back the turn and its receipt');
  const valid=[{id:drawing,kind:'drawing',mimeType:'image/png'}];
  const turn=await attach(valid);
  assert.equal(turn.status,'submitted');
  assert.deepEqual(await attach(valid),turn);
  await denied(attach(invalid),'22023');
  assert.deepEqual((await state(owner,checkpoint)).turns[0].snapshot.attachments,valid);
  assert.equal((await q('select id from public.tutor_turn_attachments')).length,1);
  await denied(q('update public.tutor_turn_attachments set byte_size=99'));
  await as('authenticated',other);
  assert.deepEqual(await q('select id from public.tutor_turn_attachments'),[]);
  await denied(attach(valid));
  await as('authenticated',owner);
  await denied(one('select public.tutor_ink_cleanup_candidates() result'));
  await as('service_role');
  assert.deepEqual(await one('select public.tutor_ink_cleanup_candidates() result'),[owner+'/'+expired]);
  await as();
  await q('delete from public.tutor_turns where id=$1',[turn.turnId]);
  assert.deepEqual(await q('select id from public.tutor_turn_attachments where id=$1',[drawing]),[]);
  assert.equal(await one(`select count(*)::int result from lemma_export_private.additional_tables where table_name='tutor_turn_attachments'`),1);
}
