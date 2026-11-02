// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {makeStressStore} from '../../../src/data/demo/stress';
const now=()=>Date.parse('2026-11-02T12:00:00Z');
afterEach(()=>vi.restoreAllMocks());
describe('single-project proposed checkpoints',()=>{
 it('never clones unrelated approved checkpoint rows while rendering a project or sheet',async()=>{
  const api=new DemoAdapter({fixture:makeStressStore(demoSeedFixture,'extreme',{
   deferNotes:true,deferSessions:true,deferSources:true,deferAtlas:true,
  }),ownedFixture:true,now,timeZone:'UTC'});
  const clone=vi.spyOn(globalThis,'structuredClone');
  const project=await api.getProject('real-analysis');
  const sheet=await api.getCheckpoint('real-analysis','CP4');
  expect(project.checkpoints.length).toBeGreaterThan(0);
  expect(sheet.view.dueCards).toBe(project.checkpoints.find(cp=>cp.code==='CP4')!.dueCards);
  const cpClones=clone.mock.calls.map(([input])=>input).filter(input=>
   Array.isArray(input)&&input.some(row=>row&&typeof row==='object'&&'projectId' in row&&'code' in row));
  expect(clone).toHaveBeenCalled();
  for(const rows of cpClones)for(const row of rows as Array<{projectId:string}>)
   expect(row.projectId).toBe(project.project.id);
 });
 it('proposed insertion leaves approved positions and later reads unchanged',async()=>{
  const api=new DemoAdapter({now,timeZone:'UTC'});
  const a=await api.getProject('real-analysis');
  const b=await api.getProject('real-analysis');
  expect(a.checkpoints.some(cp=>cp.ui==='proposed')).toBe(true);
  expect(b.checkpoints).toEqual(a.checkpoints);
  const slug=demoSeedFixture.projects.find(project=>project.slug!=='real-analysis')!.slug;
  const other=await api.getProject(slug);
  expect(other.checkpoints.every(cp=>!a.checkpoints.some(x=>x.id===cp.id))).toBe(true);
 });
});
