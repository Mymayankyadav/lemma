import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const paths=readFileSync('src/features/projects/Page.tsx','utf8');
const routes=readFileSync('src/app/routes.tsx','utf8');

describe('FIX #632: Atlas C2 stays below the 4x CPU first-attempt budget',()=>{
 it('keeps Atlas eager without running the 2,500-idea query on Paths mount',()=>{
  // Two module-only warmup attempts still missed C2 (1109ms/1060ms).
  // The Atlas route must mount without a deferred chunk; data prefetch stays
  // on real user intent and never runs as a Paths mount effect.
  expect(routes).toContain("import Page13 from '../features/atlas/Page'");
  expect(paths).toContain("prefetchAtlasForPaths(queryClient,getMode(),()=>getApi().getAtlas())");
  const mount=paths.slice(paths.indexOf('export default function Page(){'));
  const effect=mount.slice(0,mount.indexOf('const warmAtlas=useCallback'));
  expect(effect).not.toContain("import('../atlas/Page')");
  expect(effect).not.toContain('prefetchAtlasForPaths(');
  expect(effect).not.toContain('getApi().getAtlas()');
 });
});
