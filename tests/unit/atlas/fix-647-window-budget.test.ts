import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #647: the initial virtual Atlas should mount only a bounded nearby
// row window, not 16 extra 44px rows before any scroll. Four rows on either
// side still provide 176px of keyboard/scroll headroom; the separate pinned
// Field controls must remain accessible for moderate outlines.
describe('FIX #647 bounded virtual Atlas row overscan',()=>{
 it('keeps four rows of overscan on each side and retains pinned Fields',()=>{
  const page=readFileSync('src/features/atlas/Page.tsx','utf8');
  expect(page).toContain('atlasRowAt(geometry.offsets,scrollTop)-4');
  expect(page).toContain('atlasRowAt(geometry.offsets,scrollTop+viewportHeight)+5');
  expect(page).toContain('if(tree&&tree.nodes.size<=150)for(const index of fieldRows)indices.add(index)');
 });
});
