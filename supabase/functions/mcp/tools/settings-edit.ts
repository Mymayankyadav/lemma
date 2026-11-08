// N87: owner-editable settings. This allowlist is checked against the capability
// registry in tests; credential and server-managed columns cannot be patched.
import FSRS from '../../_shared/fsrs.js';
export const ownerEditableSettingsFields = [
 'desired_retention','new_per_day','reviews_per_day','learn_steps','relearn_steps',
 'rollover_hour','max_interval_days','fuzz','load_balance','learn_ahead_minutes',
 'fsrs_weights','macros','default_style','tutor_rules','mix_decks','preferred_chat',
 'connector_last_client','time_zone','master_prompt','ui','notify','week_start',
 'clock_24h','focus_defaults','planning','review_budget','attention',
] as const;
const allowed=new Set<string>(ownerEditableSettingsFields);
const sections=new Set(['ui','notify','focus_defaults','planning','review_budget','attention']);
const typed:Record<string,Record<string,string>>={
 focus_defaults:{mode:'mode',focus_minutes:'int:1:480',break_minutes:'int:1:180',
  long_break_minutes:'int:1:240',cycles:'int:1:24',flowtime_break_ratio:'ratio',
  long_session_guard_minutes:'int:30:720'},
 planning:{window_start:'time',window_end:'time',gap_minutes:'int:0:120',
  max_consecutive_minutes:'int:15:600',daily_minimum_minutes:'int:0:600',
  daily_intention:'bool'},
 review_budget:{cards:'int:0:2000',minutes:'int:0:720',reserve_in_plans:'bool'},
 attention:{drift_prompt:'bool',urge_prompt:'bool'},
};
const bad=(message:string):never=>{throw Error('Invalid owner settings edit: '+message);};
function plain(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 return prototype===Object.prototype||prototype===null;
}
function copyJson(value:unknown,depth=0):unknown{
 if(depth>20)return bad('JSON nesting too deep');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(x=>copyJson(x,depth+1));
 if(!plain(value))return bad('JSON objects and finite scalars required');
 const result:Record<string,unknown>={};
 for(const [key,part] of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(key))return bad('unsafe JSON key');
  result[key]=copyJson(part,depth+1);
 }
 return result;
}
function merged(previous:unknown,patch:unknown):Record<string,unknown>{
 if(!plain(patch))return bad('JSON section patch must be an object');
 const result=plain(previous)?copyJson(previous) as Record<string,unknown>:{};
 for(const [key,value] of Object.entries(patch)){
  if(['__proto__','constructor','prototype'].includes(key))return bad('unsafe JSON key');
  result[key]=plain(value)&&plain(result[key])?merged(result[key],value):copyJson(value);
 }
 return result;
}
function checkTyped(section:string,part:Record<string,unknown>):void{
 for(const [name,kind] of Object.entries(typed[section]||{})){
  if(!(name in part))continue;
  const value=part[name];
  if(kind.startsWith('int:')){
   const [,min,max]=kind.split(':').map(Number);
   if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)
    bad(section+'.'+name+' out of range');
  }else if(kind==='ratio'){
   if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1)
    bad(section+'.'+name+' must be a fraction in (0,1]');
  }else if(kind==='bool'){
   if(typeof value!=='boolean')bad(section+'.'+name+' must be boolean');
  }else if(kind==='time'){
   if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    bad(section+'.'+name+' must be HH:MM');
  }else if(kind==='mode'){
   if(!['pomodoro','flowtime','open'].includes(String(value)))
    bad(section+'.'+name+' invalid mode');
  }
 }
}
function integer(value:unknown,low:number,high:number,key:string):void{
 if(!Number.isSafeInteger(value)||Number(value)<low||Number(value)>high)
  bad(key+' must be an integer between '+low+' and '+high);
}
function text(value:unknown,max:number,key:string,nullable=false):void{
 if(value===null&&nullable)return;
 if(typeof value!=='string'||value.length>max)bad(key+' must be text');
}
function verify(key:string,value:unknown):unknown{
 if(key==='desired_retention'){
  if(typeof value!=='number'||!Number.isFinite(value)||value<.8||value>.97)
   bad('desired_retention outside [0.8,0.97]');
 }else if(key==='new_per_day')integer(value,0,200,key);
 else if(key==='reviews_per_day')integer(value,0,2000,key);
 else if(key==='rollover_hour')integer(value,0,23,key);
 else if(key==='max_interval_days')integer(value,1,36500,key);
 else if(key==='learn_ahead_minutes')integer(value,0,10080,key);
 else if(key==='week_start')integer(value,0,6,key);
 else if(['fuzz','load_balance','mix_decks','clock_24h'].includes(key)){
  if(typeof value!=='boolean')bad(key+' must be boolean');
 }else if(['learn_steps','relearn_steps'].includes(key)){
  text(value,100,key);
  if(!FSRS.parseSteps(value))bad(key+' must have valid positive durations');
 }else if(key==='fsrs_weights'){
  if(value===null||value==='default')return null;
  if(!Array.isArray(value)||value.length!==21||
    value.some(v=>typeof v!=='number'||!Number.isFinite(v)))
    bad('FSRS-6 requires 21 finite weights or default/null restore');
  const clipped=FSRS.clip(value as number[]);
  if(clipped.some((v:number,i:number)=>Math.abs(v-(value as number[])[i])>1e-9))
   bad('FSRS weight outside algorithm bounds');
  return [...value];
 }else if(key==='preferred_chat'){
  if(value!=='claude'&&value!=='chatgpt')bad('preferred_chat invalid');
 }else if(key==='connector_last_client'){
  if(value!==null&&!['claude','chatgpt','other'].includes(String(value)))
   bad('connector client invalid');
 }else if(key==='time_zone'){
  text(value,100,key);
  try{new Intl.DateTimeFormat('en-US',{timeZone:value as string})}
  catch{bad('Invalid IANA time zone')}
 }else if(key==='macros')text(value,16000,key);
 else if(key==='tutor_rules')text(value,5000,key,true);
 else if(key==='master_prompt')text(value,2000,key,true);
 else if(key==='default_style')text(value,100,key);
 else if(sections.has(key)){
  if(!plain(value))bad(key+' requires a JSON object');
  if(typed[key])checkTyped(key,value);
  const safe=copyJson(value);
  const max=typed[key]?4096:16000;
  if(JSON.stringify(safe).length>max)bad(key+' JSON section too large');
  return safe;
 }
 return value;
}
/** Validate a proposed authenticated MCP settings edit without mutating the row.
 * Version check is repeated in mcp_commit via expected.version to block races. */
export function prepareSettingsEdit(current:Record<string,unknown>,patch:Record<string,unknown>,
 expectedVersion?:number):Record<string,unknown>{
 if(!plain(patch)||!Object.keys(patch).length)bad('provide settings fields');
 if(expectedVersion!==undefined){
  integer(expectedVersion,1,2147483647,'expectedVersion');
  if(current.version!==expectedVersion)
   throw Error('Settings version conflict: expected '+expectedVersion+', current '+current.version);
 }
 const out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(patch)){
  if(!allowed.has(key))bad('field is not owner-editable: '+key);
  const checked=verify(key,value);
  out[key]=sections.has(key)?merged(current[key],checked):checked;
  if(sections.has(key)&&JSON.stringify(out[key]).length>(typed[key]?4096:16000))
   bad(key+' merged JSON section too large');
 }
 return out;
}

/** The same queued compare-and-swap command used by the MCP edit handler.
 * Keeping it pure makes the owner metadata and expected.version boundary
 * directly testable without importing Deno's npm: modules into Vitest. */
export function settingsEditCommand(current:Record<string,unknown>,
 patch:Record<string,unknown>,ownerId:string,expectedVersion?:number){
 const values=prepareSettingsEdit(current,patch,expectedVersion);
 // mcp_commit overwrites connector_last_client from its real p_source after
 // applying all queued edits. Never report a successful nonpersistent edit or
 // falsify audit provenance by substituting a fake connector source (#1197).
 if(Object.prototype.hasOwnProperty.call(values,'connector_last_client'))
  throw Error('connector_last_client is server-managed by mcp_commit; owner edit is blocked pending bug #1197');
 return {op:'update',table:'settings',where:{user_id:ownerId},
  ...(expectedVersion===undefined?{}:{expected:{version:expectedVersion}}),values};
}
