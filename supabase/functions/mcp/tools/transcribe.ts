import {Context,scoped,insert,update} from '../db.ts';
import {project,source} from '../resolve.ts';
import {settings} from '../packet.ts';
import {slug} from '../text.ts';
import {validateTranscriptionBatch,type TranscribedPage as Page} from '../transcribe-validation.ts';

export async function savePages(c:Context,a:{
 project:string;source?:string;title?:string;kind?:string;
 pages:Page[];replace?:boolean;client?:'claude'|'chatgpt';
}):Promise<string>{
 validateTranscriptionBatch(a.pages);
 const p=await project(c,a.project);
 const st=await settings(c);
 const client=a.client||st.connector_last_client;
 if(client!=='claude'&&client!=='chatgpt')throw Error('Set client to claude or chatgpt to record transcription provenance');
 if(!c.batch)throw Error('save_pages requires an atomic MCP transaction');

 let src:any;
 if(a.source){
  src=await source(c,p,a.source);
  if(src.page_count&&a.pages.some(page=>page.page>src.page_count))
   throw Error('Page exceeds '+src.page_count+' pages in '+src.short);
 }else{
  if(!a.title?.trim()||a.title.trim().length>120)throw Error('New transcribed source needs a title of at most 120 characters');
  const kind=a.kind||'notes';
  if(!['book','notes','slides','problems','syllabus','exam','other'].includes(kind))throw Error('Unknown source kind');
  const existing=await scoped(c,'sources','short').eq('project_id',p.id).limit(1000);
  if(existing.error)throw Error(existing.error.message);
  const used=new Set((existing.data||[]).map((row:any)=>row.short));
  const base=slug(a.title).slice(0,20)||'notes';
  let short=base;
  for(let n=2;used.has(short);n++)short=base.slice(0,20-String(n).length-1)+'-'+n;
  src=await insert(c,'sources',{
   project_id:p.id,title:a.title.trim(),short,filename:'',
   kind,status:'ready',has_text:true,origin:client,
   page_count:Math.max(...a.pages.map(page=>page.page)),
  });
 }
 const existingPages=a.source?await scoped(c,'source_pages','page,body')
  .eq('source_id',src.id).in('page',a.pages.map(page=>page.page)).limit(10):{data:[],error:null};
 if(existingPages.error)throw Error(existingPages.error.message);
 const byPage=new Map((existingPages.data||[]).map((row:any)=>[row.page,row]));
 const now=new Date().toISOString();
 let saved=0,skipped=0;
 for(const page of a.pages){
  const old:any=byPage.get(page.page);
  if(old?.body&&!a.replace){skipped++;continue}
  const values={body:page.text,label:page.label||String(page.page),
   transcribed_by:client,transcribed_at:now,confidence:page.confidence||'high'};
  if(old){
   c.batch.push({op:'update',table:'source_pages',
    where:{source_id:src.id,page:page.page},values});
  }else{
   c.batch.push({op:'insert',table:'source_pages',
    values:{user_id:c.userId,source_id:src.id,page:page.page,...values}});
  }
  saved++;
 }
 if(saved&&a.source){
  const changes:Record<string,unknown>={};
  if(!src.has_text)changes.has_text=true;
  if(!src.page_count||src.page_count<Math.max(...a.pages.map(page=>page.page)))
   changes.page_count=Math.max(...a.pages.map(page=>page.page));
  if(Object.keys(changes).length)await update(c,'sources',src.id,changes);
 }
 if(!saved)return 'No pages changed; '+skipped+' already had text (set replace=true to overwrite).';
 const first=Math.min(...a.pages.map(page=>page.page)),last=Math.max(...a.pages.map(page=>page.page));
 return 'saved pages '+first+'–'+last+' of '+src.short+' ('+saved+' written'
   +(skipped?', '+skipped+' kept':'')+'); next '+(last+1)+'. Read them back with read_pages before citing.';
}
