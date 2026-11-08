// N105.2: client contract for the owner-authenticated Atlas graph command.
import {LemmaError} from './api';
export interface AtlasConceptInput {
 subjectId:string;name:string;blurb?:string|null;parentId?:string|null;
}
export interface AtlasConceptPatch {name?:string;blurb?:string|null}
export type AtlasLinkKind='prereq'|'related';
export interface AtlasMergeImpact {
 childConcepts:number;incomingPrerequisites:number;outgoingPrerequisites:number;
 relatedConcepts:number;notesAndCards:number;checkpointRefs:number;
}
export interface AtlasEditResult {
 id:string;version:number;actionNo:number|null;mergedId?:string;
 impact?:AtlasMergeImpact;
}
export interface AtlasMergePreview {
 impact:AtlasMergeImpact;sourceVersion:number;keepVersion:number;
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function atlasId(value:string):string {
 if(typeof value!=='string'||!UUID.test(value))
  throw new LemmaError('invalid','Atlas concept ID must be a UUID');
 return value.toLowerCase();
}
export function atlasVersion(value:number):number{
 if(!Number.isSafeInteger(value)||value<1||value>2147483647)
  throw new LemmaError('invalid','Positive Atlas expectedVersion required');
 return value;
}
export function atlasName(value:string):string{
 if(typeof value!=='string'||!value.trim()||value.trim().length>160)
  throw new LemmaError('invalid','Atlas name must be 1–160 characters');
 return value.trim();
}
export function atlasInput(input:AtlasConceptInput):AtlasConceptInput{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new LemmaError('invalid','Atlas concept fields required');
 return {subjectId:atlasId(input.subjectId),name:atlasName(input.name),
  ...(input.blurb===undefined?{}:{blurb:atlasBlurb(input.blurb)}),
  ...(input.parentId===undefined?{}:{parentId:input.parentId===null?null:atlasId(input.parentId)})};
}
export function atlasBlurb(value:string|null):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||value.length>2000)
  throw new LemmaError('invalid','Atlas description must be 0–2000 characters');
 return value;
}
export function atlasPatch(input:AtlasConceptPatch):AtlasConceptPatch{
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).length===0||Object.keys(input).some(k=>k!=='name'&&k!=='blurb'))
  throw new LemmaError('invalid','Atlas update requires name or description');
 return {
  ...(input.name===undefined?{}:{name:atlasName(input.name)}),
  ...(input.blurb===undefined?{}:{blurb:atlasBlurb(input.blurb)}),
 };
}
export function atlasKind(kind:AtlasLinkKind):AtlasLinkKind{
 if(kind!=='prereq'&&kind!=='related')
  throw new LemmaError('invalid','Atlas link must be prerequisite or related');
 return kind;
}
export function atlasImpact(value:unknown):AtlasMergeImpact{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new LemmaError('server','Malformed Atlas merge impact');
 const row=value as Record<string,unknown>;
 const keys=['childConcepts','incomingPrerequisites','outgoingPrerequisites',
  'relatedConcepts','notesAndCards','checkpointRefs'] as const;
 const result={} as AtlasMergeImpact;
 for(const key of keys){
  if(typeof row[key]!=='number'||!Number.isSafeInteger(row[key])||Number(row[key])<0)
   throw new LemmaError('server','Malformed Atlas impact '+key);
  result[key]=row[key] as number;
 }
 return result;
}
