import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {LiveAdapter} from '../../../src/data/live/adapter';

/** The additive UI-8 contract must not silently return fabricated page data. */
describe('CONTRACT UI-8 transcription adapter boundaries',()=>{
 for(const [name,create] of [
  ['demo',()=>new DemoAdapter()],
  ['live',()=>new LiveAdapter()],
 ] as const){
  it(name+' rejects unimplemented transcription reads and writes explicitly',async()=>{
   const api=create();
   const attempts=[
    api.getSourceTranscriptionStats('project-id'),
    api.getSourcePage('source-id',1),
    api.getTranscribedPagesForExport('source-id'),
    api.updateSourcePage('source-id',1,{body:'A corrected proof'}),
    api.getSourcePdfUrl('source-id'),
   ];
   for(const operation of attempts){
    await expect(operation).rejects.toMatchObject({code:'not_implemented'});
   }
  });
 }
});
