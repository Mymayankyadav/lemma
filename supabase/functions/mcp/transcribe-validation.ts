export type TranscribedPage={page:number;label?:string;text:string;confidence?:'high'|'check'};

/** Preserve exact tutor Markdown/LaTeX; reject unsafe markup rather than rewriting proofs. */
export function validateTranscription(page:TranscribedPage):void{
 if(!Number.isSafeInteger(page.page)||page.page<1||page.page>100000)throw Error('Page must be a positive PDF page number');
 if(typeof page.text!=='string'||page.text.length<1||page.text.length>8000)throw Error('Each page needs 1–8,000 characters of transcription');
 if(page.label!==undefined&&(typeof page.label!=='string'||page.label.length>12))throw Error('Page label exceeds 12 characters');
 if(page.confidence!==undefined&&!['high','check'].includes(page.confidence))throw Error('Confidence must be high or check');
 if(/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(page.text)||/<!--|-->|<script\b/i.test(page.text))
  throw Error('Transcriptions use Markdown and LaTeX, not raw HTML');
}
