import {Buffer} from 'node:buffer';
import {tutorAnswerParts} from '../_shared/tutor-answer.ts';
import type {Db} from './db.ts';

export const TUTOR_IMAGE_LIMIT=1_048_576;
export const TUTOR_ATTACHMENT_COUNT=3;

type TutorImageRow={id:string;user_id:string;kind:'drawing'|'photo';mime_type:string;byte_size:number};
type TutorImageScope={turnId:string;ownerId?:string;attachmentId?:string};

/** The command RPC must authorize the turn before either transport lists its images. */
export async function tutorImageRows(db:Db,scope:TutorImageScope):Promise<TutorImageRow[]> {
  let query=db.from('tutor_turn_attachments').select('id,user_id,kind,mime_type,byte_size')
    .eq('turn_id',scope.turnId).order('position').limit(TUTOR_ATTACHMENT_COUNT);
  if(scope.ownerId)query=query.eq('user_id',scope.ownerId);
  if(scope.attachmentId)query=query.eq('id',scope.attachmentId);
  const rows=await query;
  if(rows.error)throw new Error('Tutor images are unavailable.');
  return rows.data??[];
}

/** Exam attachment metadata comes from the exact grant-authorized turn RPC. */
export function examTutorImageRows(turn:{snapshot?:{attachments?:unknown}},owner:string,attachmentId?:string):TutorImageRow[] {
  const attachments=turn.snapshot?.attachments;
  if(!Array.isArray(attachments))return [];
  return attachments.slice(0,TUTOR_ATTACHMENT_COUNT).flatMap(row=>
    row&&typeof row.id==='string'&&(!attachmentId||row.id===attachmentId)&&
    (row.kind==='drawing'||row.kind==='photo')&&(row.mimeType==='image/png'||row.mimeType==='image/jpeg')&&
    Number.isSafeInteger(row.byteSize)&&row.byteSize>0&&row.byteSize<=TUTOR_IMAGE_LIMIT
    ? [{id:row.id,user_id:owner,kind:row.kind,mime_type:row.mimeType,byte_size:row.byteSize}] : []);
}

export async function tutorImageBlock(blob:Blob,mimeType:string) {
  if (!blob.size||blob.size>TUTOR_IMAGE_LIMIT) throw new Error('Tutor image is unavailable.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  const jpeg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if (!(mimeType==='image/png'&&png||mimeType==='image/jpeg'&&jpeg)) throw new Error('Tutor image is unavailable.');
  return {type:'image' as const,mimeType,data:Buffer.from(bytes).toString('base64')};
}

export async function downloadTutorImage(db:Db,row:TutorImageRow) {
  if(!db.storage)throw new Error('Tutor storage is unavailable.');
  // The attachment foreign key binds the row's owner to the authorized turn.
  const file=await db.storage.from('tutor-ink').download(row.user_id+'/'+row.id);
  if(file.error||!file.data||file.data.size!==row.byte_size)throw new Error('Tutor image is unavailable.');
  return tutorImageBlock(file.data,row.mime_type);
}

type TutorContentBlock={type:'text';text:string}|Awaited<ReturnType<typeof tutorImageBlock>>;

export function tutorFollowupFields(followups?: readonly {body: string; createdAt: string}[]) {
  return followups?.length ? {learnerFollowUps: followups.map(item => ({text: item.body, postedAt: item.createdAt}))} : {};
}

export async function tutorTurnContent(
  db:Db,turn:{snapshot?:{question?:unknown}}|null,rows:readonly TutorImageRow[],referenceId:(id:string)=>string=id=>id,
  details?:()=>Promise<Record<string,unknown>>,
):Promise<TutorContentBlock[]> {
  const content=rows.length?{...turn,attachments:rows.map(row=>({id:referenceId(row.id),kind:row.kind,mimeType:row.mime_type}))}:turn;
  const question=typeof turn?.snapshot?.question==='string'?turn.snapshot.question:'';
  const images=new Map(rows.map(row=>[row.id,row]));
  const parts=tutorAnswerParts(question,images.keys());
  // Details can acknowledge follow-ups. Load the images first so a failed download acknowledges nothing.
  const summary=async (value:object|null)=>({type:'text' as const,text:JSON.stringify(details?{...value,...await details()}:value)});
  if(!parts.some(part=>part.type==='image')) {
    const blocks=await Promise.all(rows.map(row=>downloadTutorImage(db,row)));
    return [await summary(content),...blocks];
  }

  const labels=new Map<string,string>(),counts={drawing:0,photo:0};
  const answerParts=parts.map(part=>{
    if(part.type==='text')return part;
    const {kind}=images.get(part.id)!;
    if(!labels.has(part.id))labels.set(part.id,(kind==='photo'?'Photo ':'Drawing ')+ ++counts[kind]);
    return {...part,id:referenceId(part.id),label:labels.get(part.id)};
  });
  const blocks:TutorContentBlock[]=[
    {type:'text',text:'Learner answer in composition order:'},
  ];
  const seen=new Set<string>();
  for(const part of parts) {
    if(part.type==='text') {blocks.push({type:'text',text:part.text});continue;}
    blocks.push({type:'text',text:'['+labels.get(part.id)+(seen.has(part.id)?', repeated reference':'')+']'});
    if(!seen.has(part.id)) {
      blocks.push(await downloadTutorImage(db,images.get(part.id)!));
      seen.add(part.id);
    }
  }
  return [await summary({...content,answerParts}),...blocks];
}
