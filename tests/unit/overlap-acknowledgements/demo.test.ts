import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoOverlapApi} from '../../../src/data/overlap-acknowledgements/demo';
import {getStudyApi,setStudyApiForTests} from '../../../src/data/study';
import type {NewOverlapAcknowledgement,OverlapParticipant} from
  '../../../src/data/overlap-acknowledgements/contract';

const KEY='lemma.v6.demo.overlap-acknowledgements.v1';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const first='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input:NewOverlapAcknowledgement={
  participants:[{kind:'block',id:a,version:1},{kind:'entry',id:b,version:1}],
  startsAt:'2026-11-08T10:00:00Z',endsAt:'2026-11-08T10:30:00Z',
  disposition:'keep_both',reason:'Two commitments',
};
let current:OverlapParticipant[];
function resolver() {
  return vi.fn(async (row:{participants:OverlapParticipant[]})=>
    row.participants.flatMap(p=>current.filter(c=>c.kind===p.kind&&c.id===p.id)));
}
beforeEach(()=>{
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  current=[{kind:'block',id:a,version:1},{kind:'entry',id:b,version:1},
    {kind:'block',id:c,version:1}];
});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers()});

describe('N61.2.1 owner-scoped demo overlap acknowledgements',()=>{

  it('seeds real owner-visible overlaps through the default study resolver and detects edits',async()=>{
    // This is the production default resolver, not the injected matching fake.
    const previous=window.location.href;
    window.history.replaceState({},'', '?demo=1');
    setStudyApiForTests(null);
    try{
      const api=createDemoOverlapApi();
      const initial=await api.listAcknowledgements();
      expect(initial.items).toHaveLength(2);
      expect(initial.items.map(r=>r.disposition))
        .toEqual(['keep_both','attribute_to']);
      expect(initial.items.map(r=>r.stale)).toEqual([false,false]);
      const study=getStudyApi();
      for(const ack of initial.items){
        const visible=await study.listCalendarBlocks({
          start:ack.startsAt,end:ack.endsAt,
        });
        const block=ack.participants.find(p=>p.kind==='block')!;
        expect(visible.some(b=>b.id===block.id&&b.version===block.version))
          .toBe(true);
        const entries=await study.listStudyEntries({
          start:ack.startsAt,end:ack.endsAt,
        });
        const entry=ack.participants.find(p=>p.kind==='entry')!;
        expect(entries.some(e=>e.id===entry.id&&e.version===entry.version))
          .toBe(true);
      }
      const first=initial.items[0],block=first.participants.find(p=>p.kind==='block')!;
      await study.updateCalendarBlock(block.id,block.version,{title:'Changed plan'});
      expect((await api.getAcknowledgement(first.id))?.stale).toBe(true);
      expect((await api.getAcknowledgement(initial.items[1].id))?.stale).toBe(false);
      expect((await createDemoOverlapApi().getAcknowledgement(first.id))?.stale)
        .toBe(true);
      expect(sessionStorage.getItem(KEY)).not.toContain('"stale"');
      // Reset only overlap storage: existing study blocks must be reused.
      const allRange={start:new Date(Date.now()-14*86400_000).toISOString(),
        end:new Date(Date.now()+14*86400_000).toISOString()};
      const before=(await study.listCalendarBlocks(allRange)).length;
      sessionStorage.removeItem(KEY);
      const regenerated=await createDemoOverlapApi().listAcknowledgements();
      expect(regenerated.items.every(r=>!r.stale)).toBe(true);
      expect((await study.listCalendarBlocks(allRange)).length).toBe(before);
    }finally{
      setStudyApiForTests(null);
      window.history.replaceState({},'',previous);
    }
  });

  it('seeds two distinct block/entry overlaps and computes current staleness',async()=>{
    const resolve=resolver(),api=createDemoOverlapApi(resolve);
    const all=await api.listAcknowledgements();
    expect(api.mode).toBe('demo');
    expect(all).toMatchObject({total:2,nextCursor:null});
    expect(all.items.map(a=>a.id)).toEqual([first,second]);
    expect(all.items.map(a=>a.stale)).toEqual([false,false]);
    expect(all.items[0]).toMatchObject({version:1,source:'app',
      disposition:'keep_both',attributedTo:null});
    expect(all.items[1]).toMatchObject({disposition:'attribute_to',
      attributedTo:{kind:'block',id:c}});
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(await api.getAcknowledgement('ffffffff-ffff-4fff-8fff-ffffffffffff'))
      .toBeNull();
  });
  it('creates an immutable normalized receipt without accepting caller ownership',async()=>{
    const api=createDemoOverlapApi(resolver());
    const created=await api.createAcknowledgement(input);
    expect(created.actionNo).toBeNull();
    expect(created.record).toMatchObject({version:1,source:'app',
      startsAt:'2026-11-08T10:00:00.000Z',stale:false});
    expect(created.record).not.toHaveProperty('userId');
    const id=created.record.id;
    input.participants[0].version=55;
    created.record.participants[1].version=99;
    expect((await api.getAcknowledgement(id))?.participants.map(p=>p.version))
      .toEqual([1,1]);
    input.participants[0].version=1;
    await expect(api.createAcknowledgement({...input,userId:a} as never))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...input,source:'mcp'} as never))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...input,participants:[
      {kind:'block',id:a,version:7},{kind:'entry',id:b,version:1}]}))
      .rejects.toMatchObject({code:'conflict'});
  });
  it('persists create/edit/delete across adapters and detects stale optimistic versions',async()=>{
    const firstApi=createDemoOverlapApi(resolver());
    const secondApi=createDemoOverlapApi(resolver());
    const created=(await firstApi.createAcknowledgement(input)).record;
    const updated=await secondApi.updateAcknowledgement(created.id,1,
      {reason:'Rescheduled'});
    expect(updated).toMatchObject({actionNo:null,record:{
      reason:'Rescheduled',version:2,stale:false}});
    await expect(firstApi.updateAcknowledgement(created.id,1,{reason:'Lost'}))
      .rejects.toMatchObject({code:'conflict'});
    await expect(firstApi.deleteAcknowledgement(created.id,1))
      .rejects.toMatchObject({code:'conflict'});
    const reloaded=createDemoOverlapApi(resolver());
    expect((await reloaded.getAcknowledgement(created.id))?.reason)
      .toBe('Rescheduled');
    const deleted=await reloaded.deleteAcknowledgement(created.id,2);
    expect(deleted).toEqual({record:{id:created.id},actionNo:null});
    expect(await firstApi.getAcknowledgement(created.id)).toBeNull();
    expect((await createDemoOverlapApi(resolver()).listAcknowledgements()).total)
      .toBe(2);
  });
  it('rechecks participant versions on updates, and staleness is not persisted',async()=>{
    const api=createDemoOverlapApi(resolver());
    const row=(await api.createAcknowledgement(input)).record;
    current[0]={...current[0],version:2};
    expect((await api.getAcknowledgement(row.id))?.stale).toBe(true);
    expect((await api.listAcknowledgements({stale:true})).items.map(x=>x.id))
      .toContain(row.id);
    expect((await api.listAcknowledgements({stale:false})).items.map(x=>x.id))
      .not.toContain(row.id);
    await expect(api.updateAcknowledgement(row.id,1,{reason:'No longer current'}))
      .rejects.toMatchObject({code:'conflict'});
    const changed=await api.updateAcknowledgement(row.id,1,{
      participants:[{kind:'block',id:a,version:2},{kind:'entry',id:b,version:1}],
    });
    expect(changed.record.stale).toBe(false);
    expect(changed.record.version).toBe(2);
    expect(sessionStorage.getItem(KEY)).not.toContain('"stale"');
    current=current.filter(x=>x.id!==b);
    expect((await createDemoOverlapApi(resolver()).getAcknowledgement(row.id))?.stale)
      .toBe(true);
    // Cleanup of a stale acknowledgement remains possible.
    await expect(api.deleteAcknowledgement(row.id,2))
      .resolves.toMatchObject({record:{id:row.id}});
  });
  it('rejects unknown participants, empty edits, attribution mismatches and invalid versions',async()=>{
    const api=createDemoOverlapApi(resolver());
    await expect(api.createAcknowledgement({...input,participants:[
      {kind:'block',id:a,version:1},{kind:'entry',id:'not-a-uuid',version:1}]}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...input,participants:[
      {kind:'block',id:a,version:1},{kind:'entry',id:'44444444-4444-4444-8444-444444444444',version:1}]}))
      .rejects.toMatchObject({code:'conflict'});
    await expect(api.createAcknowledgement({...input,
      disposition:'attribute_to',attributedTo:{kind:'block',id:c}}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.updateAcknowledgement(first,1,{}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.updateAcknowledgement(first,0,{reason:'Invalid'}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.updateAcknowledgement(first,1,{userId:a} as never))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.updateAcknowledgement(first,1,{
      disposition:'attribute_to',attributedTo:{kind:'entry',id:b},
    })).resolves.toMatchObject({record:{version:2,
      attributedTo:{kind:'entry',id:b}}});
    await expect(api.updateAcknowledgement(first,2,{
      participants:[{kind:'block',id:a,version:1},{kind:'block',id:c,version:1}],
    })).rejects.toMatchObject({code:'invalid'});
    await expect(api.deleteAcknowledgement('not-an-id',1))
      .rejects.toMatchObject({code:'invalid'});
  });
  it('supports exact totals and stable keyset pages past fifty rows',async()=>{
    const api=createDemoOverlapApi(resolver());
    const begin=Date.parse('2026-11-08T00:00:00.000Z');
    for(let i=0;i<55;i++){
      const startsAt=new Date(begin+i*60_000).toISOString();
      const endsAt=new Date(begin+(i+1)*60_000).toISOString();
      await api.createAcknowledgement({...input,startsAt,endsAt,reason:'Overlap '+i});
    }
    const from='2026-11-08T00:00:00Z';
    const collected:string[]=[];let cursor:string|null=null;
    for(let n=0;n<15;n++){
      const page=await api.listAcknowledgements({from,limit:6,cursor});
      expect(page.total).toBe(55);
      collected.push(...page.items.map(r=>r.id));
      cursor=page.nextCursor;
      if(cursor===null)break;
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(collected).toHaveLength(55);
    expect(new Set(collected).size).toBe(55);
    const firstPage=await api.listAcknowledgements({from,limit:2});
    expect(firstPage.nextCursor).not.toBeNull();
    await expect(api.listAcknowledgements({from,
      stale:true,cursor:firstPage.nextCursor})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listAcknowledgements({cursor:'bad/cursor'}))
      .rejects.toMatchObject({code:'invalid'});
    for(const limit of [0,51,-1,2.5]){
      await expect(api.listAcknowledgements({limit}))
        .rejects.toMatchObject({code:'invalid'});
    }
    await expect(api.listAcknowledgements({userId:a} as never))
      .rejects.toMatchObject({code:'invalid'});
  });
  it('uses half-open overlap filters and separately filters stale records',async()=>{
    const api=createDemoOverlapApi(resolver());
    expect((await api.listAcknowledgements({to:'2026-11-07T09:00:00Z'})).total)
      .toBe(0);
    expect((await api.listAcknowledgements({from:'2026-11-07T09:30:00Z'})).total)
      .toBe(1);
    expect((await api.listAcknowledgements({from:'2026-11-07T09:01:00Z',
      to:'2026-11-07T09:29:00Z'})).total).toBe(1);
    current=current.filter(p=>p.id!==b);
    expect((await api.listAcknowledgements({stale:true})).total).toBe(1);
    expect((await api.listAcknowledgements({stale:false})).total).toBe(1);
    await expect(api.listAcknowledgements({from:'2026-11-07T11:00:00Z',
      to:'2026-11-07T09:00:00Z'})).rejects.toMatchObject({code:'invalid'});
  });
  it('fails closed on corrupted tab storage and never accepts persisted owners',async()=>{
    const api=createDemoOverlapApi(resolver());
    expect((await api.listAcknowledgements()).total).toBe(2);
    const parsed=JSON.parse(sessionStorage.getItem(KEY)!);
    parsed.rows[0].userId='forged';
    sessionStorage.setItem(KEY,JSON.stringify(parsed));
    const fresh=createDemoOverlapApi(resolver());
    expect((await fresh.listAcknowledgements()).total).toBe(2);
    expect(sessionStorage.getItem(KEY)).not.toContain('forged');
    sessionStorage.setItem(KEY,'{bad json');
    expect((await createDemoOverlapApi(resolver()).listAcknowledgements()).total)
      .toBe(2);
  });
});
