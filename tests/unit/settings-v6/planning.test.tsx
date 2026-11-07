import {describe,expect,it} from 'vitest';
import {validateFocusValues,validateReviewBudgetValues} from
 '../../../src/features/settings/v6/Focus';

const form=()=>({
 mode:'flowtime',focusMinutes:'45',breakMinutes:'6',
 longBreakMinutes:'20',cycles:'3',flowtimeBreakRatio:'0.25',
 longSessionGuardMinutes:'180',cards:'35',minutes:'40',
 reserveInPlans:'true',
});
describe('N79 typed Focus and Review Budget preferences (partial item)',()=>{
 it('maps exact N39 JSON field names and whole-minute values',()=>{
  expect(validateFocusValues(form())).toEqual({
   mode:'flowtime',focus_minutes:45,break_minutes:6,long_break_minutes:20,
   cycles:3,flowtime_break_ratio:0.25,long_session_guard_minutes:180,
  });
  expect(validateReviewBudgetValues(form())).toEqual({
   cards:35,minutes:40,reserve_in_plans:true,
  });
 });
 it('refuses out-of-range or fractional timing before saving',()=>{
  for(const [key,value] of [
   ['focusMinutes','0'],['focusMinutes','481'],['focusMinutes','2.5'],
   ['cycles','25'],['longSessionGuardMinutes','29'],
   ['flowtimeBreakRatio','0'],['flowtimeBreakRatio','1.01'],
   ['mode','unknown'],
  ]){
   expect(()=>validateFocusValues({...form(),[key]:value}),key+' '+value).toThrow();
  }
  expect(()=>validateReviewBudgetValues({...form(),cards:'2001'})).toThrow();
  expect(()=>validateReviewBudgetValues({...form(),minutes:'0.5'})).toThrow();
 });
});
