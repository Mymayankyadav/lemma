// N105.2: tab-local graph commands with the same owner, version, cycle and
// explicit merge-preview boundaries as the audited N105.1 server command.
import {LemmaError,type AtlasConceptPatch,type AtlasLinkKind,
 type AtlasMergeImpact,type AtlasMergePreview,type AtlasMutationResult,
 type NewAtlasConcept} from '../api';
import type {DemoConcept,DemoStore} from './model';

type Versioned=DemoConcept&{version?:number};
const fail=(code:'invalid'|'not_found'|'conflict',message:string):never=>{
 throw new LemmaError(code,message);
};
export function demoConceptVersion(c:DemoConcept):number{
 const v=(c as Versioned).version;
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:1;
}
const bump=(c:DemoConcept)=>{(c as Versioned).version=demoConceptVersion(c)+1;};
const find=(data:DemoStore,id:string):DemoConcept=>{
 const concept=data.concepts.find(c=>c.id===id);
 if(!concept) return fail('not_found','Owner concept not found');
 return concept;
};
const check=(c:DemoConcept,expected:number)=>{
 if(!Number.isSafeInteger(expected)||expected<1)
  fail('invalid','Positive expected concept version required');
 if(demoConceptVersion(c)!==expected)
  fail('conflict','Atlas concept version changed');
};
const text=(value:unknown,max:number,field:string)=>{
 if(typeof value!=='string'||value.length<1||value.length>max||
  (field==='name'&&!value.trim()))
  fail('invalid','Invalid concept '+field);
};
const id=(v:unknown)=>{
 if(typeof v!=='string'||!v)fail('invalid','Missing concept ID');
 return v as string;
};
const result=(c:DemoConcept,extra:Partial<AtlasMutationResult>={}):AtlasMutationResult=>({
 status:'ok',actionNo:null,
 changed:[{resource:'concepts',id:c.id,version:demoConceptVersion(c)}],
 concept:{id:c.id,name:c.name,slug:c.slug,version:demoConceptVersion(c)},...extra,
});
const parent=(data:DemoStore,source:DemoConcept,newParent:string|null)=>{
 if(newParent===null)return;
 const target=find(data,newParent);
 if(target.subjectId!==source.subjectId)fail('invalid','Parent must be in same subject');
 const seen=new Set<string>();
 let next:DemoConcept|undefined=target;
 while(next){
  if(next.id===source.id)fail('conflict','Atlas parent cycle refused');
  if(seen.has(next.id))fail('conflict','Existing Atlas parent cycle');
  seen.add(next.id);
  next=next.parentId?find(data,next.parentId):undefined;
 }
};
function cycle(links:DemoStore['links'],from:string,to:string){
 const pending=[to],visited=new Set<string>();
 while(pending.length){
  const cur=pending.pop()!;
  if(cur===from)return true;
  if(visited.has(cur))continue;
  visited.add(cur);
  for(const link of links)if(link.kind==='prereq'&&link.fromId===cur)
   pending.push(link.toId);
 }
 return false;
}
export function createDemoConcept(data:DemoStore,input:NewAtlasConcept):AtlasMutationResult{
 if(!input||typeof input!=='object'||Array.isArray(input))
  fail('invalid','New concept input required');
 const keys=Object.keys(input);
 if(keys.some(k=>!['subjectId','name','blurb','parentId','slug'].includes(k)))
  fail('invalid','Unknown concept create field');
 const subjectId=id(input.subjectId);
 if(!data.subjects.some(s=>s.id===subjectId))
  fail('not_found','Subject not found');
 text(input.name,60,'name');
 if(input.blurb!==undefined&&input.blurb!==null&&
  (typeof input.blurb!=='string'||input.blurb.length>200))
  fail('invalid','Invalid concept blurb');
 const slug=input.slug??input.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  fail('invalid','Concept slug must use lowercase letters, numbers and dashes');
 if(data.concepts.some(c=>c.subjectId===subjectId&&c.slug===slug))
  fail('conflict','A concept with this slug already exists in the subject');
 const nextId=globalThis.crypto?.randomUUID?.()??('demo-concept-'+String(Date.now()));
 const c:DemoConcept={id:nextId,slug,name:input.name,blurb:input.blurb??null,
  subjectId,topic:null,level:'planet',parentId:input.parentId??null,
  isStar:false,pinX:null,pinY:null};
 // The new UUID cannot yet be resolved from the collection.
 if(c.parentId){
  const possible=find(data,c.parentId);
  if(possible.subjectId!==subjectId)fail('invalid','Parent must be in same subject');
 }
 (c as Versioned).version=1;
 data.concepts.push(c);
 return result(c);
}
export function updateDemoConcept(data:DemoStore,conceptId:string,
 expected:number,patch:AtlasConceptPatch):AtlasMutationResult{
 const c=find(data,id(conceptId));check(c,expected);
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||
  Object.keys(patch).length===0||
  Object.keys(patch).some(k=>!['name','blurb'].includes(k)))
  fail('invalid','Update accepts name or blurb');
 if(patch.name!==undefined)text(patch.name,60,'name');
 if(patch.blurb!==undefined&&patch.blurb!==null&&
  (typeof patch.blurb!=='string'||patch.blurb.length>200))
  fail('invalid','Invalid blurb');
 if(patch.name!==undefined)c.name=patch.name;
 if(patch.blurb!==undefined)c.blurb=patch.blurb;
 bump(c);return result(c);
}
export function reparentDemoConcept(data:DemoStore,conceptId:string,expected:number,
 parentId:string|null):AtlasMutationResult{
 const c=find(data,id(conceptId));check(c,expected);
 if(parentId!==null)id(parentId);
 parent(data,c,parentId);
 c.parentId=parentId;bump(c);return result(c);
}
export function editDemoLink(data:DemoStore,op:'link'|'unlink',conceptId:string,
 expected:number,otherId:string,kind:AtlasLinkKind):AtlasMutationResult{
 const c=find(data,id(conceptId));check(c,expected);find(data,id(otherId));
 if(!['prereq','related'].includes(kind))fail('invalid','Invalid link kind');
 if(c.id===otherId)fail('invalid','A concept cannot link to itself');
 const exists=data.links.findIndex(x=>x.fromId===c.id&&x.toId===otherId);
 if(op==='link'){
  if(exists>=0)fail('conflict','Atlas graph link already exists');
  if(kind==='prereq'&&cycle(data.links,c.id,otherId))
   fail('conflict','Atlas prerequisite dependency cycle refused');
  data.links.push({fromId:c.id,toId:otherId,kind});
 }else{
  if(exists<0||data.links[exists].kind!==kind)
   fail('not_found','Atlas link not found');
  data.links.splice(exists,1);
 }
 bump(c);return result(c);
}
function impact(data:DemoStore,sourceId:string):AtlasMergeImpact{
 return {
  childConcepts:data.concepts.filter(c=>c.parentId===sourceId).length,
  incomingPrerequisites:data.links.filter(x=>x.kind==='prereq'&&x.toId===sourceId).length,
  outgoingPrerequisites:data.links.filter(x=>x.kind==='prereq'&&x.fromId===sourceId).length,
  relatedConcepts:data.links.filter(x=>x.kind==='related'&&
   (x.fromId===sourceId||x.toId===sourceId)).length,
  notesAndCards:data.notes.filter(n=>n.conceptId===sourceId).length,
  checkpointRefs:data.checkpoints.filter(cp=>cp.conceptIds.includes(sourceId)).length,
 };
}
export function previewDemoConceptMerge(data:DemoStore,sourceId:string,
 keepId:string):AtlasMergePreview{
 const source=find(data,id(sourceId)),keep=find(data,id(keepId));
 if(source.id===keep.id)fail('invalid','Merge requires a different kept concept');
 if(source.subjectId!==keep.subjectId)fail('invalid','Cannot merge concepts from different subjects');
 return {status:'ok',actionNo:null,changed:[],sourceVersion:demoConceptVersion(source),
  keepVersion:demoConceptVersion(keep),impact:impact(data,sourceId)};
}
export function mergeDemoConcept(data:DemoStore,sourceId:string,expected:number,
 keepId:string,keepVersion:number):AtlasMutationResult{
 const preview=previewDemoConceptMerge(data,sourceId,keepId);
 const source=find(data,sourceId),keep=find(data,keepId);
 check(source,expected);check(keep,keepVersion);
 const links=data.links.map(x=>({
  fromId:x.fromId===sourceId?keepId:x.fromId,
  toId:x.toId===sourceId?keepId:x.toId,kind:x.kind,
 })).filter(x=>x.fromId!==x.toId);
 const dedup=new Map<string,DemoStore['links'][number]>();
 for(const link of links){
  const key=link.fromId+':'+link.toId;
  if(!dedup.has(key))dedup.set(key,link);
 }
 const rewritten=[...dedup.values()];
 for(const link of rewritten)if(link.kind==='prereq'&&
  cycle(rewritten.filter(x=>x!==link),link.fromId,link.toId))
  fail('conflict','Atlas merge would create a prerequisite cycle');
 // Handle the case that the kept node is a direct child of the deleted one.
 if(keep.parentId===sourceId)keep.parentId=source.parentId===keepId?null:source.parentId;
 for(const c of data.concepts)if(c.parentId===sourceId&&c.id!==keepId){
  c.parentId=keepId;bump(c);
 }
 for(const cp of data.checkpoints)if(cp.conceptIds.includes(sourceId))
  cp.conceptIds=[...new Set(cp.conceptIds.map(x=>x===sourceId?keepId:x))];
 for(const note of data.notes)if(note.conceptId===sourceId)note.conceptId=keepId;
 for(const m of data.misconceptions)if(m.conceptId===sourceId)m.conceptId=keepId;
 // Validate the final parent tree, not just prerequisite edges.
 for(const c of data.concepts)if(c.id!==sourceId)parent(data,c,c.parentId??null);
 data.links=rewritten;
 data.concepts=data.concepts.filter(c=>c.id!==sourceId);
 bump(keep);
 return result(keep,{impact:preview.impact,mergedId:sourceId});
}
