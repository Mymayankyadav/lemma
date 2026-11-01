import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const paths=readFileSync('src/features/projects/Page.tsx','utf8');

describe('FIX #632: split Atlas module does not inflate C2 transition',()=>{
 it('warms only the Atlas JavaScript module on demo Paths mount',()=>{
  // The strict C2 test navigates by hash after the Paths data-backed row
  // loads. It cannot use hover/focus intent prefetch; the module must already
  // be requested without issuing the 2,500-idea Atlas data query on mount.
  expect(paths).toContain("if(getMode()==='demo')void import('../atlas/Page')");
  expect(paths).toContain("prefetchAtlasForPaths(queryClient,getMode(),()=>getApi().getAtlas())");
  const mount=paths.slice(paths.indexOf('export default function Page(){'));
  const effect=mount.slice(0,mount.indexOf('const projects=useProjects()'));
  expect(effect).toContain("import('../atlas/Page')");
  expect(effect).not.toContain('prefetchAtlasForPaths(');
  expect(effect).not.toContain('getApi().getAtlas()');
 });
});
