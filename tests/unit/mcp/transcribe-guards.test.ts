import {describe,expect,it} from 'vitest';
import {validateTranscriptionBatch} from '../../../supabase/functions/mcp/transcribe-validation';

/** Invalid batches fail before the connector can access the owner database. */
describe('save_pages atomic preflight guards',()=>{
 const page=(n:number)=>({page:n,text:'For $x\\\\in X$, choose an open neighbourhood.'});
 it('rejects empty batches and more than ten pages',()=>{
  expect(()=>validateTranscriptionBatch([])).toThrow(/1–10 pages/);
  expect(()=>validateTranscriptionBatch(Array.from({length:11},(_,i)=>page(i+1)))).toThrow(/1–10 pages/);
 });
 it('rejects duplicate PDF page numbers',()=>{
  expect(()=>validateTranscriptionBatch([page(2),page(2)])).toThrow(/Duplicate page 2/);
 });
 it('validates every page in the batch, not just the first',()=>{
  expect(()=>validateTranscriptionBatch([page(1),{page:2,text:'<script>bad</script>'}])).toThrow(/not raw HTML/);
  expect(()=>validateTranscriptionBatch([page(1),{page:2,text:'x'.repeat(8001)}])).toThrow(/8,000/);
 });
 it('rejects unsupported confidence and noninteger page indexes',()=>{
  expect(()=>validateTranscriptionBatch([
   {page:1,text:'A statement',confidence:'uncertain' as 'check'}
  ])).toThrow(/Confidence/);
  expect(()=>validateTranscriptionBatch([page(1.5)])).toThrow(/Page must/);
 });
 it('preserves valid mathematical Markdown and confidence flags',()=>{
  expect(()=>validateTranscriptionBatch([
   {...page(1),confidence:'check'}, {...page(2),confidence:'high'}
  ])).not.toThrow();
 });
});
