import {LemmaError} from '../api';
import {checked,type Row} from './helpers';
import type {liveClient} from './client';

export interface SourceBackupFile {
 sourceId:string;storagePath:string;filename:string;mimeType:string;
 bytes:number;sha256:string;encoding:'base64';data:string;
}

/** Original scans are the only readable copy when OCR/transcription is empty. */
export async function backupSourceFiles(db:ReturnType<typeof liveClient>,uid:string,sources:Row[],checkAccount:()=>void){
 checkAccount();
 const files:SourceBackupFile[]=[];
 for(const source of sources){
  checkAccount();
  const path=source.storage_path;
  if(path===null||path===undefined){
   // MCP can register a book before any original file is supplied. Its
   // placeholder filename alone does not establish that PDF bytes existed.
   if(source.status==='ready'&&(Number(source.bytes)>0||source.sha256)&&/\.pdf$/i.test(String(source.filename??'')))
    throw new LemmaError('server','Original PDF is missing; the backup is incomplete.');
   continue;
  }
  if(typeof path!=='string'||!path.startsWith(uid+'/')||path.split('/').some(part=>!part||part==='.'||part==='..'))
   throw new LemmaError('server','Source backup contains an invalid owner path.');
  const blob=checked(await db.storage.from('sources').download(path));
  checkAccount();
  if(source.bytes!==null&&source.bytes!==undefined&&
    (!Number.isSafeInteger(Number(source.bytes))||blob.size!==Number(source.bytes)))
   throw new LemmaError('server','Original PDF size does not match; the backup is incomplete.');
  const buffer=await blob.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),value=>value.toString(16).padStart(2,'0')).join('');
  if(source.sha256!==null&&source.sha256!==undefined&&String(source.sha256).toLowerCase()!==hash)
   throw new LemmaError('server','Original PDF checksum does not match; the backup is incomplete.');
  checkAccount();
  const bytes=new Uint8Array(buffer),encoded:string[]=[];
  // A multiple of three preserves base64 boundaries without a huge argument list.
  for(let offset=0;offset<bytes.length;offset+=24576)
   encoded.push(btoa(String.fromCharCode(...bytes.subarray(offset,offset+24576))));
  files.push({sourceId:String(source.id),storagePath:path,filename:String(source.filename??source.id+'.pdf'),
   mimeType:blob.type||'application/pdf',bytes:blob.size,sha256:hash,encoding:'base64',data:encoded.join('')});
 }
 return files;
}
