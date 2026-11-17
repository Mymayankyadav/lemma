// N88: all learning-field edits use the existing audited mcp_commit batch.
// The DB performs a second, atomic version check through command.expected.
export const projectEditFields = [
 'target_date','target_label','title','slug','goal','style','status',
 'subject','subject_id','prompt','pinned',
 'deadline_at','last_study_on','time_confirmed','share_weight','auto_prune_standard',
 'learning_profile','learning_profile_approved',
] as const;
export const learningEditTables = [
 'projects','subjects','styles','concepts','sources',
] as const;
export type LearningEditTable = typeof learningEditTables[number];
export const isLearningEditTable = (value:string):value is LearningEditTable =>
 (learningEditTables as readonly string[]).includes(value);

export function validateProjectEditPatch(patch:Record<string,unknown>):void{
 if('status' in patch &&
  !['planning','active','paused','done','archived'].includes(String(patch.status)))
  throw Error('Project status must be planning, active, paused, done or archived');
 if('pinned' in patch && typeof patch.pinned!=='boolean')
  throw Error('Project pinned must be boolean');
 if('slug' in patch &&
  (typeof patch.slug!=='string'||!(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(patch.slug))||
    patch.slug.length<2||patch.slug.length>40))
  throw Error('Project slug must be 2–40 lowercase slug characters');
 if('deadline_at' in patch&&patch.deadline_at!==null&&(typeof patch.deadline_at!=='string'||Number.isNaN(Date.parse(patch.deadline_at))||!/[zZ]|[+-]\d{2}:\d{2}$/.test(patch.deadline_at)))
  throw Error('Project deadline_at must be an ISO instant with a time zone, or null');
 if('last_study_on' in patch&&patch.last_study_on!==null&&(typeof patch.last_study_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(patch.last_study_on)||Number.isNaN(Date.parse(patch.last_study_on))))
  throw Error('Project last_study_on must be YYYY-MM-DD or null');
 for(const k of ['time_confirmed','auto_prune_standard'])if(k in patch&&typeof patch[k]!=='boolean')throw Error('Project '+k+' must be boolean');
 if('share_weight' in patch&&patch.share_weight!==null&&(typeof patch.share_weight!=='number'||!Number.isFinite(patch.share_weight)||patch.share_weight<=0))
  throw Error('Project share_weight must be a positive number or null');
 if('learning_profile' in patch&&patch.learning_profile!==null){
  const lp=patch.learning_profile as Record<string,unknown>,modes=['prove','solve','compute','recall','explain','read','construct'];
  if(!lp||typeof lp!=='object'||Array.isArray(lp)||Object.keys(lp).some(k=>!modes.includes(k))||Object.values(lp).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))
   throw Error('Project learning_profile must map '+modes.join(', ')+' to weights ≥ 0, or be null');
  const tot=Object.values(lp).reduce((a:number,b:unknown)=>a+Number(b),0);
  if(tot<0.99||tot>1.01)throw Error('Project learning_profile weights must sum to 1');
 }
 if('learning_profile_approved' in patch&&typeof patch.learning_profile_approved!=='boolean')throw Error('Project learning_profile_approved must be boolean');
 if('subject' in patch && 'subject_id' in patch)
  throw Error('Choose subject or subject_id, not both');
}
export function learningEditCommand(
 table:LearningEditTable,current:Record<string,unknown>,
 patch:Record<string,unknown>,ownerId:string,expectedVersion?:number,
){
 if(!ownerId||current.user_id!==ownerId)throw Error('Owner-scoped learning record required');
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)
  throw Error('Learning edit needs fields');
 if(table==='projects')validateProjectEditPatch(patch);
 if(expectedVersion!==undefined){
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
   expectedVersion>2147483647)throw Error('Invalid expectedVersion');
  if(current.version!==expectedVersion)
   throw Error('Learning record version conflict: expected '+expectedVersion+', current '+current.version);
 }
 const where=table==='styles'?{user_id:ownerId,key:current.key}:{id:current.id};
 if(Object.values(where).some(x=>typeof x!=='string'||!x))
  throw Error('Missing learning record key');
 return {op:'update' as const,table,where,
  ...(expectedVersion===undefined?{}:{expected:{version:expectedVersion}}),
  values:{...patch}};
}
