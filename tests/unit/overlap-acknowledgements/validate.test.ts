import {describe,expect,it} from 'vitest';
import {overlapIsStale,validateNewOverlap,validateOverlapPatch,
  validateOverlapQuery,validateParticipants} from
  '../../../src/data/overlap-acknowledgements/validate';
import type {NewOverlapAcknowledgement} from
  '../../../src/data/overlap-acknowledgements/contract';

const a='11111111-1111-1111-1111-111111111111';
const b='22222222-2222-2222-2222-222222222222';
const c='33333333-3333-3333-3333-333333333333';
const participants=[
  {kind:'block' as const,id:a,version:2},
  {kind:'entry' as const,id:b,version:3},
];
const input:NewOverlapAcknowledgement={
  participants,startsAt:'2026-11-07T10:00:00+05:30',
  endsAt:'2026-11-07T10:30:00+05:30',reason:'Both planned',
  disposition:'keep_both',
};

describe('N61.1 typed overlap acknowledgements',()=>{
  it('validates and copies owner-free keep-both inputs with absolute instants',()=>{
    const result=validateNewOverlap(input);
    expect(result).toEqual({
      participants,startsAt:'2026-11-07T04:30:00.000Z',
      endsAt:'2026-11-07T05:00:00.000Z',
      reason:'Both planned',disposition:'keep_both',attributedTo:null,
    });
    result.participants[0].version=999;
    expect(input.participants[0].version).toBe(2);
    expect(validateNewOverlap({...input,reason:undefined}).reason).toBeNull();
  });
  it('requires attribution to exactly one participant, not a caller-supplied owner',()=>{
    const attributed={...input,disposition:'attribute_to' as const,
      attributedTo:{kind:'entry' as const,id:b}};
    expect(validateNewOverlap(attributed).attributedTo).toEqual({kind:'entry',id:b});
    expect(()=>validateNewOverlap({...attributed,attributedTo:{kind:'block',id:c}}))
      .toThrow(/Attribution/);
    expect(()=>validateNewOverlap({...attributed,attributedTo:null})).toThrow();
    expect(()=>validateNewOverlap({...input,attributedTo:{kind:'block',id:a}}))
      .toThrow();
    expect(()=>validateNewOverlap({...input,userId:a} as never)).toThrow();
    expect(()=>validateNewOverlap({...input,source:'mcp'} as never)).toThrow();
    expect(()=>validateNewOverlap({...input,version:1} as never)).toThrow();
    expect(()=>validateNewOverlap({...attributed,
      attributedTo:{kind:'entry',id:b,version:3}} as never)).toThrow();
  });
  it('enforces SQL participant cardinality, int32 versions and unique kind+UUID',()=>{
    expect(()=>validateParticipants([participants[0]])).toThrow();
    expect(()=>validateParticipants(Array.from({length:11},(_,i)=>({
      kind:'block',id:a.slice(0,-12)+String(i).padStart(12,'0'),version:1
    })))).toThrow();
    expect(()=>validateParticipants([{kind:'block',id:a,version:1},
      {kind:'block',id:a.toUpperCase(),version:2}])).toThrow(/Duplicate/);
    expect(validateParticipants([{kind:'block',id:a,version:1},
      {kind:'entry',id:a,version:1}])).toHaveLength(2);
    for(const version of [0,-1,2.5,2147483648,Infinity,NaN]){
      expect(()=>validateParticipants([{kind:'block',id:a,version},participants[1]]))
        .toThrow();
    }
    expect(()=>validateParticipants([{kind:'task',id:a,version:1},
      participants[1]])).toThrow();
    expect(()=>validateParticipants([{kind:'block',id:'not-uuid',version:1},
      participants[1]])).toThrow();
    expect(()=>validateParticipants([{kind:'block',id:a,version:1,userId:a},
      participants[1]])).toThrow();
  });
  it('rejects invalid times, reversed intervals, naive time and oversized reason',()=>{
    for(const startsAt of ['2026-02-30T10:00:00Z','2026-11-07T25:00:00Z',
      '2026-11-07T10:00:00','2026-11-07T10:00:00+25:00','bad']){
      expect(()=>validateNewOverlap({...input,startsAt})).toThrow();
    }
    expect(()=>validateNewOverlap({...input,endsAt:input.startsAt})).toThrow();
    expect(()=>validateNewOverlap({...input,endsAt:'2026-11-07T04:00:00Z'}))
      .toThrow();
    expect(()=>validateNewOverlap({...input,reason:'x'.repeat(601)})).toThrow();
    expect(validateNewOverlap({...input,reason:'✓'.repeat(600)}).reason)
      .toHaveLength(600);
    expect(()=>validateNewOverlap({...input,disposition:'other'} as never))
      .toThrow();
  });
  it('validates a patch against the full participant/attribution invariant',()=>{
    const attributed={...input,disposition:'attribute_to' as const,
      attributedTo:{kind:'entry' as const,id:b}};
    expect(validateOverlapPatch(attributed,{reason:'Changed'}))
      .toEqual({reason:'Changed'});
    expect(validateOverlapPatch(input,{disposition:'attribute_to',
      attributedTo:{kind:'block',id:a}}))
      .toEqual({disposition:'attribute_to',attributedTo:{kind:'block',id:a}});
    expect(()=>validateOverlapPatch(attributed,{participants:[
      participants[0],{kind:'entry',id:c,version:1}
    ]})).toThrow(/Attribution/);
    expect(()=>validateOverlapPatch(attributed,{disposition:'keep_both'})).toThrow();
    expect(()=>validateOverlapPatch(attributed,{disposition:'keep_both',
      attributedTo:null})).not.toThrow();
    expect(()=>validateOverlapPatch(input,{})).toThrow(/Empty/);
    expect(()=>validateOverlapPatch(input,{userId:a} as never)).toThrow();
    expect(()=>validateOverlapPatch(input,{source:'worker'} as never)).toThrow();
  });
  it('bounds query pages, time ranges, cursors and denies owner filters',()=>{
    expect(validateOverlapQuery({limit:50,stale:true,cursor:'Ab_19-'}))
      .toEqual({limit:50,stale:true,cursor:'Ab_19-'});
    expect(validateOverlapQuery({from:'2026-11-07T04:30:00Z',
      to:'2026-11-07T05:00:00Z'})).toEqual({
        from:'2026-11-07T04:30:00.000Z',to:'2026-11-07T05:00:00.000Z'
      });
    for(const limit of [0,51,-1,1.5,NaN]){
      expect(()=>validateOverlapQuery({limit})).toThrow();
    }
    expect(()=>validateOverlapQuery({stale:'yes'} as never)).toThrow();
    expect(()=>validateOverlapQuery({userId:a} as never)).toThrow();
    expect(()=>validateOverlapQuery({cursor:'bogus/cursor'})).toThrow();
    expect(()=>validateOverlapQuery({from:'2026-11-07T05:00:00Z',
      to:'2026-11-07T04:30:00Z'})).toThrow();
  });
  it('flags a changed or missing version without changing other acknowledgements',()=>{
    expect(overlapIsStale(participants,[...participants])).toBe(false);
    expect(overlapIsStale(participants,[participants[0],
      {...participants[1],version:4}])).toBe(true);
    expect(overlapIsStale(participants,[participants[0]])).toBe(true);
    expect(overlapIsStale(participants,[...participants,
      {kind:'block',id:c,version:1}])).toBe(false);
  });
});
