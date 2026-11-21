import type {PadStrokes} from '../../ui/v7/ink/ink';

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
