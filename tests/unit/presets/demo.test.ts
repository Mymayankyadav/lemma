import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoPresetApi} from '../../../src/data/presets/demo';
import {getPresetApi,setPresetApiForTests} from '../../../src/data/presets';

const key='lemma.v6.demo.presets.v1';
const instant='2026-11-06T11:00:00.000Z';
beforeEach(()=>{
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
});
afterEach(()=>{
  setPresetApiForTests(null);
  vi.useRealTimers();
  sessionStorage.clear();
});
describe('N55 demo activity presets',()=>{
  it('seeds a distinct bounded preset fixture, with active and archived views',async()=>{
    const api=createDemoPresetApi();
    expect(api.mode).toBe('demo');
    const active=await api.listPresets();
    expect(active).toMatchObject({total:3,nextCursor:null});
    expect(active.items.map(x=>x.id)).toEqual(['demo-preset-1','demo-preset-2','demo-preset-3']);
    expect(active.items[0]).toMatchObject({label:'Proof workshop',mode:'pomodoro',
      subjectId:'subject-analysis',projectId:'project-analysis',version:1});
    expect((await api.listPresets({archived:'archived'})).items.map(x=>x.id)).toEqual(['demo-preset-4']);
    expect((await api.listPresets({archived:'all'})).total).toBe(4);
    expect(sessionStorage.getItem(key)).toContain('demo-preset-4');
    expect(sessionStorage.getItem('lemma.v6.demo.tasks.v1')).toBeNull();
  });

  it('creates full typed values, does not share object references and reloads in the same tab',async()=>{
    const first=createDemoPresetApi();
    const result=await first.createPreset({label:'  Long proof session  ',mode:'flowtime',
      focusMinutes:50,breakMinutes:8,longBreakMinutes:22,cycles:3,position:4,
      subjectId:'subject-analysis',projectId:null,checkpointId:null});
    expect(result).toMatchObject({actionNo:null,record:{label:'Long proof session',
      mode:'flowtime',focusMinutes:50,breakMinutes:8,longBreakMinutes:22,
      cycles:3,position:4,version:1,archivedAt:null}});
    const id=result.record.id;
    result.record.label='Tampered';
    expect((await first.getPreset(id))?.label).toBe('Long proof session');
    const second=createDemoPresetApi();
    expect(await second.getPreset(id)).toMatchObject({label:'Long proof session',version:1});
    expect((await second.listPresets({archived:'all'})).total).toBe(5);
    expect(await second.getPreset('not-found')).toBeNull();
  });

  it('keeps deterministic bounded pages with an exact total after 60 writes',async()=>{
    const api=createDemoPresetApi();
    for(let i=0;i<60;i++)await api.createPreset({label:'Extra '+i,position:i+4});
    const ids:string[]=[];
    let cursor:string|null=null;
    for(let page=0;page<8;page++){
      const result=await api.listPresets({limit:10,cursor});
      expect(result.items.length).toBeLessThanOrEqual(10);
      expect(result.total).toBe(63);
      ids.push(...result.items.map(x=>x.id));
      cursor=result.nextCursor;
      if(cursor===null)break;
      expect(cursor).not.toContain(result.items.at(-1)!.id);
    }
    expect(ids).toHaveLength(63);
    expect(new Set(ids).size).toBe(63);
    expect(ids.slice(0,3)).toEqual(['demo-preset-1','demo-preset-2','demo-preset-3']);
  });

  it('rejects malformed, cross-filter and out-of-bounds cursors before reading',async()=>{
    const api=createDemoPresetApi();
    await expect(api.listPresets({limit:0})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({limit:1.5})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({archived:'gone' as never})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listPresets({cursor:'bad!'})).rejects.toMatchObject({code:'invalid'});
    const page=await api.listPresets({limit:1});
    await expect(api.listPresets({archived:'archived',cursor:page.nextCursor})).rejects.toMatchObject({code:'invalid'});
    expect((await api.listPresets({limit:1,cursor:page.nextCursor})).items[0].id).toBe('demo-preset-2');
  });

  it('version-guards update and reordering across instances; clearing links retains null',async()=>{
    const first=createDemoPresetApi(),second=createDemoPresetApi();
    const updated=await first.updatePreset('demo-preset-1',1,{
      label:'Revised proof session',subjectId:null,checkpointId:'checkpoint-proof',
    });
    expect(updated).toMatchObject({actionNo:null,record:{
      label:'Revised proof session',subjectId:null,checkpointId:'checkpoint-proof',version:2}});
    await expect(second.updatePreset('demo-preset-1',1,{label:'Stale edit'}))
      .rejects.toMatchObject({code:'conflict'});
    await expect(second.archivePreset('demo-preset-1',1)).rejects.toMatchObject({code:'conflict'});
    const moved=await second.reorderPreset('demo-preset-1',2,7);
    expect(moved.record).toMatchObject({position:7,version:3});
    expect((await createDemoPresetApi().getPreset('demo-preset-1'))?.position).toBe(7);
  });

  it('archives/restores in place without losing links, labels or historical identity',async()=>{
    const api=createDemoPresetApi();
    const before=(await api.getPreset('demo-preset-2'))!;
    const archived=await api.archivePreset(before.id,before.version);
    expect(archived.record).toMatchObject({id:before.id,label:before.label,version:2,
      subjectId:before.subjectId});
    expect(archived.record.archivedAt).toBe(instant);
    expect((await api.listPresets()).total).toBe(2);
    expect((await api.listPresets({archived:'archived'})).total).toBe(2);
    await expect(api.archivePreset(before.id,2)).rejects.toMatchObject({code:'invalid'});
    const restored=await api.restorePreset(before.id,2);
    expect(restored.record).toMatchObject({id:before.id,archivedAt:null,version:3});
    expect((await createDemoPresetApi().listPresets()).total).toBe(3);
    await expect(api.restorePreset(before.id,3)).rejects.toMatchObject({code:'invalid'});
  });

  it('deletes only unreferenced presets; used ones must be archived',async()=>{
    const api=createDemoPresetApi({isReferenced:id=>id==='demo-preset-1'});
    await expect(api.deletePreset('demo-preset-1',1)).rejects.toMatchObject({code:'conflict'});
    expect((await api.getPreset('demo-preset-1'))?.version).toBe(1);
    await api.archivePreset('demo-preset-1',1);
    await expect(api.deletePreset('demo-preset-1',2)).rejects.toMatchObject({code:'conflict'});
    const removed=await api.deletePreset('demo-preset-2',1);
    expect(removed).toEqual({record:{id:'demo-preset-2'},actionNo:null});
    expect(await createDemoPresetApi().getPreset('demo-preset-2')).toBeNull();
    await expect(api.deletePreset('demo-preset-2',1)).rejects.toMatchObject({code:'not_found'});
  });

  it('invalid payloads never change the persisted state or allow an owner field',async()=>{
    const api=createDemoPresetApi();
    const before=await api.listPresets({archived:'all'});
    for(const input of [
      {label:''},{label:'X'.repeat(121)},{label:'Bad',mode:'unknown'},
      {label:'Bad',focusMinutes:0},{label:'Bad',cycles:0},
      {label:'Bad',breakMinutes:2.5},{label:'Bad',longBreakMinutes:-1},
      {label:'Bad',position:-1},{label:'Bad',subjectId:''},
      {label:'Bad',user_id:'another-owner'},
    ])await expect(api.createPreset(input as never)).rejects.toMatchObject({code:'invalid'});
    await expect(api.updatePreset('demo-preset-1',1,{})).rejects.toMatchObject({code:'invalid'});
    await expect(api.updatePreset('demo-preset-1',1,{position:1} as never)).rejects.toMatchObject({code:'invalid'});
    await expect(api.reorderPreset('demo-preset-1',1,-1)).rejects.toMatchObject({code:'invalid'});
    await expect(api.archivePreset('demo-preset-1',0)).rejects.toMatchObject({code:'invalid'});
    expect(await api.listPresets({archived:'all'})).toEqual(before);
  });

  it('recovers from corrupt storage, and test injection avoids a shadow store',async()=>{
    sessionStorage.setItem(key,'{not valid JSON');
    expect((await createDemoPresetApi().listPresets()).total).toBe(3);
    sessionStorage.setItem(key,JSON.stringify({schema:10,presets:[]}));
    expect((await createDemoPresetApi().listPresets()).total).toBe(3);
    const fake=createDemoPresetApi();
    setPresetApiForTests(fake);
    // Mode is demo while the test API is injected, not a live service session.
    sessionStorage.setItem('lemma.demo','1');
    expect(getPresetApi()).toBe(fake);
    setPresetApiForTests(null);
    expect((await getPresetApi().listPresets()).total).toBe(3);
  });
});
