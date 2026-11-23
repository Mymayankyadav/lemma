import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';

// N228 (Owner): a quick questionnaire attached to a tutor reply; the learner's answers are kept until submitted, and
// the tutor reads them to judge the learner.
const sha=value=>createHash('sha256').update(value).digest('hex');
const verifier=(secret,turn,operation)=>sha(createHmac('sha256',secret)
 .update('lemma:tutor-connector:v1:'+turn+':'+operation).digest('hex'));
const cmd=(operation,fields)=>({operation,operationId:randomUUID(),...fields});
/** A new turn on the owner's thread; an earlier fixture's unanswered turn is cancelled first. */
async function newTurn(ownerCmd,state,question){
 let thread=await state();
 const pending=thread.head.pendingTurnId&&thread.turns.find(turn=>turn.id===thread.head.pendingTurnId);
 if(pending){await ownerCmd(cmd('cancel',{turnId:pending.id,expectedVersion:pending.version}));thread=await state();}
 const started=await ownerCmd(cmd('start',{expectedVersion:thread.head.lastSequence,question}));
 assert.equal(started.status,'submitted');
 return started.turnId;
}

export const QUESTIONS=[
 {id:'q1',kind:'short',prompt:'In your own words, when is a surjection a quotient map?'},
 {id:'q2',kind:'mcq',prompt:'Is every continuous surjection a quotient map?',options:['Yes','No']},
 {id:'q3',kind:'msq',prompt:'Which of these are always quotient maps?',options:['Open surjections','Closed surjections','Constant maps']},
];

/** Owner reads and writes. Runs in PGlite and PostgreSQL; the questionnaire is inserted directly here. */
export async function checkQuestionnaireOwner({db,owner,other,slug,checkpoint,as,one,ownerCmd,state,denied}){
 const read=(id=owner)=>one('select public.tutor_questionnaire_state($1,$2,$3) result',[id,slug,checkpoint]);
 const save=(questionnaire,expected,answers=null,submit=false,id=owner)=>
  one('select public.tutor_questionnaire_save($1,$2,$3,$4::jsonb,$5) result',[id,questionnaire,expected,answers&&JSON.stringify(answers),submit]);
 await as('authenticated',owner);
 const turn=await newTurn(ownerCmd,state,'Quotient maps');
 await ownerCmd(cmd('manual',{turnId:turn,expectedVersion:1,messageId:randomUUID(),body:'Good start. A quick check follows.'}));
 const id=randomUUID();
 await as();
 // Invalid question sets are refused by the table itself.
 for(const questions of [[],[{id:'q1',kind:'mcq',prompt:'One option',options:['Only']}],
  [{id:'q1',kind:'short',prompt:'A'},{id:'q1',kind:'short',prompt:'B'}],[{id:'Q 1',kind:'short',prompt:'A'}],
  [{id:'q1',kind:'short',prompt:'A',options:['x','y']}],[{id:'q1',kind:'essay',prompt:'A'}]]){
  await assert.rejects(db.query('insert into public.tutor_questionnaires(id,user_id,turn_id,title,questions) values($1,$2,$3,$4,$5::jsonb)',
   [randomUUID(),owner,turn,'Bad',JSON.stringify(questions)]));
 }
 await db.query("insert into public.tutor_questionnaires(id,user_id,turn_id,title,purpose,questions) values($1,$2,$3,'Quick check','diagnose',$4::jsonb)",
  [id,owner,turn,JSON.stringify(QUESTIONS)]);
 // Browsers cannot write the tables directly.
 for(const role of ['anon','authenticated']){
  for(const table of ['tutor_questionnaires','tutor_questionnaire_responses'])
   assert.equal(await one('select has_table_privilege($1,$2,$3) result',[role,'public.'+table,'INSERT,UPDATE,DELETE,TRUNCATE']),false);
 }
 await as('authenticated',owner);
 let [q]=await read();
 assert.equal(q.state,'unseen');assert.equal(q.version,0);assert.equal(q.turnId,turn);assert.equal(q.purpose,'diagnose');
 assert.deepEqual(q.questions,QUESTIONS);
 // Opening marks it seen; nothing answered yet.
 let saved=await save(id,0);
 assert.equal(saved.status,'saved');assert.equal(saved.questionnaire.state,'started');assert.equal(saved.questionnaire.version,1);
 // Partial answers are kept, version by version.
 saved=await save(id,1,{q2:1});
 assert.equal(saved.questionnaire.version,2);assert.deepEqual(saved.questionnaire.answers,{q2:1});
 // A stale copy does not overwrite: the current answers come back.
 const conflict=await save(id,1,{q2:0});
 assert.equal(conflict.status,'conflict');assert.deepEqual(conflict.questionnaire.answers,{q2:1});
 // Answers must fit their questions.
 for(const answers of [{q9:'x'},{q1:3},{q2:2},{q2:'1'},{q3:[0,0]},{q3:[5]},{q1:'x'.repeat(2001)}]) await denied(save(id,2,answers),'22023');
 // Submitting needs every question answered.
 await denied(save(id,2,{q1:'When open sets pull back',q2:1},true),'22023');
 await denied(save(id,2,{q1:'  ',q2:1,q3:[0]},true),'22023');
 saved=await save(id,2,{q1:'When U is open exactly when its preimage is open.',q2:1,q3:[0,1]},true);
 assert.equal(saved.status,'submitted');assert.equal(saved.questionnaire.state,'complete');assert.ok(saved.questionnaire.submittedAt);
 // A submitted questionnaire is kept as submitted.
 const locked=await save(id,3,{q2:0});
 assert.equal(locked.status,'submitted');assert.equal(locked.questionnaire.answers.q2,1);
 [q]=await read();assert.equal(q.state,'complete');
 // Another learner sees nothing and cannot write.
 await as('authenticated',other);
 await denied(read());await denied(save(id,0,null,false,owner));await denied(save(id,0,null,false,other));
 await as('anon');await denied(read(owner));
 await as();
 return {turn,id};
}

/** The tutor's path: only through the owner's connector secret and a grant whose turn it answered. PostgreSQL only. */
export async function checkQuestionnaireConnector({db,owner,as,one,ownerCmd,state,denied}){
 const secret='1'.repeat(48);
 const call=(nonce,command,key=secret)=>one('select public.tutor_questionnaire_connector($1,$2,$3,$4::jsonb) result',[owner,sha(key),nonce,JSON.stringify(command)]);
 const host=(nonce,command)=>one('select public.tutor_connector_command($1,$2,$3,$4::jsonb) result',[owner,sha(secret),nonce,JSON.stringify(command)]);
 await as();await db.exec('update public.tutor_release_controls set enabled=true');
 await as();await db.query('update public.settings set connector_secret=$1 where user_id=$2',[secret,owner]);
 await as('authenticated',owner);
 const turnId=await newTurn(ownerCmd,state,'A continuous surjection');
 const operationId=randomUUID();
 await ownerCmd({operation:'grant',operationId,turnId,expectedVersion:1,tokenHash:verifier(secret,turnId,operationId)});
 const questionnaireId=randomUUID();
 const create={operation:'create',turnId,questionnaireId,title:'Quotient maps: quick check',purpose:'check',questions:QUESTIONS};
 await as('authenticated',owner);await denied(call(operationId,create));
 await as('service_role');
 // Not before the tutor has replied to the turn.
 await denied(call(operationId,create),'40001');
 await denied(call(randomUUID(),create));
 await denied(call(operationId,create,'9'.repeat(48)));
 const claim=await host(operationId,cmd('claim',{turnId,expectedVersion:1}));
 const body='Close. Answer the quick check when you can.';
 assert.equal((await host(operationId,cmd('reply',{turnId,claimId:claim.claimId,generation:claim.generation,expectedVersion:claim.version,
  messageId:randomUUID(),body}))).status,'completed');
 for(const bad of [{...create,questions:[]},{...create,purpose:'grade'},{...create,title:' '},{...create,extra:true},
  {...create,questions:[{id:'q1',kind:'mcq',prompt:'?',options:['a']}]}]){
  await assert.rejects(call(operationId,{...bad,questionnaireId:randomUUID()}));
 }
 const made=await call(operationId,create);
 assert.equal(made.status,'created');assert.equal(made.questionnaire.state,'unseen');
 // A retry of the same questionnaire is the same receipt; a different one under its ID is refused.
 assert.deepEqual(await call(operationId,create),made);
 await denied(call(operationId,{...create,title:'Another'}),'23505');
 await call(operationId,{...create,questionnaireId:randomUUID(),title:'Second'});
 await denied(call(operationId,{...create,questionnaireId:randomUUID(),title:'Third'}),'22023');
 // The learner opens it and answers part; the tutor reads the answers to judge.
 await as('authenticated',owner);
 await one('select public.tutor_questionnaire_save($1,$2,0,$3::jsonb,false) result',[owner,questionnaireId,JSON.stringify({q2:1})]);
 await as('service_role');
 const listed=(await call(operationId,{operation:'list',turnId})).questionnaires;
 const mine=listed.find(item=>item.id===questionnaireId);
 assert.equal(mine.state,'started');assert.deepEqual(mine.answers,{q2:1});
 assert.ok(listed.some(item=>item.title==='Quick check'),'the thread\'s earlier questionnaire is listed too');
 // A revoked grant reads nothing.
 await as();await db.query('update public.tutor_grants set revoked_at=clock_timestamp() where turn_id=$1',[turnId]);
 await as('service_role');await denied(call(operationId,{operation:'list',turnId}));
 await as();
 console.log('N228 passed questionnaire attach after reply, idempotent create, limits, learner saves and the tutor\'s read.');
}

/**
 * N228 (Owner: "allow posting of messages even when tutor is not"): follow-up messages on the waiting turn. `connector` is
 * the tutor's read (PostgreSQL only). The owner path runs in PGlite and PostgreSQL.
 */
export async function checkFollowups({db,owner,other,slug,checkpoint,as,one,ownerCmd,state,denied,connector=false}){
 const read=(id=owner)=>one('select public.tutor_followup_state($1,$2,$3) result',[id,slug,checkpoint]);
 const add=(turn,message,body,id=owner)=>one('select public.tutor_followup_add($1,$2,$3,$4,$5,$6) result',[id,slug,checkpoint,turn,message,body]);
 await as('authenticated',owner);
 const turn=await newTurn(ownerCmd,state,'A question the tutor has not answered yet');
 const first=randomUUID();
 let saved=await add(turn,first,'  Also, I am not sure about part (b).  ');
 assert.equal(saved.status,'saved');assert.equal(saved.followup.body,'Also, I am not sure about part (b).');assert.equal(saved.followup.seen,false);
 // A retry is the same message; a different message under its id is refused.
 assert.deepEqual(await add(turn,first,'Also, I am not sure about part (b).'),saved);
 await denied(add(turn,first,'Something else'),'23505');
 await add(turn,randomUUID(),'And one more thing.');
 for(const body of ['',' \n ','x'.repeat(2001)]) await denied(add(turn,randomUUID(),body),'22023');
 for(let i=0;i<8;i++) await add(turn,randomUUID(),'More '+i);
 await denied(add(turn,randomUUID(),'One too many'),'22023');
 const listed=await read();
 assert.equal(listed.filter(item=>item.turnId===turn).length,10);
 assert.equal(listed.find(item=>item.id===first).body,'Also, I am not sure about part (b).');
 // Browsers never write the table; other users see and write nothing.
 await as();
 for(const role of ['anon','authenticated'])
  assert.equal(await one('select has_table_privilege($1,$2,$3) result',[role,'public.tutor_followups','INSERT,UPDATE,DELETE,TRUNCATE']),false);
 await as('authenticated',other);
 await denied(read());await denied(add(turn,randomUUID(),'Not mine'));
 await as('authenticated',owner);
 // The tutor's reply completes the turn; it takes no more messages (the next one is a new turn), but a retry still answers.
 await ownerCmd(cmd('manual',{turnId:turn,expectedVersion:1,messageId:randomUUID(),body:'Here is the reply.'}));
 await denied(add(turn,randomUUID(),'Too late'),'40001');
 assert.deepEqual(await add(turn,first,'Also, I am not sure about part (b).'),saved);
 assert.equal((await read()).filter(item=>item.turnId===turn).length,10);
 await as();
 if(!connector)return;

 // The tutor reads them with the turn's grant, and marks them seen.
 const secret='1'.repeat(48);
 await as();await db.exec('update public.tutor_release_controls set enabled=true');await db.query('update public.settings set connector_secret=$1 where user_id=$2',[secret,owner]);
 await as('authenticated',owner);
 const waiting=await newTurn(ownerCmd,state,'Another waiting question');
 const operationId=randomUUID();
 await ownerCmd({operation:'grant',operationId,turnId:waiting,expectedVersion:1,tokenHash:verifier(secret,waiting,operationId)});
 await add(waiting,randomUUID(),'First extra message');
 await add(waiting,randomUUID(),'Second extra message');
 const call=(nonce,command,key=secret)=>one('select public.tutor_followup_connector($1,$2,$3,$4::jsonb) result',[owner,sha(key),nonce,JSON.stringify(command)]);
 await as('authenticated',owner);await denied(call(operationId,{operation:'followups',turnId:waiting}));
 await as('service_role');
 await denied(call(randomUUID(),{operation:'followups',turnId:waiting}));
 await denied(call(operationId,{operation:'followups',turnId:waiting},'9'.repeat(48)));
 await denied(call(operationId,{operation:'followups',turnId:waiting,extra:1}),'22023');
 const peek=await call(operationId,{operation:'followups',turnId:waiting});
 assert.deepEqual(peek.followups.map(item=>item.body),['First extra message','Second extra message']);
 assert.equal(peek.unseen,2);
 assert.equal((await call(operationId,{operation:'followups',turnId:waiting})).unseen,2,'a read without markSeen leaves them unseen');
 assert.equal((await call(operationId,{operation:'followups',turnId:waiting,markSeen:true})).unseen,2);
 assert.equal((await call(operationId,{operation:'followups',turnId:waiting})).unseen,0);
 await as('authenticated',owner);await add(waiting,randomUUID(),'Third, after the tutor read');
 await as('service_role');
 const later=await call(operationId,{operation:'followups',turnId:waiting});
 assert.equal(later.unseen,1);assert.equal(later.followups.length,3);assert.equal(later.followups[0].seen,true);
 await as();await db.query('update public.tutor_grants set revoked_at=clock_timestamp() where turn_id=$1',[waiting]);
 await as('service_role');await denied(call(operationId,{operation:'followups',turnId:waiting}));
 await as();
 console.log('N228 passed follow-up messages on a waiting turn: idempotent posting, limits, ordering with the reply and the tutor\'s read.');
}
