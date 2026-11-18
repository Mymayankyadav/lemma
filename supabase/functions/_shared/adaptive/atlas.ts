// Shared read model used unchanged by MCP and React. Existing N169 assemble API stays intact.
import {replay,estimate,predict,memoryAt,type MeasurementState,type AtlasFacts,type Estimate} from './measure.ts';
import {diagnose,serve,type Health} from './fit.ts';
import {facetsFor,type Facet} from './kc.ts';
import {certification,ATLAS_DEFAULTS,frustration} from './policy.ts';
import {cardBudget} from './cards.ts';
import {durationPrior,updateDuration,predictDuration,attendancePrior,updateAttendance,supplyMoments,feasibility,testOutDuration,type Block} from './timemodel.ts';
import {rankSlots,declaredSlots,freeSlots} from './calendar.ts';
import {certificationChecks} from './recheck.ts';
import {sessionQueue,type Action} from './kg.ts';
import {reentryProbes,finalReviews,allocateProjects,type FinalReview} from './scheduler.ts';
import {bridgeStrength,type AtlasLink} from './links.ts';
import {DAY,logit,clamp} from './math.ts';
export type AtlasRows={settings:any;concepts:any[];projects:any[];checkpoints:any[];cpConcepts:any[];sessions:any[];attempts?:any[];attemptTags?:any[];instructionEvents?:any[];atlasLinks?:any[];prereqs?:any[];modelFits?:any[];items?:any[];assumptions?:any[];cards?:any[];notes?:any[];reviews?:any[];intervals?:any[];busy?:any[];studyEntries?:any[]};
export type FacetValue=Estimate&{certified:boolean;status:string};
export type AtlasReadModel={settings:typeof ATLAS_DEFAULTS;checkpoints:any[];checkpointConcepts:any[];model:MeasurementState;facets:Record<string,FacetValue[]>;health:Health[];fits:Record<string,ReturnType<typeof feasibility>>;durations:Record<string,ReturnType<typeof predictDuration>>;budget:ReturnType<typeof cardBudget>;queue:ReturnType<typeof sessionQueue>;slots:ReturnType<typeof rankSlots>;themes:{id:string;name:string;instances:string[]}[];bridges:{from:string;to:string;strength:ReturnType<typeof bridgeStrength>}[];attempts:any[];links:AtlasLink[];frustration:ReturnType<typeof frustration>;capacity:number|null;finalReviews:FinalReview[];allocation:ReturnType<typeof allocateProjects>};
export function factsForAtlas(rows:AtlasRows):AtlasFacts{
 const notes=new Map((rows.notes??[]).map(n=>[n.id,n]));
 return {concepts:rows.concepts,attempts:(rows.attempts??[]).map(a=>({...a,novelty:a.context?.novelty??a.novelty})),tags:[...(rows.attemptTags??[]),...(rows.attempts??[]).flatMap(a=>(a.tags??[]).map((t:any)=>({...t,attempt_id:a.id})))],instructions:rows.instructionEvents??[],links:rows.atlasLinks??[],items:rows.items??[],sessions:rows.sessions,assumptions:rows.assumptions??[],
  cards:(rows.cards??[]).map(c=>({...c,concept_id:c.concept_id??notes.get(c.note_id)?.concept_id})).filter(c=>c.concept_id),reviews:(rows.reviews??[]).map(r=>({...r,occurred_at:r.reviewed_at??r.occurred_at})),};
}
export function assembleAtlas(rows:AtlasRows,now:Date):AtlasReadModel{
 const st=rows.settings??{},settings={...ATLAS_DEFAULTS,...st.atlas},time=now.getTime(),facts=factsForAtlas(rows),lastFit=(rows.modelFits??[]).slice().sort((a,b)=>String(b.fitted_at).localeCompare(String(a.fitted_at)))[0],model=replay(facts,lastFit?.params??{},time),health=['attempt','card'].map(stream=>diagnose(model.trace,stream));
 const facets:Record<string,FacetValue[]>={};
 for(const c of rows.concepts)facets[c.id]=facetsFor(c.kind??'topic').map(f=>{const e=estimate(model,c.id,f,time),cert=certification(model,c.id,f,settings.threshold_p,time),last=model.trace.filter(x=>x.stream==='attempt').at(-1),h=health[0];return {...e,p:serve(e.p,last?.pfa??.5,last?.base??.5,h),certified:cert.certified,status:cert.status};});
 let duration=durationPrior();
 const durationRows=rows.checkpoints.filter(c=>c.status==='demonstrated'&&c.estimate_minutes>0&&!c.self_reported).sort((a,b)=>String(a.demonstrated_at).localeCompare(String(b.demonstrated_at))||a.id.localeCompare(b.id));
 for(const cp of durationRows){const actual=rows.sessions.filter(s=>s.checkpoint_id===cp.id).reduce((z,s)=>z+(Number(s.minutes)||0),0);if(actual>0)duration=updateDuration(duration,{estimate:cp.estimate_minutes,actual,kind:cp.kind==='milestone'?1:0});}
 let attendance=attendancePrior();
 const historical=(rows.busy??[]).filter(b=>b.kind!=='busy'&&Date.parse(b.ends_at)<time).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
 for(const block of historical){const d=new Date(block.starts_at),kept=(rows.studyEntries??[]).some(e=>e.calendar_block_id===block.id&&e.status!=='voided');attendance=updateAttendance(attendance,{weekday:d.getUTCDay(),slot:Math.floor(d.getUTCHours()/6),minutes:Math.max(1,(Date.parse(block.ends_at)-Date.parse(block.starts_at))/60000),day:Math.floor(d.getTime()/DAY)},kept);}
 const wd=st.capacity?.weekday_minutes,capacity=Array.isArray(wd)?wd[now.getUTCDay()]:(typeof wd==='number'?wd:null),needs:Record<string,number>={},fits:AtlasReadModel['fits']={},durations:AtlasReadModel['durations']={};
 for(const p of rows.projects){const cps=rows.checkpoints.filter(c=>c.project_id===p.id&&c.status!=='demonstrated'&&(!c.plan_state||c.plan_state==='active')),required:ReturnType<typeof predictDuration>[]=[],core:typeof required=[];
  for(const c of cps){const k=rows.cpConcepts.find(x=>x.checkpoint_id===c.id)?.concept_id,pt=k?predict(model,k,'use',time):0,d=testOutDuration(predictDuration(duration,{estimate:c.estimate_minutes??60,kind:c.kind==='milestone'?1:0,difficulty:k?-logit(pt):0}),pt);durations[c.id]=d;required.push(d);if(c.tier==='core')core.push(d);}
  const blocks:Block[]=(rows.busy??[]).filter(b=>b.kind!=='busy'&&b.status!=='cancelled'&&Date.parse(b.starts_at)>=time&&(!p.last_study_on||String(b.starts_at).slice(0,10)<=p.last_study_on)).map(b=>({weekday:new Date(b.starts_at).getUTCDay(),slot:Math.floor(new Date(b.starts_at).getUTCHours()/6),minutes:Math.max(0,(Date.parse(b.ends_at)-Date.parse(b.starts_at))/60000)}));
  fits[p.id]=feasibility(required,core,supplyMoments(attendance,blocks));needs[p.id]=required.reduce((z,d)=>z+d.mean,0);
 }
 const budget=cardBudget({capacity:capacity??0,reviewShare:st.capacity?.review_share??.25,reviewBudget:st.review_budget?.minutes,quotaShare:settings.card_quota_share,used7:(rows.notes??[]).filter(n=>Date.parse(n.created_at)>time-7*DAY).reduce((z,n)=>z+(n.atlas_kind==='skeleton'?3:1),0),usedToday:(rows.notes??[]).filter(n=>String(n.created_at).slice(0,10)===now.toISOString().slice(0,10)).reduce((z,n)=>z+(n.atlas_kind==='skeleton'?3:1),0)});
 const actions:Action[]=[],finalReviewList:FinalReview[]=[],today=now.toISOString().slice(0,10);
 for(const p of rows.projects){const next=rows.checkpoints.filter(c=>c.project_id===p.id&&c.status!=='demonstrated'&&(!c.plan_state||c.plan_state==='active')).sort((a,b)=>a.position-b.position)[0];if(!next)continue;
  const k=rows.cpConcepts.find(x=>x.checkpoint_id===next.id)?.concept_id;if(!k)continue;const needAt=Date.parse(p.last_study_on??now.toISOString())+12*3600000,weight=p.share_weight??(next.tier==='core'?3:2);
  if(!model.lastInstruction[k])actions.push({id:'teach:'+next.id,kind:'teach',concept_id:k,minutes:Math.min(30,next.estimate_minutes??30),p:.5,forced:true,needAt,weight});
  actions.push({id:'practice:'+k,kind:'practice',concept_id:k,minutes:10,p:predict(model,k,'use',time),needAt,weight});
  if(p.last_study_on&&model.lastInstruction[k])for(const check of certificationChecks(model,[{concept_id:k,facet:'use',teachDay:new Date(model.lastInstruction[k]).toISOString().slice(0,10),lastStudyOn:p.last_study_on}],new Date(model.lastInstruction[k]).toISOString().slice(0,10))){if(check.due<=now.toISOString().slice(0,10))actions.push({id:'check:'+k,kind:'check',concept_id:k,minutes:5,p:predict(model,k,'use',time),forced:true,needAt,weight});}
  // 10 §7: re-entry after more than three days away opens with three probes on the checkpoint's prerequisites.
  const lastSession=rows.sessions.filter(x=>x.project_id===p.id).map(x=>Date.parse(x.started_at)).filter(Number.isFinite).sort((a,b)=>b-a)[0],away=lastSession===undefined?0:Math.floor((time-lastSession)/DAY);
  const preCps=(rows.prereqs??[]).filter(e=>e.checkpoint_id===next.id).map(e=>e.prereq_id),preConcepts=[...new Set(rows.cpConcepts.filter(x=>preCps.includes(x.checkpoint_id)).map(x=>x.concept_id))].map(id=>({id,p:predict(model,id,'use',time)}));
  for(const id of reentryProbes(away,preConcepts))actions.push({id:'probe:'+id,kind:'probe',concept_id:id,minutes:5,p:predict(model,id,'use',time),forced:true,needAt,weight});
  // 10 §6: core items below 0.90 recall at the exam get one review in the final three study days; today's are forced.
  if(p.last_study_on&&p.last_study_on>=today){
   const studyDays:string[]=[];for(let d=Date.parse(today+'T00:00:00Z');d<=Date.parse(p.last_study_on+'T00:00:00Z');d+=DAY)studyDays.push(new Date(d).toISOString().slice(0,10));
   const coreIds=new Set(rows.checkpoints.filter(c=>c.project_id===p.id&&c.status!=='demonstrated'&&c.tier==='core'&&(!c.plan_state||c.plan_state==='active')).map(c=>c.id)),targets=[...new Set(rows.cpConcepts.filter(x=>coreIds.has(x.checkpoint_id)).map(x=>x.concept_id))].map(concept_id=>({concept_id,facet:'use',core:true}));
   for(const r of finalReviews(model,targets,studyDays,p.last_study_on)){finalReviewList.push(r);if(r.day===today&&!actions.some(a=>a.id==='final:'+r.concept_id))actions.push({id:'final:'+r.concept_id,kind:'check',concept_id:r.concept_id,minutes:5,p:predict(model,r.concept_id,'use',time),forced:true,needAt,weight});}
  }
 }
 for(const c of facts.cards??[]){const R=model.hypotheses.reduce((a,h,i)=>a+model.pi[i]*memoryAt(h.cards[c.id],time),0);if(R<.98)actions.push({id:'review:'+c.id,kind:'review',concept_id:c.concept_id,card_id:c.id,minutes:.5,p:R});}
 const queue=sessionQueue(model,actions,capacity??0,settings.card_cap),links=(rows.atlasLinks??[]) as AtlasLink[],themes=rows.concepts.filter(c=>c.kind==='theme').map(c=>({id:c.id,name:c.name,instances:links.filter(l=>l.kind==='instance_of'&&l.to_id===c.id&&l.status==='approved').map(l=>l.from_id)}));
 const bridges=links.filter(l=>l.kind==='instance_of'||l.kind==='analogous').map(l=>({from:l.from_id,to:l.to_id,strength:bridgeStrength(0,0)}));
 const slots=rankSlots(attendance,freeSlots(declaredSlots(time,st.time_zone??'UTC',st.planning?.window_start,st.planning?.window_end),rows.busy??[]),st.user_id??'',now.toISOString().slice(0,10));
 return {settings,checkpoints:rows.checkpoints,checkpointConcepts:rows.cpConcepts,model,facets,health,fits,durations,budget,queue,slots,themes,bridges,attempts:rows.attempts??[],links,frustration:frustration(facts.attempts),capacity,finalReviews:finalReviewList,allocation:allocateProjects(rows.projects.map(pr=>({id:pr.id,pCore:fits[pr.id]?.pCore??1,deadline:pr.last_study_on??null,weight:1,share_weight:pr.share_weight??null,needMinutes:needs[pr.id]??0})),capacity??0)};
}
export function atlasCard(view:AtlasReadModel,id:string):string{
 const c=view.model.facts.concepts.find(c=>c.id===id);if(!c)return '';
 const labels:Record<Facet,string>={recall:'Rc',understand:'Un',use:'Use',select:'Sel',execute:'Ex',recognise:'Rec',construct:'Con',transfer:'Tr',perform:'Perf'};
 const values=(view.facets[id]??[]).map(e=>e.state==='none'?labels[e.facet]+' —':labels[e.facet]+' '+(e.state==='inferred'?'~':'')+e.p.toFixed(2).replace(/^0/,'')+'('+e.lo.toFixed(2).replace(/^0/,'')+'–'+e.hi.toFixed(2).replace(/^0/,'')+')s'+e.sessions+(e.certified?'∎':''));
 const card=c.name.slice(0,45)+' ['+(c.kind??'topic')+'] '+values.join(' · ');return card.length<=300?card:card.slice(0,299)+'…';
}
