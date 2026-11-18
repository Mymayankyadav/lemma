import {describe,expect,it} from 'vitest';
import {bridgeCounts,bridgeStrength} from '../../../supabase/functions/_shared/adaptive/links';

const concepts=[{id:'A',subject_id:'s1'},{id:'B',subject_id:'s2'},{id:'C',subject_id:'s1'}];
const att=(id:number,tags:any[],over:any={})=>({id,tags,cued:[],...over});
describe('06 §5 bridge opportunities and uses',()=>{
 it('counts uncued attempts in another subject whose solution uses A; u is the unprompted correct ones',()=>{
  const attempts=[
   att(1,[{concept_id:'B',role:'target'},{concept_id:'A',role:'required',result:'ok'}]),          // opportunity, used
   att(2,[{concept_id:'B',role:'target'},{concept_id:'A',role:'incidental',result:'fail'}]),      // opportunity, not used
   att(3,[{concept_id:'C',role:'target'},{concept_id:'A',role:'required',result:'ok'}]),          // same subject: not a bridge
   att(4,[{concept_id:'B',role:'target'},{concept_id:'A',role:'required',result:'ok'}],{cued:['A']}), // cued: excluded
   att(5,[{concept_id:'B',role:'target'},{concept_id:'A',role:'required',result:'ok'}],{voided_at:'2026-11-01T00:00:00Z'}),
   att(6,[{concept_id:'B',role:'target'}]),                                                       // A not used
  ];
  expect(bridgeCounts({attempts},concepts,'A')).toEqual({o:2,u:1});
 });
 it('reads tags from the fact table too, and yields a dashed bridge when there is no opportunity',()=>{
  const attempts=[att(7,undefined as any)],tags=[{attempt_id:7,concept_id:'B',role:'target'},{attempt_id:7,concept_id:'A',role:'required',result:'ok'}];
  expect(bridgeCounts({attempts,tags},concepts,'A')).toEqual({o:1,u:1});
  expect(bridgeStrength(...Object.values(bridgeCounts({attempts:[]},concepts,'A')) as [number,number]).dashed).toBe(true);
 });
 it('feeds the thick/thin rule: three uses in three opportunities is thick',()=>{
  const attempts=[1,2,3].map(i=>att(i,[{concept_id:'B',role:'target'},{concept_id:'A',role:'required',result:'ok'}])),c=bridgeCounts({attempts},concepts,'A');
  expect(bridgeStrength(c.o,c.u)).toMatchObject({thick:true,dashed:false,o:3,u:3});
 });
});
