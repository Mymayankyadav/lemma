import {expect,it} from 'vitest'
import {fitPracticePolicy,eligiblePractice,NATIVE,intake} from '../../../supabase/functions/_shared/practice/router'
const scope={track:'algebra',bank:'B1',policy:'P1',rubric:'R1'},anchors=Array(12).fill(0)
const rows=Array.from({length:200},(_,i)=>({...scope,learner:'test'+i,arm:(i%2?'level80':'atlas80') as 'level80'|'atlas80',randomized:true,mature:true,
  anchors,transfer7:i%2?.72:.62,abandon_rate:.02,trigger_rate:.06,feedback_share:.03,idle_share:.02}))
it('matches the registered intake and requires 100 mature learners per compared arm in scope',()=>{
  expect([0,4,5,7,8,12].map(n=>intake(Array.from({length:12},(_,i)=>Number(i<n))))).toEqual(['0-4','0-4','5-7','5-7','8-12','8-12'])
  const cert=fitPracticePolicy(rows,scope,'2027-02-01')
  expect(cert.overall).toBe('level80');expect(eligiblePractice(anchors,cert,scope,'2027-01-01')).toBe('level80')
  expect(eligiblePractice(anchors,cert,{...scope,rubric:'R2'},'2027-01-01')).toBe(NATIVE)
  expect(eligiblePractice(anchors,cert,scope,'2027-02-02')).toBe(NATIVE)
  expect(eligiblePractice(anchors,null,scope,'2027-01-01')).toBe(NATIVE)
  expect(fitPracticePolicy(rows.slice(1),scope,'2027-02-01').overall).toBe(NATIVE)
  expect(()=>fitPracticePolicy([...rows,rows[0]],scope,'2027-02-01')).toThrow()
  expect(()=>fitPracticePolicy([{...rows[0],mature:false}],scope,'2027-02-01')).toThrow()
})
it('keeps the native policy when delayed performance does not improve or burden exceeds its cap',()=>{
  expect(fitPracticePolicy(rows.map(r=>({...r,transfer7:.63})),scope,'2027-02-01').overall).toBe(NATIVE)
  expect(fitPracticePolicy(rows.map(r=>({...r,idle_share:r.arm==='level80'?.20:.02})),scope,'2027-02-01').overall).toBe(NATIVE)
})
