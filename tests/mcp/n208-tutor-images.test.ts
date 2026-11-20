import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tutorConnector} from '../../supabase/functions/mcp/tutor-connector.ts';
import {TUTOR_IMAGE_LIMIT,tutorImageBlock} from '../../supabase/functions/mcp/tutor-images.ts';

Deno.test('authorized image reads use typed MCP content, and invalid grants do not access storage',async()=>{
  const owner=randomUUID(),turn=randomUUID(),grant=randomUUID(),id=randomUUID(),handoff=turn+'.'+grant;
  const png=new Blob([Uint8Array.of(137,80,78,71,13,10,26,10)],{type:'image/png'});
  let allowed=true,downloads=0;
  const row={id,kind:'drawing',mime_type:'image/png',byte_size:png.size};
  const list={
    select:()=>list,eq:()=>list,order:()=>list,limit:()=>list,
    then:(resolve:(result:{data:typeof row[];error:null})=>unknown)=>Promise.resolve(resolve({data:[row],error:null})),
  };
  const connector=tutorConnector({userId:owner,db:{
    rpc:async()=>allowed?{data:{status:'pending',hasAttachments:true,snapshot:{question:'Image attached.'}},error:null}
      :{data:null,error:{message:'Unavailable'}},
    from:table=>{assert.equal(table,'tutor_turn_attachments');return list;},
    storage:{from:bucket=>{
      assert.equal(bucket,'tutor-ink');
      return {download:async path=>{assert.equal(path,owner+'/'+id);downloads++;return {data:png,error:null};}};
    }},
  }},'a'.repeat(48));
  const content=await connector.content(handoff);
  assert.equal(content.length,2);
  assert.deepEqual(content[1],{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='});
  assert.match(content[0].text,new RegExp(id));
  assert.deepEqual((await connector.attachment(handoff+'.'+id))[1],content[1]);
  allowed=false;
  await assert.rejects(connector.content(handoff),/unavailable/i);
  await assert.rejects(connector.attachment(handoff+'.'+id),/unavailable/i);
  assert.equal(downloads,2);
  await assert.rejects(tutorImageBlock(new Blob([new Uint8Array(TUTOR_IMAGE_LIMIT+1)]),'image/png'),/unavailable/);
  const jpeg=new Blob([Uint8Array.of(255,216,255)],{type:'image/jpeg'});
  assert.equal((await tutorImageBlock(jpeg,'image/jpeg')).mimeType,'image/jpeg');
  await assert.rejects(tutorImageBlock(jpeg,'image/png'),/unavailable/);
});
