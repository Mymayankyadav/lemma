// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
import {publishAuth} from '../../../src/data/authBoundary';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/features/pad/padDraftStore',()=>({exportSavedPadDrafts:async()=>[]}));
const owner='11111111-1111-4111-8111-111111111111';
const scan=Buffer.from('%PDF-1.7\nScanned mathematical proof: \u0000\u00ff\n%%EOF','utf8');
function fixture(options:{missing?:boolean;wrongSize?:boolean;wrongHash?:boolean;foreignPath?:boolean;noPath?:boolean;switchOwner?:boolean;placeholder?:boolean;emptySources?:boolean}={}){
 const source={id:'scan-id',user_id:owner,filename:'proof.pdf',status:'ready',has_text:false,bytes:options.placeholder?null:scan.length,
  storage_path:options.noPath||options.placeholder?null:(options.foreignPath?'other-owner':owner)+'/scan.pdf',
  sha256:options.placeholder?null:options.wrongHash?'a'.repeat(64):createHash('sha256').update(scan).digest('hex')};
 const download=vi.fn(async()=>{
  if(options.switchOwner)publishAuth(null);
  return options.missing?{data:null,error:{message:'Object missing'}}:
   {data:new Blob([options.wrongSize?scan.subarray(0,3):scan],{type:'application/pdf'}),error:null};
 });
 const rpc=vi.fn(async(name:string,args?:Record<string,unknown>)=>{
  if(name==='begin_owner_export')return {data:'snapshot',error:null};
  if(name==='end_owner_export')return {data:null,error:null};
  const rows=args?.p_table===null?[{table_name:'sources'},{table_name:'source_pages'}]:
   options.emptySources?[]:args?.p_table==='sources'?[source]:[{user_id:owner,source_id:source.id,page:1,body:''}];
  return {data:{rows,nextCursor:null},error:null};
 });
 const getUser=vi.fn(async()=>({data:{user:{id:owner}},error:null}));
 vi.mocked(liveClient).mockReturnValue({auth:{getUser},rpc,
  storage:{from:vi.fn(()=>({download}))}} as never);
 return {download,rpc,source,getUser};
}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);publishAuth({id:owner});});
afterEach(()=>vi.unstubAllGlobals());
it('backs up exact original PDF bytes even when extracted text is empty',async()=>{
 const h=fixture();const result=JSON.parse(await (await new LiveAdapter().exportAll()).text());
 expect(h.download).toHaveBeenCalledWith(owner+'/scan.pdf');
 expect(result.sourceFiles).toHaveLength(1);
 const file=result.sourceFiles[0];
 expect(file).toMatchObject({sourceId:'scan-id',filename:'proof.pdf',bytes:scan.length,encoding:'base64',sha256:h.source.sha256});
 expect(Buffer.from(file.data,'base64')).toEqual(scan);
 expect(result.manifest.originals).toEqual({complete:true,count:1,bytes:scan.length});
 expect(h.rpc).toHaveBeenLastCalledWith('end_owner_export',{p_snapshot:'snapshot'});
});
it.each([{missing:true},{wrongSize:true},{wrongHash:true},{foreignPath:true},{noPath:true}])('refuses an incomplete or unowned original: %j',async options=>{
 const h=fixture(options);
 await expect(new LiveAdapter().exportAll()).rejects.toThrow();
 if(options.foreignPath||options.noPath)expect(h.download).not.toHaveBeenCalled();
 expect(h.rpc).toHaveBeenLastCalledWith('end_owner_export',{p_snapshot:'snapshot'});
});
it('discards the backup if the account changes during original download',async()=>{
 fixture({switchOwner:true});
 await expect(new LiveAdapter().exportAll()).rejects.toMatchObject({code:'auth'});
});
it('rejects a stale owner lookup that completes after sign-out, even without source files',async()=>{
 const h=fixture({emptySources:true});
 h.getUser.mockImplementationOnce(async()=>{publishAuth(null);return {data:{user:{id:owner}},error:null};});
 await expect(new LiveAdapter().exportAll()).rejects.toMatchObject({code:'auth'});
 expect(h.rpc).not.toHaveBeenCalled();expect(h.download).not.toHaveBeenCalled();
});
it('keeps a registered book without an uploaded file exportable',async()=>{
 const h=fixture({placeholder:true});
 const result=JSON.parse(await (await new LiveAdapter().exportAll()).text());
 expect(result.tables.sources).toHaveLength(1);expect(result.sourceFiles).toEqual([]);
 expect(h.download).not.toHaveBeenCalled();
});
it('preserves every byte across base64 chunk boundaries',async()=>{
 const {backupSourceFiles}=await import('../../../src/data/live/source-backup');
 const bytes=Uint8Array.from({length:50003},(_,i)=>i%256);
 const db={storage:{from:()=>({download:async()=>({data:new Blob([bytes]),error:null})})}};
 const [file]=await backupSourceFiles(db as never,owner,[{id:'large',storage_path:owner+'/large.pdf',bytes:bytes.length}],()=>{});
 expect(new Uint8Array(Buffer.from(file.data,'base64'))).toEqual(bytes);
});
