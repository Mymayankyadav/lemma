// N105.2: owner-only Atlas command requests. A retry after uncertain network
// delivery repeats the *exact* operationId and payload: no duplicate graph edit.
import type {SupabaseClient} from '@supabase/supabase-js';
import {LemmaError,type AtlasMutationResult,type AtlasMergePreview} from '../api';
import {checked,fail,owner} from './helpers';

export type AtlasOperation='create'|'update'|'reparent'|'link'|'unlink'|'preview_merge'|'merge';
export type AtlasEnvelope={
 schemaVersion:1;resource:'concepts';operation:AtlasOperation;
 operationId:string;target:{id?:string};patch:Record<string,unknown>;
 expectedVersion?:number
};
const uuid=(v:unknown,field:string)=>{
 if(typeof v!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))
  throw new LemmaError('invalid',field+' must be a UUID');
 return v.toLowerCase();
};
export function buildAtlasEnvelope(operation:AtlasOperation,
 id:string|null,patch:Record<string,unknown>,expectedVersion?:number,
 operationId?:string):AtlasEnvelope{
 if(operation!=='create'&&(!id||typeof id!=='string'))
  throw new LemmaError('invalid','A concept target is required');
 if(operation==='create'&&id!==null)
  throw new LemmaError('invalid','Concept create has no target ID');
 if(patch===null||typeof patch!=='object'||Array.isArray(patch))
  throw new LemmaError('invalid','Atlas patch must be an object');
 if(expectedVersion!==undefined&&(!Number.isSafeInteger(expectedVersion)||
  expectedVersion<(operation==='create'?0:1)||expectedVersion>2147483647))
  throw new LemmaError('invalid','Atlas expectedVersion must be a bounded integer');
 if(operation!=='create'&&operation!=='preview_merge'&&expectedVersion===undefined)
  throw new LemmaError('invalid','Atlas edit requires expectedVersion');
 const payload:AtlasEnvelope={schemaVersion:1,resource:'concepts',operation,
  operationId:operationId??crypto.randomUUID(),
  target:id===null?{}:{id:uuid(id,'Concept ID')},
  patch:{...patch},
  ...(expectedVersion===undefined?{}:{expectedVersion})};
 for(const k of ['subject_id','parent_id','other_id','keep_id'] as const){
  if(payload.patch[k]!==undefined&&payload.patch[k]!==null)
   payload.patch[k]=uuid(payload.patch[k],k);
 }
 return payload;
}
function retryable(error:unknown){
 const msg=error instanceof Error?error.message:
  typeof error==='object'&&error!==null&&'message'in error?String(error.message):String(error);
 return /failed to fetch|networkerror|network request failed|connection closed|timeout|gateway|502|503|504/i.test(msg);
}
async function dispatch(db:SupabaseClient,p:AtlasEnvelope):Promise<unknown>{
 await owner(db);
 let last:unknown;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await db.rpc('concepts_command',{p});
   if(!response.error)return checked(response);
   last=response.error;
   if(!retryable(last)||attempt===1) return fail(last);
  }catch(error){
   last=error;
   if(!retryable(error)||attempt===1) return fail(error);
  }
 }
 return fail(last);
}
export async function runAtlasMutation(db:SupabaseClient,p:AtlasEnvelope):Promise<AtlasMutationResult>{
 const raw=await dispatch(db,p) as Record<string,unknown>;
 if(raw?.status==='conflict')
  throw new LemmaError('conflict',String(raw.reason??'Atlas concept version changed'));
 const concept=raw?.concept as {id?:string;version?:number;name?:string;slug?:string}|undefined;
 if(raw?.status!=='ok'||!concept?.id||typeof concept.version!=='number'||
  !Number.isSafeInteger(concept.version)||typeof raw.actionNo!=='number'||
  !Number.isSafeInteger(raw.actionNo)||raw.actionNo<1)
  throw new LemmaError('server','Atlas command returned no audited owner change');
 return raw as unknown as AtlasMutationResult;
}
export async function runAtlasPreview(db:SupabaseClient,p:AtlasEnvelope):Promise<AtlasMergePreview>{
 const raw=await dispatch(db,p) as Record<string,unknown>;
 if(raw?.status!=='ok'||raw.actionNo!==null||
  (typeof raw.sourceVersion!=='number'||!Number.isSafeInteger(raw.sourceVersion))||
  (typeof raw.keepVersion!=='number'||!Number.isSafeInteger(raw.keepVersion))||
  !raw.impact||typeof raw.impact!=='object')
  throw new LemmaError('server','Atlas merge preview was unavailable');
 return raw as unknown as AtlasMergePreview;
}
