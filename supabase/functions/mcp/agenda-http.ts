import type { AgendaResponse, PracticeDelivery } from './agenda.ts';
import {PracticeScoreRejectedError,validPracticeScore,validPracticeScoreRejection,type PracticeScoreRequest,type PracticeScoreReceipt} from '../_shared/practice/delivery.ts';
type AgendaAuth={verify:(bearer:string)=>Promise<string|null>;read:(owner:string)=>Promise<AgendaResponse|PracticeDelivery>};
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

/** Explicit scores are a separate authenticated write, never accepted on the read-only agenda route. */
export async function browserPracticeResult(req:Request,auth:{verify:AgendaAuth['verify'];
  record:(owner:string,request:PracticeScoreRequest)=>Promise<PracticeScoreReceipt>},cors:Record<string,string>):Promise<Response>{
  const headers={...cors,'Cache-Control':'private, no-store'};
  if(req.method!=='POST')return new Response(null,{status:405,headers});
  if(new URL(req.url).search)return new Response(null,{status:400,headers});
  const bearer=req.headers.get('Authorization')??'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/i.test(bearer))return new Response(null,{status:401,headers});
  let value:unknown;
  try{
    const reader=req.body?.getReader();
    if(!reader)return new Response(null,{status:400,headers});
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>2048){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(next.value);}}
    finally{reader.releaseLock();}
    const body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.byteLength;}
    value=JSON.parse(new TextDecoder().decode(body));
  }catch{return new Response(null,{status:400,headers});}
  if(!validPracticeScore(value)||req.headers.get('Idempotency-Key')!==value.operationId)
    return new Response(null,{status:400,headers});
  try{
    const owner=await auth.verify(bearer.slice(7));
    if(!owner)return new Response(null,{status:401,headers});
    return Response.json(await auth.record(owner,value),{headers});
  }catch(error){
    if(error instanceof PracticeScoreRejectedError&&validPracticeScoreRejection(error.rejection)&&value.outcome.sessionId&&
      error.rejection.operationId===value.operationId&&error.rejection.requestId===value.requestId)
      return Response.json(error.rejection,{status:409,headers});
    return Response.json({error:'The saved result could not be confirmed. Retry the same result.'},{status:503,headers});
  }
}
