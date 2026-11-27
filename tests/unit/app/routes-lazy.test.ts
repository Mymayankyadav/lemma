import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createMemoryRouter} from 'react-router';
import * as flags from '../../../src/flags';
import * as preferences from '../../../src/app/surfaceBeta';
import {lazyRoute} from '../../../src/app/lazyRoute';

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
 it('preserves all canonical paths',()=>{
  const paths=new Set([...routes.matchAll(/(?:lazyRoute|eagerRoute)\('([^']+)'/g)].map(match=>match[1]));
  expect([...paths]).toEqual(screens.map(([path])=>path));
  expect(routes).not.toContain('<Suspense');
 });
});

describe('route loading with a pending screen module',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it.each([
  {shell:'legacy',v7:false,beta:false,waits:true},
  {shell:'v7 with Beta testing',v7:true,beta:true,waits:true},
  {shell:'v7 with Beta testing off',v7:true,beta:false,waits:false},
 ])('$shell follows its loading preference',async({v7,beta,waits})=>{
  vi.spyOn(flags,'isFlagOn').mockReturnValue(v7);
  vi.spyOn(preferences,'surfaceBetaEnabled').mockReturnValue(beta);
  const Screen=()=>null;
  let resolve!:()=>void;
  const module=new Promise<{default:typeof Screen}>(done=>{resolve=()=>done({default:Screen});});
  const read=vi.fn(()=>module);
  const detail=lazyRoute('/detail',{read});
  expect(detail.errorElement).toBeTruthy();
  const router=createMemoryRouter([{path:'/',Component:Screen},detail]);
  try{
   const navigation=router.navigate('/detail');
   if(waits){
    await vi.waitFor(()=>expect(read).toHaveBeenCalledOnce());
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.navigation.state).toBe('loading');
   }else{
    await navigation;
    expect(read).not.toHaveBeenCalled();
   }
   resolve();
   await navigation;
   expect(router.state.location.pathname).toBe('/detail');
  }finally{resolve();router.dispose();}
 });
});
