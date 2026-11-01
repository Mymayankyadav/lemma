import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { admin } from './db.ts';
import { createMcpHandler } from './deps.ts';
import { buildServer } from './server.ts';
import { selftest } from './selftest.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS,DELETE','Access-Control-Expose-Headers':'Mcp-Session-Id','Vary':'Origin'};
const cache=new Map<string,{userId:string;until:number}>();
function equal(a:string,b:string):boolean{
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
  return diff===0;
}
async function owner(secret:string):Promise<string|null>{
  const now=Date.now(),cached=cache.get(secret);
  if(cached&&cached.until>now)return cached.userId;
  const db=admin();
  // Pre-authentication lookup is necessarily unscoped; after this every request uses user_id.
  // Do not use an indexed equality timing oracle for secrets.
  const {data,error}=await db.from('settings').select('user_id,connector_secret').limit(100);
  if(error)throw new Error('Owner lookup failed');
  const match=(data||[]).find((s:any)=>equal(s.connector_secret,secret));
  if(!match)return null;
  cache.set(secret,{userId:match.user_id,until:now+60000});
  return match.user_id;
}
Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const path=new URL(req.url).pathname.split('/');
  const i=path.indexOf('mcp');
  const secret=i>=0?path[i+1]:null;
  if(!secret||!(/^[0-9a-f]{48}$/i.test(secret)))return new Response(null,{status:404,headers:cors});
  try{
    const userId=await owner(secret);
    if(!userId)return new Response(null,{status:404,headers:cors});
    const c={db:admin(),userId};
    if(path[i+2]==='selftest'&&path.length===i+3){
      if(req.method!=='GET')return new Response(null,{status:405,headers:cors});
      const q=new URL(req.url).searchParams.get('part');
      const result=await selftest(c,q==='1'?1:q==='2'?2:q==='3'?3:'all');
      return Response.json(result,{status:result.ok?200:500,headers:cors});
    }
    if(path.length!==i+2)return new Response(null,{status:404,headers:cors});
    const handler=createMcpHandler(()=>buildServer(c));
    const response=await handler.fetch(req);
    const headers=new Headers(response.headers);
    for(const [k,v] of Object.entries(cors))headers.set(k,v);
    return new Response(response.body,{status:response.status,headers});
  }catch{
    // Never echo credentials or internal connection errors to unauthenticated callers.
    return Response.json({error:'Connector temporarily unavailable'},{status:503,headers:cors});
  }
});