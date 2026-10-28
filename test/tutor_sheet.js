'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ID='00000000-0000-4000-8000-000000000001';
const checkpointId='compactness-open-cover-proof';
let writes=0, dialog;
function h(tag,attrs,...kids){
 const obj={tag,attrs:attrs||{},kids,children:[],textContent:attrs?.text || '',value:'',disabled:!!attrs?.disabled,checked:!!attrs?.checked,events:{},
   addEventListener(k,fn){this.events[k]=fn},
   append(...els){this.children.push(...els)},
   replaceChildren(...els){this.children=els}};
 if(attrs?.onclick)obj.events.click=attrs.onclick;
 return obj;
}
const scope=vm.createContext({TextEncoder,h,
 StudyPlan:{async activeContext(){return {planId:ID,planRevision:3,contextId:null,contextRevision:null,
  checkpoint:{id:checkpointId,objective:'Show the theorem',status:'in_progress'},
  hintLevel:2,sourceRefs:[],lastAttempt:{eventId:ID,text:'Partial proof'} };},
  async recordEvent(){writes++;}},
 Sheets:{open(options){dialog=options;return {close(){}}}},
 copyText:async()=>true
});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+'\nglobalThis.API=TutorHandoff;',scope);
function walk(n,acc=[]){if(!n||typeof n!=='object')return acc;acc.push(n);
 for(const item of [...(n.kids||[]),...(n.children||[])])walk(item,acc);return acc;}
(async()=>{
 assert.equal(scope.API.ready,false);
 await assert.rejects(scope.API.open({planId:ID,checkpointId:'wrong'}),/changed/);
 await scope.API.open({planId:ID,checkpointId});
 assert.ok(dialog);
 const nodes=walk(dialog.body);
 const packet=nodes.find(x=>x.attrs?.class==='tutor-handoff-packet');
 assert.ok(packet.value.includes('Partial proof'));
 const reply=nodes.find(x=>x.attrs?.class==='tutor-handoff-reply');
 const parse=nodes.find(x=>x.attrs?.text==='Review pasted reply');
 const status=nodes.find(x=>x.attrs?.class==='tutor-handoff-status');
 const review=nodes.find(x=>x.attrs?.class==='tutor-handoff-review');
 reply.value=JSON.stringify({schema:'lemma.tutor_reply.v1',contract_version:1,plan_id:ID,
  checkpoint_id:checkpointId,expected_plan_revision:3,events:[{event_id:
  '00000000-0000-4000-8000-000000000002',type:'feedback',payload:{text:'Need separation'}}],
  card_proposals:[],amendment_proposal:null});
 parse.events.click();
 assert.match(status.textContent,/None recorded/);
 assert.equal(review.children.length,1);
 assert.ok(walk(review).some(x=>x.tag==='input'&&x.attrs.type==='checkbox'));
 const save=nodes.find(x=>x.attrs?.text==='Save selected study events');
 assert.ok(save.disabled,'saving must be disabled before deliberate selection');
 assert.equal(writes,0,'preview and selection cannot write or approve');
 reply.value=reply.value.replace('"expected_plan_revision":3','"expected_plan_revision":2');
 parse.events.click();
 assert.match(status.textContent,/Plan or checkpoint revision/);
 assert.equal(review.children.length,0);
 assert.equal(writes,0);
 console.log('PASS TUTOR-01 T2: sheet copy, preview, stale reply rejection, no implicit persistence');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
