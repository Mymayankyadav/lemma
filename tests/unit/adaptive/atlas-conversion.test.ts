import {describe,expect,it} from 'vitest';
import {validateConversion} from '../../../supabase/functions/_shared/adaptive/convert';

const cp=(id:string,over:Record<string,unknown>={})=>({id,title:'Unit '+id,objective:'Understand '+id,criterion:{text:'Prove something novel',concept_id:'k1',facet:'use',kind:'holdout',novel:true,cued:[]},kind:'learn',tier:'core',estimate:60,
 kcs:[{id:'k1',kind:'definition',home:'Topic'}],steps:['Read','Practise','Close'],prereqs:[],stage:1,teach:['Definitions'],practice:[1,2,3].map(i=>({text:'Practice '+i,concept_id:'k1',facet:'use'})),close:{questions:['a','b','c'],minutes:8},card_plan:[],...over});
const input={project:{},checkpoints:[{id:'c1',status:'not_started',kind:'learn',steps:['x']}],concepts:[{id:'existing',name:'Compactness'}],cards:[{id:'n1',reps:0}]};
const conversion=(over:Record<string,unknown>={})=>({schema:'plan_template_v1',checkpoints:[cp('c1')],map:{c1:{id:'c1'}},kcs:[{id:'k1',name:'Hausdorff',kind:'definition',home:'Topic'}],cards:[{id:'n1',action:'keep',reason:'fine'}],...over});

describe('N179 conversion validation (key resolution and card decisions)',()=>{
 it('accepts a conversion whose template KCs are declared keys',()=>{expect(validateConversion(input,conversion())).toEqual([]);});
 it('accepts a template KC that names an existing concept id',()=>{
  const c=conversion({checkpoints:[cp('c1',{kcs:[{id:'existing',kind:'definition',home:'Topic'}]})]});
  expect(validateConversion(input,c)).toEqual([]);
 });
 it('rejects a template KC that is neither a declared key nor an existing concept',()=>{
  const errors=validateConversion(input,conversion({checkpoints:[cp('c1',{kcs:[{id:'ghost',kind:'definition',home:'Topic'}]})]}));
  expect(errors.some(e=>/unknown KC ghost/.test(e))).toBe(true);
 });
 it('requires every existing card to have a decision and every KC a name and kind',()=>{
  expect(validateConversion(input,conversion({cards:[]}))).toContain('Missing card decision n1');
  expect(validateConversion(input,conversion({kcs:[{id:'k1',name:'',kind:'definition'}]}))).toContain('Every KC needs a name and a kind');
 });
 it('still requires an existing concept to be reused by id',()=>{
  expect(validateConversion(input,conversion({kcs:[{id:'k1',name:'compactness',kind:'definition'}]})).some(e=>/Reuse existing concept existing/.test(e))).toBe(true);
 });
});
