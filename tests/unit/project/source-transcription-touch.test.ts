import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Audit #510: page-transcription actions are part of the Sources surface too.
// Guard all compact text controls, not just the source-row editor controls.
const source=readFileSync(new URL('../../../src/features/project/SourceTranscriptionView.tsx',import.meta.url),'utf8');
const buttons=[...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(match=>match[0]);

describe('FIX #510 page-transcription touch targets',()=>{
 for(const label of ['Retry','Save page','Cancel','Edit page','Mark checked']){
  it(label+' has a minimum 44px width and height',()=>{
   const button=buttons.find(markup=>markup.includes(label+'</button>'));
   expect(button,'button '+label+' must exist').toBeDefined();
   expect(button,'button '+label+' must have 44px min-height').toMatch(/min-h-11|size-11/);
   expect(button,'button '+label+' must have 44px min-width').toMatch(/min-w-11|size-11/);
  });
 }
});
