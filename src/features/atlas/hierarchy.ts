import type {AtlasGraph} from '../../data/types';

export type AtlasConcept = AtlasGraph['concepts'][number];
export interface AtlasTopicGroup {name:string; concepts:AtlasConcept[]; demonstrated:number; active:number}
export interface AtlasSubjectGroup {id:string; name:string; glyph:string; topics:AtlasTopicGroup[]; total:number; demonstrated:number}

/** Build one deterministic hierarchy from the same owner-filtered graph used by Orbits. */
export function atlasHierarchy(graph:AtlasGraph):AtlasSubjectGroup[] {
 const bySubject=new Map(graph.subjects.map(s=>[s.id,new Map<string,AtlasConcept[]>()]));
 for(const concept of graph.concepts) {
  const topics=bySubject.get(concept.subjectId);
  if(!topics)continue;
  const name=concept.topic?.trim()||'General';
  if(!topics.has(name))topics.set(name,[]);
  topics.get(name)!.push(concept);
 }
 return [...graph.subjects].sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name)).map(subject=>{
  const topics=[...(bySubject.get(subject.id)?.entries()??[])].map(([name,concepts])=>{
   const sorted=[...concepts].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
   return {name,concepts:sorted,demonstrated:sorted.filter(c=>c.status==='demonstrated').length,
    active:sorted.filter(c=>c.status==='in_progress'||c.status==='revisit').length};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  return {id:subject.id,name:subject.name,glyph:subject.glyph,topics,
   total:topics.reduce((sum,t)=>sum+t.concepts.length,0),
   demonstrated:topics.reduce((sum,t)=>sum+t.demonstrated,0)};
 }).filter(subject=>subject.total>0);
}
