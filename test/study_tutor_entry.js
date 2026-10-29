'use strict';
// Synthetic readiness/consent gate; this is not real cross-model acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const owner='00000000-0000-4000-8000-000000000001';
const planId='00000000-0000-4000-8000-000000000002';
let user=owner,workspace=1,blocked=false,failWrite=false,online=true;
const opens=[],previewOpens=[],writes=[];
const tutor={ready:false,async open(value){opens.push(value)},
 async openForAcceptance(value){previewOpens.push(value)}};
const state={planId,planRevision:2,checkpoint:{id:'proof-7',title:'Proof',
 objective:'Prove a lemma',status:'in_progress'},hintLevel:1,sourceRefs:[]};
const study={ready:true,async activeContext(){return state},async recordEvent(value){
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
 App:{get workspaceRevision(){return workspace},get workspaceBlocked(){return blocked},go(){}},
 navigator:{get onLine(){return online}},crypto:webcrypto,Promise});
vm.runInContext(fs.readFileSync('src/app/view_study.js','utf8')+'\nglobalThis.view=StudyView;',scope);
const flush=()=>new Promise(r=>setImmediate(r));
async function mount(){const root=scope.view.render({planId,checkpointId:'proof-7'});root.isConnected=true;await flush();return root;}
const entry=root=>find(root,n=>n.tag==='button'&&n.attrs.text==='Open tutor handoff');
const preview=root=>find(root,n=>n.tag==='button'&&n.attrs.text==='Test tutor handoff (unreleased)');
(async()=>{
 let root=await mount();assert.equal(entry(root),undefined,'unready normal tutor remains hidden');
 let testButton=preview(root);assert.ok(testButton,'separate preview entry is visible only on an approved checkpoint');
 assert.match(find(root,n=>n.attrs.class==='study-acceptance-warning').textContent,/not a released tutor feature/);
 assert.equal(previewOpens.length,0,'rendering must not open a tutor or write');
 await testButton.events.click();assert.equal(previewOpens.length,1);
 assert.equal(previewOpens[0].planId,planId);
 assert.equal(previewOpens[0].checkpointId,'proof-7');
 assert.equal(writes.length,0,'preview opening is read-only');
 const previewForm=find(root,n=>n.attrs.class==='study-form');
 const previewInput=find(previewForm,n=>n.tag==='textarea');
 const previewSave=find(previewForm,n=>n.attrs.text==='Save proof attempt');
 previewInput.value='Unsaved proof';await testButton.events.click();
 assert.equal(previewOpens.length,1,'dirty proof blocks preview');
 previewInput.value='';online=false;await testButton.events.click();
 assert.equal(previewOpens.length,1,'offline state blocks preview');online=true;
 previewInput.value='Unconfirmed proof';failWrite=true;await previewSave.events.click();
 previewInput.value='';await testButton.events.click();
 assert.equal(previewOpens.length,1,'uncertain evidence blocks preview even after clearing text');
 user='00000000-0000-4000-8000-000000000003';workspace++;
 await testButton.events.click();assert.equal(previewOpens.length,1,'owner switch blocks old preview');
 root.isConnected=false;user=owner;workspace++;failWrite=false;
 study.ready=false;root=await mount();assert.equal(preview(root),undefined,'unready Study API hides preview');
 root.isConnected=false;study.ready=true;
 const previewFn=tutor.openForAcceptance;delete tutor.openForAcceptance;
 root=await mount();assert.equal(preview(root),undefined,'missing E acceptance API hides preview');
 root.isConnected=false;tutor.openForAcceptance=previewFn;
 user=null;root=await mount();assert.equal(preview(root),undefined,'signed-out view hides preview');
 root.isConnected=false;user=owner;
 tutor.ready=true;root=await mount();let button=entry(root);assert.ok(button);
 assert.equal(preview(root),undefined,'released tutor readiness suppresses test-only preview');
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
 console.log('PASS PLAN-01 tutor entry: acceptance-only preview, explicit selected checkpoint, no writes, offline/dirty/uncertain/owner guards, normal ready entry');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
