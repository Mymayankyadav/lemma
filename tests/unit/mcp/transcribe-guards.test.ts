import {describe,expect,it} from 'vitest';
import {savePages} from '../../../supabase/functions/mcp/tools/transcribe';
import type {Context} from '../../../supabase/functions/mcp/db';

/**
 * Invalid batches must fail before touching the owner database. A failed
 * transcription must never leave a partial source or page behind.
 */
describe('save_pages preflight guards',()=>{
 const noDatabase=():Context=>({
  userId:'00000000-0000-4000-8000-000000000001',
  batch:[],
  db:{from:()=>{throw Error('unexpected database access')},
      rpc:()=>{throw Error('unexpected RPC')}},
 });
 const page=(n:number)=>({page:n,text:'For $x\\in X$, choose an open neighbourhood.'});
 it('rejects empty batches and more than ten pages before a database call',async()=>{
  await expect(savePages(noDatabase(),{project:'analysis',pages:[]})).rejects.toThrow(/1–10 pages/);
  await expect(savePages(noDatabase(),{project:'analysis',pages:Array.from({length:11},(_,i)=>page(i+1))})).rejects.toThrow(/1–10 pages/);
 });
 it('rejects duplicate PDF page numbers without partial writes',async()=>{
  const context=noDatabase();
  await expect(savePages(context,{project:'analysis',pages:[page(2),page(2)]})).rejects.toThrow(/Duplicate page 2/);
  expect(context.batch).toEqual([]);
 });
 it('validates every page before resolving a project or inserting a source',async()=>{
  const context=noDatabase();
  await expect(savePages(context,{project:'analysis',title:'Notes',pages:[
   page(1),{page:2,text:'<script>bad</script>'}
  ]})).rejects.toThrow(/not raw HTML/);
  expect(context.batch).toEqual([]);
  await expect(savePages(context,{project:'analysis',pages:[
   page(1),{page:2,text:'x'.repeat(8001)}
  ]})).rejects.toThrow(/8,000/);
  expect(context.batch).toEqual([]);
 });
 it('rejects invalid page confidence and noninteger page indexes before database access',async()=>{
  await expect(savePages(noDatabase(),{project:'analysis',pages:[
   {page:1,text:'A statement',confidence:'uncertain' as 'check'}
  ]})).rejects.toThrow(/Confidence/);
  await expect(savePages(noDatabase(),{project:'analysis',pages:[page(1.5)]})).rejects.toThrow(/Page must/);
 });
});
