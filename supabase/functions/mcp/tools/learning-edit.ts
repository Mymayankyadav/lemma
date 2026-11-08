// N88: all learning-field edits use the existing audited mcp_commit batch.
// The DB performs a second, atomic version check through command.expected.
export const projectEditFields = [
 'target_date','target_label','title','slug','goal','style','status',
 'subject','subject_id','prompt','pinned',
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
