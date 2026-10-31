import {Context,scoped,insert,update} from '../db.ts';
import {project,source} from '../resolve.ts';
import {settings} from '../packet.ts';
import {slug} from '../text.ts';

type Page = {page:number;label?:string;text:string;confidence?:'high'|'check'};

/** Preserve the tutor's exact Markdown/LaTeX. Never silently strip a dubious symbol. */
export function validateTranscription(page:Page):void{
 if(!Number.isSafeInteger(page.page)||page.page<1||page.page>100000)throw Error('Page must be a positive PDF page number');
 if(typeof page.text!=='string'||page.text.length<1||page.text.length>8000)throw Error('Each page needs 1–8,000 characters of transcription');
 if(page.label!==undefined&&(typeof page.label!=='string'||page.label.length>12))throw Error('Page label exceeds 12 characters');
 if(page.confidence!==undefined&&!['high','check'].includes(page.confidence))throw Error('Confidence must be high or check');
 // Keep LaTeX angle inequalities, but do not accept HTML tags or scripts.
 if(/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(page.text)||/<!--|-->|<script\b/i.test(page.text))
  throw Error('Transcriptions use Markdown and LaTeX, not raw HTML');
}

export async function savePages(c:Context,a:{
 project:string;source?:string;title?:string;kind?:string;
 pages:Page[];replace?:boolean;client?:'claude'|'chatgpt';
}):Promise<string>{
 if(!Array.isArray(a.pages)||!a.pages.length||a.pages.length>10)throw Error('Save 1–10 pages per call');
 const unique=new Set<number>();
 for(const page of a.pages){validateTranscription(page);if(unique.has(page.page))throw Error('Duplicate page '+page.page);unique.add(page.page)}
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
