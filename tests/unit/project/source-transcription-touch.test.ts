import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Audit #510: page-transcription actions are part of the Sources surface too.
// Guard all compact text controls, not just the source-row editor controls.
const source=readFileSync('src/features/project/SourceTranscriptionView.tsx','utf8');
const styles=readFileSync('src/features/project/sources-surfaces.css','utf8');
const buttons=[...source.matchAll(/<Control\b[\s\S]*?<\/Control>/g)].map(match=>match[0]);
const targetRule=styles.match(/\[data-source-transcription\] button\s*\{([^}]+)\}/)?.[1];

describe('FIX #510 page-transcription touch targets',()=>{
 for(const label of ['Retry','Save page','Cancel','Edit page','Mark checked']){
  it(label+' has a minimum 44px width and height',()=>{
   const button=buttons.find(markup=>markup.includes(label+'</Control>'));
   expect(button,'button '+label+' must exist inside the transcription container').toBeDefined();
   expect(source).toContain("const Control=v7?Button:'button';");
   expect(source).toContain('data-source-transcription=""');
   expect(source.indexOf('data-source-transcription=""')).toBeLessThan(source.indexOf(button!));
   expect(targetRule,'button '+label+' must have 44px min-height').toMatch(/min-height:\s*44px\s*;/);
   expect(targetRule,'button '+label+' must have 44px min-width').toMatch(/min-width:\s*44px\s*;/);
  });
 }
});
