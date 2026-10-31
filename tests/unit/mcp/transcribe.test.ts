import {describe,it,expect} from 'vitest';
import {validateTranscription} from '../../../supabase/functions/mcp/tools/transcribe';

describe('save_pages transcription validation',()=>{
 const page={page:1,text:'For $x<y$, the LaTeX $$x^2$$ remains verbatim.',confidence:'check' as const};
 it('preserves maths, page labels, and an explicit check flag',()=>{
  expect(()=>validateTranscription({...page,label:'i'})).not.toThrow();
 });
 it('rejects zero, noninteger and negative page numbers',()=>{
  for(const value of [0,-1,1.5,Number.NaN]){
   expect(()=>validateTranscription({...page,page:value})).toThrow(/Page must/);
  }
 });
 it('rejects raw HTML instead of attempting to sanitize the transcription',()=>{
  for(const text of ['<script>alert(1)</script>','<b>assertion</b>','<!-- hidden -->']){
   expect(()=>validateTranscription({...page,text})).toThrow(/not raw HTML/);
  }
 });
 it('rejects pages beyond 8,000 characters and empty text',()=>{
  for(const text of ['', 'x'.repeat(8001)]){
   expect(()=>validateTranscription({...page,text})).toThrow(/8,000/);
  }
 });
 it('does not invent a confidence value or allow unsupported flags',()=>{
  expect(()=>validateTranscription({...page,confidence:undefined})).not.toThrow();
  expect(()=>validateTranscription({...page,confidence:'uncertain' as 'check'})).toThrow(/Confidence/);
 });
});
