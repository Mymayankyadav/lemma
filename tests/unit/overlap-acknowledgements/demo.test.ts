import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoOverlapAcknowledgementApi} from '../../../src/data/overlap-acknowledgements/demo';
import type {
  NewOverlapAcknowledgement,OverlapAcknowledgementApi,OverlapParticipant
} from '../../../src/data/overlap-acknowledgements/contract';

function storage():Storage{
  const values=new Map<string,string>();
  return {
    get length(){return values.size;},
    clear(){values.clear();},
    getItem(k){return values.get(k)??null;},
    setItem(k,v){values.set(k,v);},
    removeItem(k){values.delete(k);},
    key(i){return [...values.keys()][i]??null;},
  };
}
const span={startsAt:'2026-11-06T09:15:00.000Z',endsAt:'2026-11-06T09:45:00.000Z'};
const participants:OverlapParticipant[]=[
  {kind:'block',id:'demo-block-1',version:1},
  {kind:'entry',id:'demo-entry-1',version:2},
];
const newer:OverlapParticipant[]=[
  {kind:'block',id:'demo-block-1',version:2},
  {kind:'entry',id:'demo-entry-1',version:2},
];
const newRecord:NewOverlapAcknowledgement={
  startsAt:'2026-11-06T14:00:00+05:30',endsAt:'2026-11-06T14:30:00+05:30',
  participants,
  disposition:{kind:'attribute_to',participant:{kind:'entry',id:'demo-entry-1'}},
  reason:'Focus already covers this time',
};
let tab:Storage;
let api:OverlapAcknowledgementApi;
beforeEach(()=>{
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  tab=storage();
  api=createDemoOverlapAcknowledgementApi({storage:tab});
});
afterEach(()=>vi.useRealTimers());

describe('N61.1 owner-confined demo overlap acknowledgements',()=>{
  it('seeds two distinct conflicts and provides exact-total, keyset-bounded pages',async()=>{
    const page=await api.listAcknowledgements({limit:1});
    expect(page.total).toBe(2);
    expect(page.items[0].acknowledgement.id).toBe('demo-overlap-1');
    expect(page.items[0].stale).toBeNull();
    expect(page.nextCursor).toBeTruthy();
    const second=await api.listAcknowledgements({limit:1,cursor:page.nextCursor});
    expect(second.items[0].acknowledgement.id).toBe('demo-overlap-2');
    expect(second.nextCursor).toBeNull();
    expect(second.total).toBe(2);
    await expect(api.listAcknowledgements({limit:51})).rejects.toMatchObject({code:'invalid'});
    await expect(api.listAcknowledgements({cursor:'not-base64'})).rejects.toMatchObject({code:'invalid'});
  });

  it('applies an acknowledgement only to identical participants and the exact half-open window',async()=>{
    expect(await api.findApplicableOverlap({...span,participants}))
      .toMatchObject({id:'demo-overlap-1',reason:expect.any(String)});
    expect(await api.findApplicableOverlap({...span,participants:newer})).toBeNull();
    expect(await api.findApplicableOverlap({...span,
      participants:[participants[0],{kind:'entry',id:'other-entry',version:2}]})).toBeNull();
    expect(await api.findApplicableOverlap({...span,
      endsAt:'2026-11-06T09:46:00.000Z',participants})).toBeNull();
    const fresh=await api.getAcknowledgement('demo-overlap-1',participants);
    const stale=await api.getAcknowledgement('demo-overlap-1',newer);
    expect(fresh?.stale).toBe(false);
    expect(stale?.stale).toBe(true);
    expect((await api.listAcknowledgements({currentParticipants:newer})).items[0].stale).toBe(true);
    expect(await api.getAcknowledgement('missing')).toBeNull();
  });

  it('persists normalized instants, attribution and edits across adapter reloads',async()=>{
    const created=await api.createAcknowledgement(newRecord);
    expect(created.actionNo).toBeNull();
    expect(created.record).toMatchObject({
      startsAt:'2026-11-06T08:30:00.000Z',endsAt:'2026-11-06T09:00:00.000Z',
      version:1,source:'app',reason:'Focus already covers this time',
    });
    created.record.reason='tampered';
    const reloaded=createDemoOverlapAcknowledgementApi({storage:tab});
    expect((await reloaded.getAcknowledgement(created.record.id))?.acknowledgement.reason)
      .toBe('Focus already covers this time');
    const changed=await reloaded.updateAcknowledgement(created.record.id,1,{
      reason:null,disposition:{kind:'keep_both'},
    });
    expect(changed.record).toMatchObject({version:2,reason:null,disposition:{kind:'keep_both'}});
    expect((await createDemoOverlapAcknowledgementApi({storage:tab})
      .getAcknowledgement(created.record.id))?.acknowledgement.version).toBe(2);
    await expect(api.updateAcknowledgement(created.record.id,1,{reason:'stale'}))
      .rejects.toMatchObject({code:'conflict'});
  });

  it('rejects duplicate conflicts but permits another window with the same participants',async()=>{
    await expect(api.createAcknowledgement({...span,participants,
      disposition:{kind:'keep_both'}})).rejects.toMatchObject({code:'conflict'});
    const created=await api.createAcknowledgement({
      ...span,endsAt:'2026-11-06T09:46:00.000Z',participants,
      disposition:{kind:'keep_both'},
    });
    expect((await api.listAcknowledgements()).total).toBe(3);
    expect(await api.findApplicableOverlap({...span,participants})).toMatchObject({id:'demo-overlap-1'});
    expect(await api.findApplicableOverlap({
      ...span,endsAt:'2026-11-06T09:46:00.000Z',participants,
    })).toMatchObject({id:created.record.id});
  });

  it('does not accept invalid spans, duplicate or unknown participants, or forged owner fields',async()=>{
    await expect(api.createAcknowledgement({...newRecord,endsAt:newRecord.startsAt}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...newRecord,startsAt:'2026-11-06T09:00:00'}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...newRecord,participants:[participants[0],participants[0]]}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...newRecord,
      disposition:{kind:'attribute_to',participant:{kind:'block',id:'unrelated'}}}))
      .rejects.toMatchObject({code:'invalid'});
    await expect(api.createAcknowledgement({...newRecord,userId:'other-user'} as never))
      .rejects.toMatchObject({code:'invalid'});
    expect((await api.listAcknowledgements()).total).toBe(2);
  });

  it('enforces optimistic versions for edits/deletes and never silently hides later conflicts',async()=>{
    await expect(api.deleteAcknowledgement('demo-overlap-1',9))
      .rejects.toMatchObject({code:'conflict'});
    const before=await api.getAcknowledgement('demo-overlap-1');
    await expect(api.updateAcknowledgement('demo-overlap-1',1,{
      participants:newer,disposition:{kind:'attribute_to',participant:{kind:'entry',id:'missing'}},
    })).rejects.toMatchObject({code:'invalid'});
    expect(await api.getAcknowledgement('demo-overlap-1')).toEqual(before);
    const edited=await api.updateAcknowledgement('demo-overlap-1',1,{participants:newer});
    expect(edited.record.version).toBe(2);
    expect(await api.findApplicableOverlap({...span,participants})).toBeNull();
    expect(await api.findApplicableOverlap({...span,participants:newer}))
      .toMatchObject({id:'demo-overlap-1'});
    await expect(api.deleteAcknowledgement('demo-overlap-1',1))
      .rejects.toMatchObject({code:'conflict'});
    const deleted=await api.deleteAcknowledgement('demo-overlap-1',2);
    expect(deleted).toEqual({record:{id:'demo-overlap-1'},actionNo:null});
    expect((await createDemoOverlapAcknowledgementApi({storage:tab}).listAcknowledgements()).total).toBe(1);
  });

  it('isolates invalid stored records rather than treating corrupted bytes as actual acknowledgements',async()=>{
    tab.setItem('lemma.v6.demo.overlap-acknowledgements.v1',
      JSON.stringify({schema:1,records:[{id:'untrusted'}]}));
    const reloaded=createDemoOverlapAcknowledgementApi({storage:tab});
    expect((await reloaded.listAcknowledgements()).total).toBe(2);
    expect(await reloaded.getAcknowledgement('untrusted')).toBeNull();
  });
});
