import {Buffer} from 'node:buffer';

export const TUTOR_IMAGE_LIMIT=1_048_576;
export const TUTOR_ATTACHMENT_COUNT=3;

export async function tutorImageBlock(blob:Blob,mimeType:string) {
  if (!blob.size||blob.size>TUTOR_IMAGE_LIMIT) throw new Error('Tutor image is unavailable.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  const jpeg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if (!(mimeType==='image/png'&&png||mimeType==='image/jpeg'&&jpeg)) throw new Error('Tutor image is unavailable.');
  return {type:'image' as const,mimeType,data:Buffer.from(bytes).toString('base64')};
}
