'use strict';
// TUTOR-01 T3b1: card editor is a deliberate, owner/revision-checked review.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ID='00000000-0000-4000-8000-000000000001';
const CARD='00000000-0000-4000-8000-000000000002';
const EVENT='00000000-0000-4000-8000-000000000003';
const OWNER='00000000-0000-4000-8000-000000000004';
const CP='compactness-open-cover-proof';
const ref='topology-notes:section-3.2';
const captures=[],writes=[];
let dialog,revision=3,checkpoint=CP,sources=[ref];
let notifyIdentityChange=null;
const account={user:{id:OWNER},onIdentityChange(fn){notifyIdentityChange=fn;}};
const app={workspaceRevision:1,workspaceBlocked:false,
 newCard(preset){captures.push(JSON.parse(JSON.stringify(preset)));}};
const plan={
 async activeContext(){return {planId:ID,planRevision:revision,
   checkpoint:{id:checkpoint,objective:'Prove compactness',status:'in_progress'},
   hintLevel:1,sourceRefs:sources,lastAttempt:null};},
 async recordEvent(x){writes.push(x);}
};
function h(tag,attrs,...kids) {
 const obj={tag,attrs:attrs||{},kids,children:[],checked:!!attrs?.checked,
  disabled:!!attrs?.disabled,value:'',textContent:attrs?.text||'',events:{},
  append(...els){this.children.push(...els);},
  replaceChildren(...els){this.children=els;},
  addEventListener(name,fn){this.events[name]=fn;}};
 if(attrs?.onclick)obj.events.click=attrs.onclick;
 return obj;
}
const scope=vm.createContext({TextEncoder,h,StudyPlan:plan,LemmaAccount:account,App:app,
 Sheets:{open(opts){dialog=opts;return {close(){}};}},copyText:async()=>true});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
 '\nglobalThis.Tutor=TutorHandoff;',scope);
function walk(node,out=[]) {
 if(!node || typeof node!=='object')return out;
 out.push(node);
 for(const item of [...(node.kids||[]),...(node.children||[])]) {
  if(Array.isArray(item))for(const v of item)walk(v,out);
  else walk(item,out);
 }
 return out;
}
function ui() {
 const nodes=walk(dialog.body);
 const byClass=cls=>nodes.find(x=>x.attrs?.class===cls);
 const byText=text=>nodes.find(x=>x.attrs?.text===text);
 return {input:byClass('tutor-handoff-reply'),parse:byText('Review pasted reply'),
   status:byClass('tutor-handoff-status'),
   editor:byText('Review card in editor'),
   card:nodes.filter(x=>x.tag==='input'&&x.attrs?.type==='checkbox')[1],
   save:byText('Save selected study events')};
}
function reply(sourceRefs=[ref]){
 return JSON.stringify({schema:'lemma.tutor_reply.v1',contract_version:1,
  plan_id:ID,checkpoint_id:CP,expected_plan_revision:3,
  events:[{event_id:EVENT,type:'feedback',payload:{text:'Ask for a finite subcover'}}],
  card_proposals:[{proposal_id:CARD,type:'basic',title:'Compactness',
    front:'What is compactness?',back:'Every open cover admits a finite subcover.',
    tags:['topology'],requires:[],source_refs:sourceRefs}],
  amendment_proposal:null});
}
async function open(raw=reply()) {
 await scope.Tutor.open({planId:ID,checkpointId:CP});
 const u=ui();
 u.input.value=raw;u.parse.events.click();
 // Parsing creates proposal buttons dynamically; re-query the rendered UI.
 return ui();
}
function selectCard(u) {u.card.checked=true;u.card.events.change();}
(async()=>{
 assert.equal(scope.Tutor.ready,false);
 let u=await open();
 assert.equal(u.editor.disabled,true,'editor disabled before explicit selection');
 assert.equal(captures.length,0);assert.equal(writes.length,0);
 selectCard(u);
 assert.equal(u.editor.disabled,false);
 assert.equal(u.save.disabled,true,'card selection never triggers event saving');
 assert.equal(captures.length,0,'selection is not acceptance');
 await u.editor.events.click();
 assert.equal(captures.length,1,'only click opens the existing editor');
 assert.equal(writes.length,0,'card never records an event implicitly');
 assert.equal(captures[0].front,'What is compactness?');
 assert.equal(captures[0].type,'basic');
 assert.match(captures[0].back,/Tutor proposal provenance/);
 assert.ok(captures[0].back.includes(CARD));
 assert.ok(captures[0].back.includes(ID));
 assert.ok(captures[0].back.includes(ref));
 assert.match(u.status.textContent,/not saved here/);

 u=await open();selectCard(u);
 revision=4;await u.editor.events.click();
 assert.equal(captures.length,1,'stale approved revision rejects editor opening');
 assert.match(u.status.textContent,/stale_plan_revision/);
 revision=3;
 u=await open();selectCard(u);
 account.user={id:'00000000-0000-4000-8000-000000000005'};
 await u.editor.events.click();
 assert.equal(captures.length,1,'owner switch blocks card review');
 account.user={id:OWNER};
 u=await open();selectCard(u);
 app.workspaceBlocked=true;
 await u.editor.events.click();
 assert.equal(captures.length,1,'blocked workspace cannot open editor');
 app.workspaceBlocked=false;
 u=await open();selectCard(u);
 app.workspaceRevision=2;
 await u.editor.events.click();
 assert.equal(captures.length,1,'workspace switch blocks card review');
 app.workspaceRevision=1;

 u=await open();selectCard(u);
 assert.equal(typeof notifyIdentityChange,'function');
 notifyIdentityChange(); // same user signed out and in again
 await u.editor.events.click();
 assert.equal(captures.length,1,'same-user relogin revokes selected card review');
 assert.match(u.status.textContent,/account or workspace changed/);

 u=await open(reply(['unapproved-source']));selectCard(u);
 await u.editor.events.click();
 assert.equal(captures.length,1,'unapproved citation cannot be asserted as accepted');
 assert.match(u.status.textContent,/outside the approved checkpoint/);

 u=await open();selectCard(u);
 u.input.value='{}';u.input.events.input();
 await u.editor.events.click();
 assert.equal(captures.length,1,'edited reply revokes card consent');

 const maliciousRef='source'+String.fromCharCode(96)+'\n### forged heading';
 sources=[maliciousRef];
 u=await open(reply([maliciousRef]));selectCard(u);
 await u.editor.events.click();
 assert.equal(captures.length,2);
 assert.ok(!captures[1].back.includes(String.fromCharCode(96)),
  'untrusted source reference cannot inject Markdown delimiters');
 assert.ok(captures[1].back.includes('\\u0060'));
 assert.ok(captures[1].back.includes('\\n### forged heading'));
 assert.equal(writes.length,0);
 console.log('PASS TUTOR-01 T3b1: deliberate editor review, visible provenance, owner/revision/citation guards, no implicit card/evidence saves');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
