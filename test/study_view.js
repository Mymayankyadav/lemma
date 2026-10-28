'use strict';
// PLAN-01 P3: hidden checkpoint UI cannot write without explicit student action.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001',P='00000000-0000-4000-8000-000000000002';
let user=A,rev=1,blocked=false,ctxRead=0,approval=0;
let answer=async({eventId})=>({eventId}),context=null;
const calls=[];
function h(tag,attrs={},...kids) {
 const obj={tag,attrs,children:[],textContent:attrs.text || '',value:'',events:{},
   isConnected:false,disabled:false,readOnly:false,
   append(...x){this.children.push(...x.filter(Boolean))},
   replaceChildren(...x){this.children=x.filter(Boolean)},
   addEventListener(k,fn){this.events[k]=fn},
   replaceWith(){},
   querySelectorAll(selector){const res=[];const walk=node=>{for(const c of node.children||[]){
     if((c.attrs?.class||'').split(' ').includes(selector.slice(1)))res.push(c);
     walk(c);
   }};walk(this);return res},
   get firstChild(){return this.children[0]},
   get lastChild(){return this.children[this.children.length-1]}
 };
 obj.append(...kids);
 return obj;
}
function walk(node){return [node,...(node?.children||[]).flatMap(walk)]}
function find(root,pred){return walk(root).find(pred)}
const study={
 async activeContext(){ctxRead++;return context},
 async recordEvent(input){calls.push(input);return answer(input)},
 async approvePlanDraft(){approval++}
};
const scope=vm.createContext({
 h,fill:(node,...kids)=>{node.replaceChildren(...kids);return node},
 StudyPlan:study,LemmaAccount:{get user(){return {id:user}}},
 App:{get workspaceRevision(){return rev},get workspaceBlocked(){return blocked},go(){}},
 crypto:webcrypto,Promise
});
vm.runInContext(fs.readFileSync('src/app/view_study.js','utf8')+
 '\nglobalThis.StudyUI=StudyView;',scope);
const ui=scope.StudyUI;
const flush=()=>new Promise(r=>setImmediate(r));
function mount(params={}){const root=ui.render(params);root.isConnected=true;return root}
function liveContext(){return {planId:P,planRevision:3,
 checkpoint:{id:'proof-1',title:'Compactness',objective:'Prove a finite subcover exists',
 status:'in_progress'},hintLevel:1,sourceRefs:['book:5'],
 lastAttempt:{payload:{text:'Choose an open cover'}},
 lastFeedback:{text:'Missing a cover argument'},
 lastEvidence:null,nextAction:{text:'Find finite refinement'}}}
(async()=>{
 assert.equal(ui.ready,false,'P3 must remain hidden until full acceptance');
 user=null;
 const noAccount=mount();await flush();
 assert.match(find(noAccount,n=>n.attrs.class==='study-message').textContent,/Sign in/);
 assert.equal(ctxRead,0,'signed-out screen cannot fetch account data');
 noAccount.isConnected=false;user=A;
 context=null;
 let root=mount();await flush();
 assert.match(find(root,n=>n.attrs.class==='study-message').textContent,/No published/);
 assert.equal(calls.length,0);

 root.isConnected=false;
 context=liveContext();
 root=mount({planId:P,checkpointId:'different'});await flush();
 assert.match(find(root,n=>n.attrs.class==='study-message').textContent,/changed/);
 assert.equal(calls.length,0,'stale routes cannot write');
 root.isConnected=false;

 root=mount({planId:P,checkpointId:'proof-1'});await flush();
 assert.match(find(root,n=>n.tag==='h2').textContent,/Compactness/);
 assert.ok(walk(root).some(n=>n.textContent==='Choose an open cover'));
 assert.ok(walk(root).some(n=>n.textContent==='Missing a cover argument'));
 assert.ok(walk(root).some(n=>n.textContent==='Find finite refinement'));
 assert.equal(calls.length,0,'reading and rendering never writes');
 const forms=walk(root).filter(n=>n.attrs.class==='study-form');
 assert.equal(forms.length,5);
 const attempt=forms[0],box=find(attempt,n=>n.tag==='textarea');
 const button=find(attempt,n=>n.tag==='button'&&n.attrs.text==='Save proof attempt');
 const resume=find(attempt,n=>n.tag==='button'&&n.attrs.text==='Continue saved proof');
 assert.ok(resume,'approved unfinished proof has an explicit resume action');
 const status=find(attempt,n=>n.attrs.class==='study-write-status');
 await resume.events.click();
 assert.equal(box.value,'Choose an open cover');
 assert.match(status.textContent,/No new event/);
 assert.equal(calls.length,0,'resuming a saved proof is read only');
 box.value='Unsubmitted new argument';
 await resume.events.click();
 assert.equal(box.value,'Unsubmitted new argument',
  'resume never overwrites work already typed');
 assert.match(status.textContent,/Unsubmitted text/);
 box.value='';
 await button.events.click();
 assert.match(status.textContent,/Enter an actual observation/);
 assert.equal(calls.length,0);

 box.value='My proof has an unfinished lemma.';
 answer=async()=>{throw new Error('network lost after commit')};
 await button.events.click();
 assert.equal(calls.length,1);
 const id=calls[0].eventId;
 assert.match(status.textContent,/Not confirmed/);
 box.value='Changed text before retry';
 await button.events.click();
 assert.equal(calls.length,1,'an ambiguous write cannot be replaced with a new ID');
 box.value='My proof has an unfinished lemma.';
 answer=async({eventId})=>({eventId});
 await button.events.click();
 assert.equal(calls.length,2);
 assert.equal(calls[1].eventId,id,'retry must retain event ID');
 assert.equal(calls[1].expectedPlanRevision,3);
 assert.equal(calls[1].checkpointId,'proof-1');
 assert.equal(calls[1].type,'attempt');
 assert.equal(calls[1].payload.text,'My proof has an unfinished lemma.');
 assert.match(status.textContent,/append-only/);
 assert.equal(box.value,'');

 const hint=forms[1],hbox=find(hint,n=>n.tag==='textarea');
 hbox.value='Consider a finite subcover';
 await find(hint,n=>n.tag==='button').events.click();
 assert.equal(calls[2].type,'hint');
 assert.equal(calls[2].payload.level,2);
 for(const [idx,type] of [[2,'feedback'],[3,'mastery_evidence'],[4,'session_note']]){
   const form=forms[idx];find(form,n=>n.tag==='textarea').value='Actual student-visible record';
   await find(form,n=>n.tag==='button').events.click();
   assert.equal(calls[calls.length-1].type,type);
 }
 assert.equal(approval,0,'recording evidence must never approve a plan');

 // An account switch while the RPC is pending must not update old UI.
 const other=mount();await flush();const oform=walk(other).find(n=>n.attrs.class==='study-form');
 const obox=find(oform,n=>n.tag==='textarea');obox.value='Old account proof';
 let finish;answer=()=>new Promise(r=>{finish=r});
 const pending=find(oform,n=>n.tag==='button').events.click();
 await flush();user='00000000-0000-4000-8000-000000000003';rev++;
 finish({eventId:calls[calls.length-1].eventId});
 await pending;
 assert.equal(find(oform,n=>n.attrs.class==='study-write-status').textContent,'Saving evidence…');
 root.isConnected=false;other.isConnected=false;
 blocked=true;
 const denied=mount();await flush();assert.equal(ctxRead>=3,true);
 assert.equal(walk(denied).filter(n=>n.attrs.class==='study-form').length,0);
 console.log('PASS PLAN-01 P3: approved-only rendering, proof resume, consent-only append events, stable retry, hint level, account guards');
})().catch(err=>{console.error(err.stack);process.exitCode=1});
