'use strict';
// Synthetic readiness/consent gate; this is not real cross-model acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const owner='00000000-0000-4000-8000-000000000001';
const planId='00000000-0000-4000-8000-000000000002';
let user=owner,workspace=1,blocked=false,failWrite=false;
const opens=[],writes=[];
const tutor={ready:false,async open(value){opens.push(value)}};
const state={planId,planRevision:2,checkpoint:{id:'proof-7',title:'Proof',
 objective:'Prove a lemma',status:'in_progress'},hintLevel:1,sourceRefs:[]};
const study={async activeContext(){return state},async recordEvent(value){
 writes.push(value);if(failWrite)throw Error('lost response');return {eventId:value.eventId};}};
function h(tag,attrs={},...kids){
 const node={tag,attrs,children:[],textContent:attrs.text||'',value:'',events:{},
  isConnected:false,disabled:false,readOnly:false,
  append(...x){this.children.push(...x.filter(Boolean))},
  replaceChildren(...x){this.children=x.filter(Boolean)},
  addEventListener(name,fn){this.events[name]=fn},
  querySelectorAll(selector){return walk(this).slice(1).filter(n=>
   selector.startsWith('.')?(n.attrs?.class||'').split(' ').includes(selector.slice(1)):n.tag===selector)},
  get firstChild(){return this.children[0]},get lastChild(){return this.children.at(-1)}};
 node.append(...kids);return node;
}
function walk(n){return [n,...(n?.children||[]).flatMap(walk)]}
const find=(n,p)=>walk(n).find(p);
const scope=vm.createContext({h,fill:(n,...kids)=>{n.replaceChildren(...kids);return n},
 StudyPlan:study,TutorHandoff:tutor,LemmaAccount:{get user(){return user?{id:user}:null}},
 App:{get workspaceRevision(){return workspace},get workspaceBlocked(){return blocked},go(){}},crypto:webcrypto,Promise});
vm.runInContext(fs.readFileSync('src/app/view_study.js','utf8')+'\nglobalThis.view=StudyView;',scope);
const flush=()=>new Promise(r=>setImmediate(r));
async function mount(){const root=scope.view.render({planId,checkpointId:'proof-7'});root.isConnected=true;await flush();return root;}
const entry=root=>find(root,n=>n.tag==='button'&&n.attrs.text==='Open tutor handoff');
(async()=>{
 let root=await mount();assert.equal(entry(root),undefined,'unready tutor remains hidden');root.isConnected=false;
 tutor.ready=true;root=await mount();let button=entry(root);assert.ok(button);
 await button.events.click();assert.equal(opens.length,1);
 assert.equal(opens[0].planId,planId);assert.equal(opens[0].checkpointId,'proof-7');
 assert.equal(writes.length,0,'opening never records evidence');
 const form=find(root,n=>n.attrs.class==='study-form');
 const input=find(form,n=>n.tag==='textarea');const save=find(form,n=>n.attrs.text==='Save proof attempt');
 input.value='Unsaved proof';await button.events.click();assert.equal(opens.length,1,'typed proof blocks handoff');
 failWrite=true;await save.events.click();input.value='';await button.events.click();
 assert.equal(opens.length,1,'unconfirmed event blocks handoff even after clearing input');
 input.value='Unsaved proof';failWrite=false;await save.events.click();
 await button.events.click();assert.equal(opens.length,2,'confirmed evidence allows handoff');
 tutor.ready=false;await button.events.click();assert.equal(opens.length,2,'readiness is checked again');
 tutor.ready=true;user='00000000-0000-4000-8000-000000000003';workspace++;
 await button.events.click();assert.equal(opens.length,2,'owner/workspace changes invalidate entry');
 console.log('PASS PLAN-01 gated tutor entry: hidden, explicit selection, no write, dirty/unconfirmed and identity guards');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
