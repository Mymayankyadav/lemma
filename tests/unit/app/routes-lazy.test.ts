import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #632: legacy Today must not parse unrelated pages before its first goal.
const routes=readFileSync('src/app/routes.tsx','utf8');
const screens=[
 ['/', 'home'], ['/projects','projects'], ['/projects/new','new-project'], ['/p/:slug','project'],
 ['/p/:slug/cp/:code','checkpoint'], ['/s/:slug/:n','session'], ['/proposals','proposals'],
 ['/proposals/:id','plan-proposal'], ['/review','review'], ['/review/run','review-run'],
 ['/review/done','review-done'], ['/cards','cards'], ['/cards/:no','card'], ['/atlas','atlas'],
 ['/insights','insights'], ['/settings','settings'], ['/sign-in','sign-in'], ['/kit','kit'],
] as const;

describe('FIX #632: Today entry does not eagerly import unrelated routes',()=>{
 it('keeps the established eager legacy pages and lazily imports every other route',()=>{
  expect(routes).toContain("import HomePage from '../features/home/Page'");
  expect(routes).toContain("import ProjectsPage from '../features/projects/Page'");
  expect(routes).toContain("import AtlasPage from '../features/atlas/Page'");
  const paths=readFileSync('src/features/projects/Page.tsx','utf8');
  expect(paths).toContain("void import('../cards/Page').catch(()=>{})");
  for(const [,feature] of screens){
   if(['home','projects','atlas'].includes(feature))continue;
   expect(routes,feature).toContain("createLazyModule(()=>import('../features/"+feature+"/Page'))");
   expect(routes,feature).not.toContain("from '../features/"+feature+"/Page'");
  }
 });
 it('preserves all canonical paths and keeps module loading inside data-router navigation',()=>{
  const boundary=readFileSync('src/app/lazyRoute.tsx','utf8');
  const paths=new Set([...routes.matchAll(/(?:lazyRoute|eagerRoute)\('([^']+)'/g)].map(match=>match[1]));
  expect([...paths]).toEqual(screens.map(([path])=>path));
  expect(boundary).toContain('errorElement:<RouteError/>');
  expect(boundary).toContain('Component:Screen');
  expect(boundary).toContain('=>surfaceBetaEnabled()');
  expect(boundary).toContain('?load().then');
  expect(routes).not.toContain('<Suspense');
 });
});
