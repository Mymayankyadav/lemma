import {describe,expect,it} from 'vitest';
import {applyStudyEventPatch,studyEventId,studyEventInstant,studyEventVersion,
 studyEventVoidedAt,validateNewStudyEvent,validateStudyEventPatch,
 validateStudyEventQuery} from '../../../src/data/study-events/model';

const entry='11111111-1111-4111-8111-111111111111';
const related='22222222-2222-4222-8222-222222222222';
const occurred='2026-11-07T13:30:00+05:30';

describe('N64.1 typed, owner-safe study-event inputs',()=>{
 it('normalizes true absolute instants while retaining notice and urge contents',()=>{
  expect(validateNewStudyEvent({entryId:entry,kind:'notice',occurredAt:occurred,
   note:'Noticed a useful question'})).toEqual({
    entryId:entry,kind:'notice',occurredAt:'2026-11-07T08:00:00.000Z',
    note:'Noticed a useful question'});
  expect(validateNewStudyEvent({entryId:entry,kind:'urge',note:null})).toEqual({
   entryId:entry,kind:'urge',note:null});
 });
 it('rejects nonexistent civil dates, naive or infinite timestamps and offsets beyond UTC+14',()=>{
  for(const instant of ['infinity','2026-11-07T13:30:00','2026-02-30T08:00:00Z',
   '2025-02-29T08:00:00Z','2026-13-02T08:00:00Z',
   '2026-11-07T08:00:60Z','2026-11-07T08:00:00+14:30',
   '2026-11-07T08:00:00+15:00','2026-11-07T08:00:00Zjunk']){
   expect(()=>studyEventInstant(instant)).toThrow();
  }
  expect(studyEventInstant('2028-02-29T08:00:00Z')).toBe('2028-02-29T08:00:00.000Z');
  expect(studyEventInstant('2026-11-07T08:00:00-04:00')).toBe('2026-11-07T12:00:00.000Z');
 });
 it('accepts positive drift duration and refuses durations on notice or urge',()=>{
  expect(validateNewStudyEvent({entryId:entry,kind:'drift',durationMinutes:17}))
   .toMatchObject({kind:'drift',durationMinutes:17});
  for(const n of [0,-1,1.5,100001,NaN,Infinity])
   expect(()=>validateNewStudyEvent({entryId:entry,kind:'drift',durationMinutes:n})).toThrow();
  for(const kind of ['notice','urge'] as const)
   expect(()=>validateNewStudyEvent({entryId:entry,kind,durationMinutes:3})).toThrow();
  expect(validateNewStudyEvent({entryId:entry,kind:'notice',durationMinutes:null}))
   .toMatchObject({durationMinutes:null});
 });
 it('requires related kind and UUID as a matched optional pair',()=>{
  expect(validateNewStudyEvent({entryId:entry,kind:'notice',relatedKind:'task',relatedId:related}))
   .toMatchObject({relatedKind:'task',relatedId:related});
  expect(validateNewStudyEvent({entryId:entry,kind:'urge',relatedKind:null,relatedId:null}))
   .toMatchObject({relatedKind:null,relatedId:null});
  for(const invalid of [
   {relatedKind:'task'},
   {relatedId:related},
   {relatedKind:'task',relatedId:null},
   {relatedKind:null,relatedId:related},
   {relatedKind:'owner',relatedId:related},
   {relatedKind:'study_entry',relatedId:'fake'},
  ])expect(()=>validateNewStudyEvent({entryId:entry,kind:'urge',...invalid} as never)).toThrow();
 });
 it('rejects owner spoofing, source, void, version and unknown fields on every edit path',()=>{
  for(const extra of ['userId','user_id','source','voidedAt','version','actionNo','related_id']){
   expect(()=>validateNewStudyEvent({entryId:entry,kind:'notice',[extra]:'forged'} as never)).toThrow();
   expect(()=>validateStudyEventPatch({note:'fine',[extra]:'forged'} as never)).toThrow();
  }
  expect(()=>validateStudyEventPatch({})).toThrow();
  expect(()=>validateStudyEventPatch({relatedKind:'task'})).toThrow();
  expect(validateStudyEventPatch({note:'  meaningful  ',durationMinutes:null}))
   .toEqual({note:'  meaningful  ',durationMinutes:null});
 });
 it('rechecks partial edits against the stored row so a kind change cannot strand drift minutes',()=>{
  const current={entryId:entry,kind:'drift' as const,durationMinutes:20,
   note:null,relatedKind:null,relatedId:null};
  expect(()=>applyStudyEventPatch(current,{kind:'urge'})).toThrow();
  expect(applyStudyEventPatch(current,{kind:'urge',durationMinutes:null}))
   .toMatchObject({kind:'urge',durationMinutes:null});
  expect(applyStudyEventPatch(current,{durationMinutes:30}))
   .toMatchObject({kind:'drift',durationMinutes:30});
  expect(()=>applyStudyEventPatch({...current,kind:'notice',durationMinutes:null},
   {durationMinutes:1})).toThrow();
 });
 it('limits notes to 2000 Unicode characters without trimming user content',()=>{
  expect(validateNewStudyEvent({entryId:entry,kind:'notice',note:'😀'.repeat(2000)}).note)
   .toBe('😀'.repeat(2000));
  expect(()=>validateNewStudyEvent({entryId:entry,kind:'notice',note:'😀'.repeat(2001)})).toThrow();
  expect(()=>validateStudyEventPatch({note:7} as never)).toThrow();
 });
 it('requires positive database versions and real UUIDs',()=>{
  expect(studyEventId(entry)).toBe(entry);
  expect(studyEventVersion(2147483647)).toBe(2147483647);
  for(const bad of [0,-1,1.2,2147483648,NaN,Infinity])
   expect(()=>studyEventVersion(bad)).toThrow();
  expect(()=>studyEventId('demo-foreign-owner')).toThrow();
 });
 it('models void/restore transitions without a browser-controlled voidedAt patch',()=>{
  const voided=studyEventVoidedAt(null,'void',occurred);
  expect(voided).toBe('2026-11-07T08:00:00.000Z');
  expect(studyEventVoidedAt(voided,'restore')).toBeNull();
  expect(()=>studyEventVoidedAt(null,'restore')).toThrow();
  expect(()=>studyEventVoidedAt(voided,'void',occurred)).toThrow();
  expect(()=>studyEventVoidedAt(null,'void','yesterday')).toThrow();
 });
 it('validates exact 1–50 pages and refuses owner filters, bad cursors and duplicate kinds',()=>{
  expect(validateStudyEventQuery({limit:50,entryId:entry,
   kind:['notice','drift'],includeVoided:true})).toMatchObject({
    limit:50,entryId:entry,kind:['notice','drift'],includeVoided:true});
  expect(validateStudyEventQuery()).toEqual({limit:20,includeVoided:false});
  for(const limit of [0,51,2.5,-1,NaN,Infinity])
   expect(()=>validateStudyEventQuery({limit})).toThrow();
  for(const query of [{userId:'owner'}, {kind:['notice','notice']},
   {kind:['fake']},{entryId:'not-an-id'},{includeVoided:'no'},
   {cursor:'<wrong>'},{cursor:'x'.repeat(1025)}])
   expect(()=>validateStudyEventQuery(query as never)).toThrow();
  const opts={kind:['notice'] as const};
  const original=validateStudyEventQuery({kind:[...opts.kind]});
  expect(original.kind).not.toBe(opts.kind);
 });
});
