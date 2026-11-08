// N103: verify the caller JWT, then use service credentials server-side only.
// Storage removal MUST use the Storage API, never DELETE storage.objects SQL.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';

const CONFIRM='DELETE MY ACCOUNT';
const headers={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin',
};
const error=(status:number,message:string)=>Response.json({error:message},
 {status,headers});
function safeName(value:string):boolean{
 return !!value&&value!=='.'&&value!=='..'&&!value.includes('/')&&
  !value.includes('\\')&&!value.includes('\u0000');
}
/** Only paths beneath an exact Auth UUID prefix; no caller-supplied folder. */
async function purgeOwnerStorage(admin:ReturnType<typeof createClient>,owner:string){
 const buckets=await admin.storage.listBuckets();
 if(buckets.error||!buckets.data)throw Error('Cannot list Storage buckets');
 let requests=0;
 for(const bucket of buckets.data){
  const storage=admin.storage.from(bucket.id);
  const folders=[owner];
  while(folders.length){
   const parent=folders.pop()!;
   const entries:{id:string|null;name:string}[]=[];
   for(let offset=0;;offset+=100){
    if(++requests>1500)throw Error('Storage cleanup exceeded bounded listing');
    const result=await storage.list(parent,{limit:100,offset,
     sortBy:{column:'name',order:'asc'}});
    if(result.error||!result.data)throw Error('Owner Storage listing failed');
    for(const item of result.data){
     if(!safeName(item.name))throw Error('Invalid owner Storage path');
     entries.push({id:item.id,name:item.name});
    }
    if(result.data.length<100)break;
   }
   const paths=entries.filter(x=>x.id!==null)
    .map(x=>parent+'/'+x.name);
   for(let i=0;i<paths.length;i+=100){
    const removed=await storage.remove(paths.slice(i,i+100));
    if(removed.error)throw Error('Owner Storage cleanup failed');
   }
   for(const folder of entries.filter(x=>x.id===null))
    folders.push(parent+'/'+folder.name);
  }
 }
}
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return error(405,'Method not allowed');
 const bearer=request.headers.get('Authorization')??'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/i.test(bearer))
  return error(401,'Sign in required');
 let body:unknown;
 try{body=await request.json()}catch{return error(400,'Invalid confirmation')}
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).sort().join(',')!=='confirmation,exportAcknowledged'||
  (body as Record<string,unknown>).confirmation!==CONFIRM||
  (body as Record<string,unknown>).exportAcknowledged!==true)
  return error(400,'Typed confirmation and export acknowledgment required');
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return error(503,'Account deletion temporarily unavailable');
 const admin=createClient(url,secret,{auth:{persistSession:false,
  autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  // No user ID in request body. This verified user is the ONLY deletion target.
  const token=bearer.slice(7);
  const identity=await admin.auth.getUser(token);
  if(identity.error||!identity.data.user)
   return error(401,'Sign in required');
  const userId=identity.data.user.id;
  const started=await admin.rpc('lemma_begin_account_delete',{p_owner:userId});
  if(started.error)throw Error('Deletion request could not be secured');
  await purgeOwnerStorage(admin,userId);
  // Auth FKs include non-cascading audit rows. Remove only this owner's
  // records while the deletion marker still prevents new Storage writes.
  // A write that was already in flight when the marker committed can land
  // after the purge and block the Auth FK. New writes are refused by the
  // marker, so purge again and retry Auth deletion a bounded number of times.
  let deletedAuth=false;
  for(let attempt=0;attempt<3&&!deletedAuth;attempt++){
   const cleanup=await admin.rpc('lemma_purge_account_rows',{p_owner:userId});
   if(cleanup.error||cleanup.data?.status!=='purged')
    throw Error('Owner database cleanup did not complete');
   const deleted=await admin.auth.admin.deleteUser(userId,false);
   deletedAuth=!deleted.error;
  }
  if(!deletedAuth)throw Error('Auth deletion failed');
  return Response.json({deleted:true},{headers});
 }catch{
  // Partial Storage cleanup is retryable. Never claim that an account was
  // deleted until its Auth user was removed successfully.
  return error(503,'Account deletion could not complete; try again or contact support');
 }
});
