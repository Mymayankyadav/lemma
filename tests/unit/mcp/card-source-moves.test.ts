import {describe,expect,it,vi} from 'vitest';
import {cardMovePatch} from '../../../supabase/functions/mcp/tools/card-move';
import {confirmedSourceUpload,signedSourceUpload,sourcePath,MAX_SOURCE_BYTES} from '../../../supabase/functions/mcp/tools/source-upload';

vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({McpServer:class{},z:{},createClient:()=>null,createMcpHandler:()=>null}));
const mocked={storagePath:null as string|null};
vi.mock('../../../supabase/functions/mcp/resolve.ts',()=>({
 project:async()=>({id:'p1'}),
 source:async()=>({id:'src1',short:'algebra',storage_path:mocked.storagePath})}));
const OWNER='11111111-1111-1111-1111-111111111111';
describe('N160 card moves between Paths',()=>{
 const a={id:'pa',subject_id:'s1'},b={id:'pb',subject_id:'s1'},c={id:'pc',subject_id:'s2'};
 it('clears links into the old Path',()=>{
  expect(cardMovePatch({project_id:'pa',concept_id:'k'},a,b,{})).toEqual({project_id:'pb',session_id:null,checkpoint_id:null,source_id:null});
 });
 it('keeps a link the same call names in the new Path',()=>{
  const out=cardMovePatch({project_id:'pa'},a,b,{checkpoint_id:'CP2',source_id:'bk'});
  expect(out).toEqual({project_id:'pb',session_id:null});
 });
 it('drops the idea only when the subject changes',()=>{
  expect(cardMovePatch({project_id:'pa',concept_id:'k'},a,c,{}).concept_id).toBeNull();
  expect('concept_id' in cardMovePatch({project_id:'pa',concept_id:'k'},a,b,{})).toBe(false);
 });
 it('refuses a no-op move or a card outside its stated Path',()=>{
  expect(()=>cardMovePatch({project_id:'pa'},a,a,{})).toThrow(/already/);
  expect(()=>cardMovePatch({project_id:'zz'},a,b,{})).toThrow(/not in its stated/);
 });
});
describe('N160 original files of sources',()=>{
 const storage=(list:any[],extra:any={})=>({
  from:(bucket:string)=>({
   createSignedUploadUrl:async(path:string)=>({data:{signedUrl:'https://x/upload/'+bucket+'/'+path,token:'t'},error:null,...extra}),
   list:async()=>({data:list,error:null})})});
 it('names the owner folder and the PDF type, and never another owner',async()=>{
  expect(sourcePath(OWNER,'src1')).toBe(OWNER+'/src1.pdf');
 });
 it('confirms only an object that exists in the owner folder and fits the limit',async()=>{
  const ok={db:{storage:storage([{name:'src1.pdf',metadata:{size:1234}}])},userId:OWNER} as any;
  expect(await confirmedSourceUpload(ok,{id:'src1',short:'book'})).toEqual({storage_path:OWNER+'/src1.pdf',bytes:1234});
  await expect(confirmedSourceUpload({db:{storage:storage([])},userId:OWNER} as any,{id:'src1',short:'book'})).rejects.toThrow(/upload it/);
  await expect(confirmedSourceUpload({db:{storage:storage([{name:'src1.pdf',metadata:{size:MAX_SOURCE_BYTES+1}}])},userId:OWNER} as any,{id:'src1',short:'book'})).rejects.toThrow(/50 MB/);
 });
 it('returns a signed PUT URL into the owner folder, once per source',async()=>{
  const c={db:{storage:storage([])},userId:OWNER} as any;
  const out=JSON.parse(await signedSourceUpload(c,{project:'p',id:'algebra'}));
  expect(out).toMatchObject({source:'algebra',path:OWNER+'/src1.pdf',method:'PUT',contentType:'application/pdf',maxBytes:MAX_SOURCE_BYTES});
  expect(out.uploadUrl).toContain(OWNER+'/src1.pdf');
  mocked.storagePath=OWNER+'/src1.pdf';
  await expect(signedSourceUpload(c,{project:'p',id:'algebra'})).rejects.toThrow(/already has its original file/);
  mocked.storagePath=null;
 });
 it('requires a source name',async()=>{
  await expect(signedSourceUpload({db:{},userId:OWNER} as any,{project:'p'})).rejects.toThrow(/source short name/);
 });
});
