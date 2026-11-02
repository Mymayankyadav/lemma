import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const paths=readFileSync('src/features/projects/Page.tsx','utf8');
const routes=readFileSync('src/app/routes.tsx','utf8');

describe('FIX #632: Atlas C2 stays below the 4x CPU first-attempt budget',()=>{
 it('splits Atlas without running the 2,500-idea query on Paths mount',()=>{
  // The immutable cold caches now remove the repeated geometry/arc work.
  // Keep the Atlas module out of unrelated cold documents; strict C2 browser
  // cases still measure the complete route import + interactive render.
  expect(routes).toContain("const Page13=lazy(()=>import('../features/atlas/Page'))");
  expect(paths).toContain("prefetchAtlasForPaths(queryClient,getMode(),()=>getApi().getAtlas())");
  const mount=paths.slice(paths.indexOf('export default function Page(){'));
  const effect=mount.slice(0,mount.indexOf('const warmAtlas=useCallback'));
  expect(effect).not.toContain("import('../atlas/Page')");
  expect(effect).not.toContain('prefetchAtlasForPaths(');
  expect(effect).not.toContain('getApi().getAtlas()');
 });
});
