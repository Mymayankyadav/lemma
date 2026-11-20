import type { AgendaResponse } from './agenda.ts';
type AgendaAuth={verify:(bearer:string)=>Promise<string|null>;read:(owner:string)=>Promise<AgendaResponse>};
/** The browser does not send a connector credential, a user ID, a clock or proposed learning evidence. */
export async function browserAgenda(req:Request,auth:AgendaAuth,cors:Record<string,string>):Promise<Response>{
  const headers={...cors,'Cache-Control':'private, no-store'};
  if(req.method!=='POST')return new Response(null,{status:405,headers});
  if(new URL(req.url).search)return new Response(null,{status:400,headers});
  const bearer=req.headers.get('Authorization')??'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/i.test(bearer))return new Response(null,{status:401,headers});
  try {
    // Some gateways represent a bodyless POST as an empty stream. Reject data at its first byte.
    if(req.body){
      const reader=req.body.getReader();
      try {
        for(;;){const first=await reader.read();if(first.done)break;
          if(first.value.byteLength){await reader.cancel();return new Response(null,{status:400,headers});}}
      }finally{reader.releaseLock();}
    }
    const id=await auth.verify(bearer.slice(7));
    if(!id)return new Response(null,{status:401,headers});
    return Response.json(await auth.read(id),{headers});
  }catch{return Response.json({error:'Agenda temporarily unavailable'},{status:503,headers});}
}
