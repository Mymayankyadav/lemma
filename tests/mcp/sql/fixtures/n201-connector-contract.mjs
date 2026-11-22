import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const verifier=(secret,turn,operation)=>sha(createHmac('sha256',secret)
 .update('lemma:tutor-connector:v1:'+turn+':'+operation).digest('hex'));
const cmd=(operation,fields)=>({operation,operationId:randomUUID(),...fields});

export async function checkRegularTutorConnector({db,owner,other,as,one,ownerCmd,state,denied}){
 const original='1'.repeat(48),otherSecret='2'.repeat(48),rotated='3'.repeat(48);
 const host=(nonce=null,command=null,user=owner,key=original)=>
  one('select public.tutor_connector_command($1,$2,$3,$4::jsonb) result',[user,sha(key),nonce,command]);
 const active=(turn,grant,nonce)=>one('select public.tutor_owner_grant_active($1,$2,$3) result',[turn,grant,nonce]);
 const hold=enabled=>db.query("update public.tutor_release_controls set enabled=$1 where capability='mcp'",[enabled]);
 const grant=(turn,secret,checkpoint)=>{const operationId=randomUUID();return ownerCmd({
  operation:'grant',operationId,turnId:turn,expectedVersion:1,tokenHash:verifier(secret,turn,operationId),
 },db,checkpoint);};

 await as();await db.exec('update public.tutor_release_controls set enabled=true');
 await as('authenticated',owner);
 const prior=await ownerCmd(cmd('start',{expectedVersion:4,question:'Private earlier answer',localExcerpt:'Private earlier excerpt'}));
 await ownerCmd(cmd('manual',{turnId:prior.turnId,expectedVersion:1,messageId:randomUUID(),
  body:'Earlier feedback stays with the learner.\n\nWhat is the value?'}));
 const turnId=(await ownerCmd(cmd('start',{expectedVersion:5,question:'17'}))).turnId;
 const get={operation:'get',turnId};
 const manual=await ownerCmd(cmd('grant',{turnId,expectedVersion:1,tokenHash:'e'.repeat(64)}));
 assert.equal(await active(turnId,manual.grantId,manual.operationId),false);
 await denied(host());
 await as('service_role');assert.deepEqual(await host(),[]);
 await denied(host(manual.operationId,get));

 await as('authenticated',owner);const initial=await grant(turnId,original);
 assert.equal(await active(turnId,initial.grantId,initial.operationId),true);
 await as('authenticated',other);assert.equal(await active(turnId,initial.grantId,initial.operationId),false);
 await as('service_role');
 assert.deepEqual(await host(),[{id:turnId+'.'+initial.operationId}]);
 assert.deepEqual(await host(null,null,other,otherSecret),[]);
 await denied(host(initial.operationId,get,other,otherSecret));
 await denied(host(initial.operationId,get,owner,otherSecret));
 await denied(host(randomUUID(),get));
 const fresh=await host(initial.operationId,get);
 assert.deepEqual(fresh.snapshot,{question:'17',selectedContext:[]});
 assert.deepEqual(fresh.checkpoint,{code:'CP1',title:'Logic'});
 assert.equal(fresh.previousTutorQuestion,'What is the value?');
 await as('authenticated',owner);
 assert.ok(Date.parse((await state()).listenerSeenAt)>0);
 await as('authenticated',other);
 await denied(state(owner));
 await as('service_role');
 assert.deepEqual(Object.keys(fresh).sort(),['checkpoint','generation','previousTutorQuestion','snapshot','status','turnId','version']);

 await as('authenticated',owner);
 await ownerCmd(cmd('revoke',{turnId,expectedVersion:1,grantId:initial.grantId}));
 assert.equal(await active(turnId,initial.grantId,initial.operationId),false);
 await as('service_role');await denied(host(initial.operationId,get));assert.deepEqual(await host(),[]);
 await as('authenticated',owner);const expiring=await grant(turnId,original);
 await as();await db.query("update public.tutor_grants set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expiring.grantId]);
 await as('service_role');await denied(host(expiring.operationId,get));assert.deepEqual(await host(),[]);

 await as('authenticated',owner);const stale=await grant(turnId,original);
 await as();await db.query('update public.settings set connector_secret=$1 where user_id=$2',[rotated,owner]);
 await as('authenticated',owner);assert.equal(await active(turnId,stale.grantId,stale.operationId),false);
 const final=await grant(turnId,rotated);
 await as('service_role');await denied(host(stale.operationId,get));await denied(host());
 const use=(command)=>host(final.operationId,command,owner,rotated);
 const discover=()=>host(null,null,owner,rotated);
 const next={operation:'next',turnId};
 assert.deepEqual(await discover(),[{id:turnId+'.'+final.operationId}]);
 await denied(use(next));
 await as();await hold(false);
 await as('authenticated',owner);assert.equal(await active(turnId,final.grantId,final.operationId),false);
 await as('service_role');await denied(use(get));await denied(discover());
 await as();await hold(true);
 await as('service_role');
 const claim=await use(cmd('claim',{turnId,expectedVersion:1}));
 assert.equal(claim.status,'claimed');
 await denied(use(cmd('claim',{turnId,expectedVersion:claim.version})),'40001');
 const lease={turnId,claimId:claim.claimId,generation:claim.generation};
 assert.equal((await use(cmd('renew',lease))).status,'renewed');
 const nextQuestion=[
  'Your method also works for the definite integral',
  String.raw`\[
\int_0^1 x^2\,dx
\]`,
  'What is its exact value?',
 ].join('\n\n')+'\n\n'+
  ('You can justify your answer with an antiderivative or by a limit of sums. '.repeat(21)).trimEnd();
 assert.ok(nextQuestion.length>1500);
 const response=cmd('reply',{...lease,expectedVersion:claim.version,messageId:randomUUID(),
  body:'Private feedback about the previous answer.\n\n'+nextQuestion,nextQuestion});
 for(const invalid of [null,'\t\n','A different question?','x'.repeat(12001)]){
  await denied(use({...response,nextQuestion:invalid}),'22023');
 }
 const receipt=await use(response);
 assert.equal(receipt.status,'completed');
 assert.deepEqual(await use(response),receipt);
 assert.equal((await use({...response,nextQuestion:'What is its exact value?'})).status,'conflict');
 await denied(use({...response,operationId:randomUUID()}),'40001');
 assert.deepEqual(await discover(),[]);
 assert.equal('snapshot' in await use(get),false);
 await as('authenticated',owner);
 assert.equal(await active(turnId,final.grantId,final.operationId),false);
 assert.equal((await state()).turns.find(turn=>turn.id===turnId).finalReply.body,response.body);
 await as();
 const unrelatedCheckpoint=await one(`select cp.id result from public.checkpoints cp
  where cp.user_id=$1 and cp.id not in(select h.checkpoint_id from public.tutor_threads h where h.user_id=$1)
  limit 1`,[owner]);
 assert.ok(unrelatedCheckpoint);
 await as('authenticated',owner);
 const unrelated=(await ownerCmd(cmd('start',{expectedVersion:0,question:'A different thread'}),db,unrelatedCheckpoint)).turnId;
 const unrelatedGrant=await grant(unrelated,rotated,unrelatedCheckpoint);
 const followup=(await ownerCmd(cmd('start',{expectedVersion:6,question:'1/3'}))).turnId;
 await as('service_role');
 assert.deepEqual(await discover(),[{id:unrelated+'.'+unrelatedGrant.operationId}]);
 assert.equal('previousTutorQuestion' in await host(unrelatedGrant.operationId,{operation:'get',turnId:unrelated},owner,rotated),false);
 assert.equal(await use(next),null);
 await as('authenticated',owner);
 const followupGrant=await grant(followup,rotated);
 await as('service_role');
 assert.deepEqual(await use(next),{id:followup+'.'+followupGrant.operationId});
 const followupContext=await host(followupGrant.operationId,{operation:'get',turnId:followup},owner,rotated);
 assert.deepEqual(followupContext.snapshot,{question:'1/3',selectedContext:[]});
 assert.equal(followupContext.previousTutorQuestion,nextQuestion);
 await as('authenticated',owner);
 await ownerCmd(cmd('revoke',{turnId:followup,expectedVersion:1,grantId:followupGrant.grantId}));
 await as('service_role');assert.equal(await use(next),null);
 await as();await db.query('update public.tutor_grants set revoked_at=clock_timestamp() where id=$1',[final.grantId]);
 await as('service_role');await denied(use(next));
 console.log('N201 passed connector authorization, verbatim same-thread follow-up, rotation, revoke, expiry and exact reply replay.');
}
