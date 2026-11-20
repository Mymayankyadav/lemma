import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { admin, adminClient } from './db.ts';
import { browserAgenda,browserPracticeResult } from './agenda-http.ts';
import { readAgenda, openPractice, recordPractice, validPracticeRequest } from './agenda.ts';
import { createMcpHandler } from './deps.ts';
import { buildServer } from './server.ts';
import { selftest } from './selftest.ts';
import { mcpCorsHeaders as cors,mcpPreflight } from './http-cors.ts';
import {serveTutor} from './tutor-profile.ts';
import {tutorConnector} from './tutor-connector.ts';

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
  if(req.method==='OPTIONS')return mcpPreflight();
  const path=new URL(req.url).pathname.split('/');
  const i=path.indexOf('mcp');
  if(i>=0&&path.length===i+2&&['agenda','practice-question','practice-result'].includes(path[i+1])){
    const verify=async (token:string)=>{const {data,error}=await adminClient().auth.getUser(token);return error?null:data.user?.id??null;};
    if(path[i+1]==='practice-result')return browserPracticeResult(req,{verify,
      record:async(userId,request)=>recordPractice({db:admin(),userId},request)},cors);
    const delivery=path[i+1]==='practice-question',requestId=req.headers.get('Idempotency-Key');
    if(delivery&&!validPracticeRequest(requestId))return new Response(null,{status:400,headers:cors});
    return browserAgenda(req,{
      verify,
      read:async userId=>delivery?openPractice({db:admin(),userId},requestId!):readAgenda({db:admin(),userId}),
    },cors);
  }
  const secret=i>=0?path[i+1]:null;
  try{
    if(secret==='tutor'&&path.length===i+2){
      const response=await serveTutor(req,admin());
      const headers=new Headers(response.headers);
      for(const [k,v] of Object.entries(cors))headers.set(k,v);
      headers.set('Cache-Control','no-store');
      return new Response(response.body,{status:response.status,headers});
    }
    if(!secret||!(/^[0-9a-f]{48}$/i.test(secret)))return new Response(null,{status:404,headers:cors});
    const userId=await owner(secret);
    if(!userId)return new Response(null,{status:404,headers:cors});
    const c={db:admin(),userId};
    if(path[i+2]==='selftest'&&path.length===i+3){
      if(req.method!=='GET')return new Response(null,{status:405,headers:cors});
      const q=new URL(req.url).searchParams.get('part');
      const result=await selftest(c,q==='1'?1:q==='2'?2:q==='3'?3:q==='4'?4:'all');
      return Response.json(result,{status:result.ok?200:500,headers:cors});
    }
    if(path.length!==i+2)return new Response(null,{status:404,headers:cors});
    const handler=createMcpHandler(()=>buildServer(c,tutorConnector(c,secret,req.signal)));
    const response=await handler.fetch(req);
    const headers=new Headers(response.headers);
    for(const [k,v] of Object.entries(cors))headers.set(k,v);
    headers.set('Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers});
  }catch{
    // Never echo credentials or internal connection errors to unauthenticated callers.
    return Response.json({error:'Connector temporarily unavailable'},{status:503,headers:cors});
  }
});
