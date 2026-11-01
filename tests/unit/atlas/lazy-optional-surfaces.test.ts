import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// FIX #647: a cold, nonempty Atlas must not evaluate motion-backed Sheet or
// four empty-state illustrations before the first interactive outline row.
// The original controls remain available when their own state actually opens.
describe('FIX #647 Atlas optional surfaces on cold route',()=>{
 it('defers Sheet and EmptyState modules until their UI is requested',()=>{
  const page=readFileSync('src/features/atlas/Page.tsx','utf8');
  expect(page).not.toMatch(/import\s*\{\s*Sheet\s*\}\s*from\s*['"]\.\.\/\.\.\/ui\/Sheet/);
  expect(page).not.toMatch(/import\s*\{\s*EmptyState\s*\}\s*from\s*['"]\.\.\/\.\.\/ui\/EmptyState/);
  expect(page).toContain("lazy(()=>import('../../ui/Sheet')");
  expect(page).toContain("lazy(()=>import('../../ui/EmptyState')");
  expect(page).toContain('if(!props.open&&!activated)return null');
  expect(page).toContain('<LazySheet {...props}/>');
  expect(page).toContain('<LazyEmptyState {...props}/>');
 });
});
