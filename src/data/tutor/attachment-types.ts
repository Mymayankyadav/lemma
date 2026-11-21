import type {PadStrokes} from '../../ui/v7/ink/ink';
import {referencedImageIds,tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';

export const TUTOR_IMAGE_LIMIT=1_048_576;
export const TUTOR_ATTACHMENT_COUNT=3;
export const IMAGE_ONLY_ANSWER='Image attached.';

export type TutorAttachment = {
  id:string;kind:'drawing'|'photo';mimeType:'image/png'|'image/jpeg';
  /** Browser demo turns keep the encoded image locally. */
  localData?:string;
};

export type TutorDrawingInk = {strokes:PadStrokes;width:number;accent:boolean};
export type TutorImageDraft = TutorAttachment & {blob:Blob;ink?:TutorDrawingInk};

export function unresolvedTutorImageIds(text:string,images?:readonly Pick<TutorAttachment,'id'>[]):string[] {
  const attached=new Set(Array.isArray(images)?images.flatMap(image=>typeof image?.id==='string'?[image.id.toLowerCase()]:[]):[]);
  return referencedImageIds(text).filter(id=>!attached.has(id));
}

export function removeTutorImageReferences(text:string):string {
  return tutorAnswerParts(text).map(part=>part.type==='text'?part.text:'').join('');
}
