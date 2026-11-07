// N37: service-side capability discovery inside the existing get tool.
// This contains ONLY schema metadata. Owner rows are never fetched here.
import type {Context} from '../db.ts';

const RESOURCE=/^[a-z][a-z0-9_]{0,60}$/;
const safeStrings=(v:unknown):string[]=>
 Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&
   RESOURCE.test(x)).slice(0,100):[];
export async function registeredResources(c:Context):Promise<string>{
 if(!c.userId)throw Error('Authenticated owner required');
 const {data,error}=await c.db.from('lemma_command_resources')
  .select('resource,mcp_ok,schema').eq('mcp_ok',true)
  .order('resource',{ascending:true}).limit(100);
 if(error)throw Error(error.message);
 if(!Array.isArray(data))throw Error('Invalid registered resource inventory');
 const resources=data.map((row:Record<string,unknown>)=>{
  if(!RESOURCE.test(String(row.resource))||row.mcp_ok!==true)
   throw Error('Malformed registered resource metadata');
  let value=row.schema;
  if(typeof value==='string'){
   try{value=JSON.parse(value)}catch{throw Error('Malformed resource schema')}
  }
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw Error('Malformed resource schema');
  const shape=value as Record<string,unknown>;
  return {resource:row.resource,operations:safeStrings(shape.operations),
   fields:safeStrings(shape.fields)};
 });
 return JSON.stringify({resources});
}
