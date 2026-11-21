import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tutorConnector} from '../../supabase/functions/mcp/tutor-connector.ts';
import {TUTOR_IMAGE_LIMIT,tutorImageBlock} from '../../supabase/functions/mcp/tutor-images.ts';
import {imageReference} from '../../supabase/functions/_shared/tutor-answer.ts';

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

Deno.test('inline learner references interleave authorized images and prose in composition order',async()=>{
  const owner=randomUUID(),handoff=randomUUID()+'.'+randomUUID(),first=randomUUID(),second=randomUUID(),foreign=randomUUID();
  const images=new Map([first,second].map((id,index)=>[id,new Blob([Uint8Array.of(137,80,78,71,13,10,26,10,index)],{type:'image/png'})]));
  const rows=[first,second].map(id=>({id,kind:'drawing',mime_type:'image/png',byte_size:images.get(id)!.size}));
  const question='First text '+imageReference(second)+' middle '+imageReference(first)+' end '+imageReference(second)+' '+imageReference(foreign);
  const downloaded:string[]=[];
  const list={select:()=>list,eq:()=>list,order:()=>list,limit:()=>list,
    then:(resolve:(result:{data:typeof rows;error:null})=>unknown)=>Promise.resolve(resolve({data:rows,error:null}))};
  const connector=tutorConnector({userId:owner,db:{
    rpc:async()=>({data:{status:'pending',hasAttachments:true,snapshot:{question}},error:null}),
    from:()=>list,storage:{from:()=>({download:async path=>{
      assert.ok(path.startsWith(owner+'/'));
      const id=path.slice(owner.length+1);downloaded.push(id);
      assert.ok(images.has(id),'only turn-owned images may be downloaded');
      return {data:images.get(id)!,error:null};
    }})},
  }},'b'.repeat(48));
  const content=await connector.content(handoff);
  assert.deepEqual(downloaded,[second,first]);
  const metadata=JSON.parse(content[0].text);
  assert.deepEqual(metadata.answerParts.filter(part=>part.type==='image').map(part=>part.id),[handoff+'.'+second,handoff+'.'+first,handoff+'.'+second]);
  assert.deepEqual(content.slice(1).map(block=>block.type==='text'?block.text:block.data),[
    'Learner answer in composition order:','First text ','[Drawing 1]','iVBORw0KGgoB',
    ' middle ','[Drawing 2]','iVBORw0KGgoA',' end ','[Drawing 1, repeated reference]',' '+imageReference(foreign),
  ]);
});
