import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #647: the full-bleed Atlas is a separate shell. The old Paths tab's
// 200ms exit animation must not block its first interactive tree under 4x CPU.
// Key the AnimatePresence boundary by shell kind so only the full-bleed
// crossing tears down the old subtree immediately; normal tab-to-tab
// transitions retain the owner's approved wait animation.
describe('FIX #647 Atlas full-bleed transition headroom',()=>{
 it('renders the full-bleed Atlas directly, outside motion and wait animations',()=>{
  const shell=readFileSync('src/app/AppShell.tsx','utf8');
  expect(shell).toContain('fullBleed||reduce?<div key={location.pathname}>');
  expect(shell).toContain(':<AnimatePresence');
 });
 it('does not mount the unused GraphSketch hook on the grid-only Atlas',()=>{
  const shell=readFileSync('src/app/AppShell.tsx','utf8');
  expect(shell).toContain('{!fullBleed&&<GraphSketch path={location.pathname}/> }'.replace('/> }','/>}'));
 });
 it('does not wait for the outgoing Paths animation before mounting Atlas',()=>{
  const shell=readFileSync('src/app/AppShell.tsx','utf8');
  expect(shell).toContain("key={fullBleed?'atlas':'standard'}");
  expect(shell).toContain('<AnimatePresence');
  expect(shell).toContain('mode="wait"');
 });
});
